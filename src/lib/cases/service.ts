import "server-only";
import { after } from "next/server";
import { readReply } from "@/lib/agent";
import { getBuildingSummary } from "@/lib/building";
import { daysBetween, nyDate, type IsoDate } from "@/lib/domain/dates";
import { estimateAbatement } from "@/lib/domain/estimate";
import { getIssueType } from "@/lib/domain/issues";
import { dueSummary, nextAction, type ReplyCategory, type StepId } from "@/lib/domain/ladder";
import { buildMessage, unfilledPlaceholders, type DraftMessage } from "@/lib/domain/templates";
import { isCaseCode } from "./ids";
import { computeMetrics, type Metrics } from "./metrics";
import {
  countEvents,
  countRepliesSince,
  type CaseScope,
  findBuildingByCode,
  findCaseByCode,
  findCaseByToken,
  findMessageWithCase,
  insertCase,
  insertMessage,
  listCasesWithMessages,
  listMessages,
  logEvent,
  updateCase,
  updateMessage,
  uploadCasePhotos,
} from "./repo";
import { draftWasEdited, firstReplyAfterNotice, readyOnFor, receivedAtFor } from "./rules";
import type { CaseRecord, MessageRecord } from "./types";
import type { NewCaseInput } from "./validation";
import { isPendingSend, ladderInputs, liveMessages, messageTime, templateContext } from "./view";

/**
 * Who decides what a landlord's reply means. "concierge" (the pilot default): our team reads every
 * reply and picks the next step, while the AI reads it in the background only so we can compare
 * later. "agent": the AI's reading drives the next step, as the product would after the pilot.
 */
function replyMode(): "concierge" | "agent" {
  return process.env.ABATE_REPLY_MODE === "agent" ? "agent" : "concierge";
}

export type ActionResult = { ok: true } | { ok: false; message: string };
const NOT_FOUND: ActionResult = { ok: false, message: "We couldn't find this case." };

export async function createCase(input: NewCaseInput, photos: File[], opts: { isTest: boolean }) {
  const today = nyDate();
  let invitedByCaseId: string | null = null;
  if (input.invite && isCaseCode(input.invite)) {
    invitedByCaseId = (await findBuildingByCode(input.invite))?.id ?? null;
  }
  const created = await insertCase(input, { isTest: opts.isTest, invitedByCaseId, nextStep: "notice", nextDueOn: today });
  const uploaded = photos.length > 0 ? await uploadCasePhotos(created.id, photos) : 0;
  await logEvent(created.id, "case_created", {
    issueType: input.issueType,
    photos: uploaded,
    invited: Boolean(invitedByCaseId),
    priorFollowups: input.priorFollowups,
    hasMgmtEmail: Boolean(input.mgmtEmail),
    sendMode: input.sendMode,
  });
  return { ...created, uploaded };
}

/** Warms the building cache so the first case page load is fast. Never throws. */
export async function warmBuilding(bbl: string | null, bin: string | null) {
  if (!bbl) return;
  try {
    await getBuildingSummary(bbl, bin);
  } catch {
    // building data is optional
  }
}

/** Recomputes the next ladder step and stores it on the case for teammates. */
export async function refreshNextStep(record: CaseRecord, messages?: MessageRecord[]) {
  const msgs = messages ?? (await listMessages(record.id));
  const today = nyDate();
  const { ladderCase, ladderMessages } = ladderInputs(record, msgs);
  const { nextStep, nextDueOn } = dueSummary(nextAction(ladderCase, ladderMessages, today), today);
  await updateCase(record.id, { next_step: nextStep, next_due_on: nextDueOn });
}

/** The draft for a step, built from the reviewed templates. Pass `openViolations` to reuse the count the tenant saw. */
export async function draftFor(
  record: CaseRecord,
  messages: MessageRecord[],
  step: StepId,
  today: IsoDate,
  shown?: { openViolations: number | null },
): Promise<DraftMessage> {
  const estimate = estimateAbatement({
    monthlyRent: record.monthlyRent,
    issueType: record.issueType,
    noticeOn: record.firstReportedOn,
    endOn: record.fixedOn ?? today,
  });
  let openViolations: number | null = shown ? shown.openViolations : null;
  if (!shown && step === "formal_notice" && record.bbl) {
    try {
      openViolations = (await getBuildingSummary(record.bbl, record.bin))?.openViolations.total ?? null;
    } catch {
      openViolations = null;
    }
  }
  return buildMessage(step, templateContext({ record, messages, today, estimate, openViolations }));
}

/** What the composer showed: the day it was drafted and the violation count it used. */
export type ShownDraft = { draftedOn: IsoDate; openViolations: number | null };

/**
 * The tenant finished a step. In "self" mode they sent it from their own email, so it's sent now.
 * In "abate" mode they approved it, and it waits in the team's send queue.
 */
export async function recordStep(token: string, step: StepId, subject: string, body: string, shown: ShownDraft | null): Promise<ActionResult> {
  const record = await findCaseByToken(token);
  if (!record) return NOT_FOUND;
  if (record.status === "fixed") return { ok: false, message: "This case is already marked fixed." };
  if (record.pausedAt) return { ok: false, message: "Abate is paused for this case. Resume it first." };
  const all = await listMessages(record.id);
  const messages = liveMessages(all);
  if (messages.some(isPendingSend)) return { ok: false, message: "Our team is still sending your last approved message." };
  if (unfilledPlaceholders(body).length > 0) return { ok: false, message: "Fill in the parts in brackets first." };

  const today = nyDate();
  // Only the step the ladder is on can be approved or sent (a stale tab can't skip ahead or repeat).
  const { ladderCase, ladderMessages } = ladderInputs(record, all);
  const action = nextAction(ladderCase, ladderMessages, today);
  if (action.kind !== "send" || action.step !== step) return { ok: false, message: "Your next step changed. Refresh the page to see it." };

  // Rebuild the draft exactly as the tenant saw it (a tab left open overnight still compares fairly).
  const draftedOn = shown && Math.abs(daysBetween(shown.draftedOn, today)) <= 1 ? shown.draftedOn : today;
  const draft = await draftFor(record, messages, step, draftedOn, shown ? { openViolations: shown.openViolations } : undefined);
  const edited = draftWasEdited(draft, { subject, body });
  // When this step became ready, for hypothesis 2's "approved within a day".
  const readyOn = readyOnFor(step, action.dueOn, record, all, today);

  const now = new Date().toISOString();
  const byAbate = record.sendMode === "abate";
  try {
    await insertMessage(record.id, {
      direction: "outgoing",
      step,
      subject,
      body,
      draft_body: draft.body,
      edited,
      ready_on: readyOn,
      ...(byAbate ? { approved_at: now } : { sent_at: now, sent_by: "tenant" }),
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("messages_one_pending_per_case")) {
      return { ok: false, message: "You already approved this one. Our team is sending it." };
    }
    throw err;
  }

  let updated: CaseRecord = record;
  if (step === "missed_repair" && !byAbate) {
    await updateCase(record.id, { repair_scheduled_for: null });
    updated = { ...record, repairScheduledFor: null };
  }
  await refreshNextStep(updated);
  await logEvent(record.id, byAbate ? "draft_approved" : "send_confirmed", { step, edited, readyOn });
  return { ok: true };
}

/** Takes approved messages the team hasn't opened yet out of the send queue (kept for measurement). */
async function withdrawUnclaimed(record: CaseRecord, messages: MessageRecord[], why: string): Promise<number> {
  const waiting = messages.filter((m) => isPendingSend(m) && !m.claimedAt);
  const now = new Date().toISOString();
  for (const m of waiting) await updateMessage(record.id, m.id, { withdrawn_at: now });
  if (waiting.length > 0) await logEvent(record.id, "approval_withdrawn", { why, count: waiting.length });
  return waiting.length;
}

/** Each pasted reply may cost a Claude call; cap them per case so a leaked link can't run up the bill. */
const MAX_REPLIES_PER_DAY = 20;

/**
 * Saves a reply from management. `teamCategory` is our team's reading (concierge); without it the
 * reply waits for the team, unless the AI agent is driving (agent mode).
 */
async function saveReply(
  record: CaseRecord,
  text: string,
  receivedOn: IsoDate,
  loggedBy: "tenant" | "team",
  team: { category: ReplyCategory; scheduledFor: IsoDate | null } | null,
): Promise<ActionResult & { messageId?: string }> {
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  if ((await countRepliesSince(record.id, dayAgo)) >= MAX_REPLIES_PER_DAY) {
    return { ok: false, message: "That's a lot of replies for one day. Our team will help with the rest." };
  }
  // A new reply can change the plan: an approved letter our team hasn't opened yet waits for a fresh draft.
  const before = await listMessages(record.id);
  await withdrawUnclaimed(record, before, "reply");
  const messages = await listMessages(record.id);
  const lastSent = liveMessages(messages)
    .filter((m) => m.direction === "outgoing" && m.sentAt)
    .sort((a, b) => messageTime(a).localeCompare(messageTime(b)))
    .pop();
  const receivedAt = receivedAtFor(receivedOn, liveMessages(messages));
  const readerInput = { replyText: text, receivedOn, issue: getIssueType(record.issueType).short, lastStepSent: lastSent?.step ?? null };

  let category: ReplyCategory | null = team?.category ?? null;
  let date: IsoDate | null = team?.category === "scheduled" ? team.scheduledFor : null;
  let fields: Record<string, unknown> = team ? { classified_by: "team", classified_at: new Date().toISOString() } : { classified_by: null };

  if (!team && replyMode() === "agent") {
    // After the pilot: the AI's reading drives the ladder.
    const reading = await readReply(readerInput);
    category = reading.category;
    date = reading.mentionedDate;
    fields = {
      classified_by: "agent",
      classified_at: new Date().toISOString(),
      ai_classification: reading.category,
      ai_source: reading.source,
      classification_summary: reading.summary,
      reply_reference: reading.replyReference,
    };
  }

  const messageId = await insertMessage(record.id, {
    direction: "incoming",
    body: text,
    received_at: receivedAt,
    logged_by: loggedBy,
    classification: category,
    classification_date: date,
    ...fields,
  });

  if (replyMode() === "concierge") {
    // Shadow mode: the AI reads it in the background, only so we can compare it with our team later.
    after(async () => {
      try {
        const reading = await readReply(readerInput);
        await updateMessage(record.id, messageId, { ai_classification: reading.category, ai_source: reading.source });
      } catch {
        // the comparison is optional
      }
    });
  }

  const all: MessageRecord[] = [
    ...messages,
    {
      id: messageId,
      direction: "incoming",
      createdAt: receivedAt,
      step: null,
      subject: null,
      body: text,
      sentAt: null,
      approvedAt: null,
      readyOn: null,
      sentBy: null,
      claimedAt: null,
      withdrawnAt: null,
      edited: null,
      draftBody: null,
      receivedAt,
      loggedBy,
      classification: category,
      aiClassification: null,
      classifiedBy: team ? "team" : replyMode() === "agent" ? "agent" : null,
      classifiedAt: category ? new Date().toISOString() : null,
      classificationSummary: null,
      classificationDate: date,
      replyReference: null,
      aiSource: null,
    },
  ];
  const patch: Record<string, unknown> = { mgmt_first_replied_at: firstReplyAfterNotice(liveMessages(all)) };
  let updated: CaseRecord = record;
  if (category === "scheduled" && date) {
    patch.repair_scheduled_for = date;
    patch.repair_missed_at = null;
    // Hypothesis 1 measures when a repair was first scheduled, from the reply that scheduled it.
    if (!record.repairScheduledAt) patch.repair_scheduled_at = receivedAt;
    updated = { ...record, repairScheduledFor: date, repairMissedAt: null };
  }
  await updateCase(record.id, patch);
  await refreshNextStep(updated, all);
  await logEvent(record.id, "reply_logged", { category, loggedBy, classifiedBy: team ? "team" : replyMode() });
  return { ok: true, messageId };
}

/** A tenant pastes a reply they received. Our team reads it (concierge) and sets up the next step. */
export async function logReply(token: string, text: string, receivedOn: IsoDate): Promise<ActionResult> {
  const record = await findCaseByToken(token);
  if (!record) return NOT_FOUND;
  const result = await saveReply(record, text, receivedOn, "tenant", null);
  return result.ok ? { ok: true } : result;
}

/**
 * Sets what a reply meant. The ladder follows this reading; the AI's own reading (if any) stays in
 * ai_classification for comparison.
 */
async function classifyReply(record: CaseRecord, messageId: string, category: ReplyCategory, scheduledFor: IsoDate | null, by: "team" | "tenant"): Promise<ActionResult> {
  const messages = await listMessages(record.id);
  const target = messages.find((m) => m.id === messageId && m.direction === "incoming");
  if (!target) return { ok: false, message: "We couldn't find that reply." };

  await updateMessage(record.id, messageId, {
    classification: category,
    classification_date: category === "scheduled" ? scheduledFor : null,
    classified_by: by,
    classified_at: new Date().toISOString(),
  });

  let updated: CaseRecord = record;
  const replyAt = target.receivedAt ?? target.createdAt;
  if (category === "scheduled" && scheduledFor) {
    await updateCase(record.id, {
      repair_scheduled_for: scheduledFor,
      repair_missed_at: null,
      ...(record.repairScheduledAt ? {} : { repair_scheduled_at: replyAt }),
    });
    updated = { ...record, repairScheduledFor: scheduledFor, repairMissedAt: null };
  } else if (target.classification === "scheduled" && record.repairScheduledFor) {
    // The appointment came from a misread; take it back off the case.
    await updateCase(record.id, { repair_scheduled_for: null, repair_scheduled_at: null });
    updated = { ...record, repairScheduledFor: null, repairScheduledAt: null };
  }
  const reclassified = messages.map((m) => (m.id === messageId ? { ...m, classification: category, classifiedAt: new Date().toISOString() } : m));
  await refreshNextStep(updated, reclassified);
  await logEvent(record.id, by === "team" ? "reply_classified" : "reply_corrected", { to: category });
  return { ok: true };
}

/** The tenant says our reading of a reply was wrong. */
export async function correctReply(token: string, messageId: string, category: ReplyCategory, scheduledFor: IsoDate | null): Promise<ActionResult> {
  const record = await findCaseByToken(token);
  if (!record) return NOT_FOUND;
  return classifyReply(record, messageId, category, scheduledFor, "tenant");
}

export async function confirmFixed(token: string, fixedOn: IsoDate): Promise<ActionResult> {
  const record = await findCaseByToken(token);
  if (!record) return NOT_FOUND;
  await updateCase(record.id, { status: "fixed", fixed_on: fixedOn, next_step: null, next_due_on: null });
  await logEvent(record.id, "marked_fixed", { fixedOn, days: estimateAbatement({ monthlyRent: record.monthlyRent, issueType: record.issueType, noticeOn: record.firstReportedOn, endOn: fixedOn }).days });
  return { ok: true };
}

export async function reportNotFixed(token: string): Promise<ActionResult> {
  const record = await findCaseByToken(token);
  if (!record) return NOT_FOUND;
  const now = new Date().toISOString();
  await updateCase(record.id, { repair_missed_at: now });
  await refreshNextStep({ ...record, repairMissedAt: now });
  await logEvent(record.id, "repair_missed", {});
  return { ok: true };
}

/**
 * The tenant backs out of Abate contacting management (hypothesis 2). "send_myself" switches the
 * case to the tenant sending messages; anything else pauses it.
 */
export async function pauseCase(token: string, reason: "worried" | "send_myself" | "other"): Promise<ActionResult> {
  const record = await findCaseByToken(token);
  if (!record) return NOT_FOUND;
  // An approved message our team hasn't opened yet is withdrawn; one already being sent stays recorded.
  await withdrawUnclaimed(record, await listMessages(record.id), reason === "send_myself" ? "switched" : "paused");
  if (reason === "send_myself") {
    await updateCase(record.id, { send_mode: "self", pause_reason: reason });
    await refreshNextStep({ ...record, sendMode: "self", pauseReason: reason });
    await logEvent(record.id, "switched_to_self", {});
  } else {
    const now = new Date().toISOString();
    await updateCase(record.id, { paused_at: now, pause_reason: reason, next_step: null, next_due_on: null });
    await logEvent(record.id, "paused", { reason });
  }
  return { ok: true };
}

export async function resumeCase(token: string): Promise<ActionResult> {
  const record = await findCaseByToken(token);
  if (!record) return NOT_FOUND;
  await updateCase(record.id, { paused_at: null });
  await refreshNextStep({ ...record, pausedAt: null });
  await logEvent(record.id, "resumed", {});
  return { ok: true };
}

/** Saves where teammates should send reminders. */
export async function saveContact(token: string, contact: string): Promise<ActionResult> {
  const record = await findCaseByToken(token);
  if (!record) return NOT_FOUND;
  await updateCase(record.id, { tenant_contact: contact });
  await logEvent(record.id, "contact_added", {});
  return { ok: true };
}

export async function requestHelp(token: string, contact: string): Promise<ActionResult> {
  const record = await findCaseByToken(token);
  if (!record) return NOT_FOUND;
  await updateCase(record.id, { help_requested_at: new Date().toISOString(), help_contact: contact });
  await logEvent(record.id, "help_requested", {});
  return { ok: true };
}

const CLIENT_EVENTS = new Set(["case_viewed", "draft_shown", "draft_edited", "send_clicked", "copy_clicked", "neighbor_invited", "link_copied", "help_opened"]);

export async function recordClientEvent(token: string, name: string, props: Record<string, unknown>): Promise<void> {
  if (!CLIENT_EVENTS.has(name)) return;
  const record = await findCaseByToken(token);
  if (!record) return;
  const safeProps: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props).slice(0, 5)) {
    if (typeof v === "string" && v.length <= 40) safeProps[k] = v;
    else if (typeof v === "number" || typeof v === "boolean") safeProps[k] = v;
  }
  await logEvent(record.id, name, safeProps);
}

// ---------------------------------------------------------------------------------------------
// Team (concierge) operations. Callers must check the team key first.

/** A claim older than this is assumed abandoned (the teammate closed the tab without sending). */
const CLAIM_MINUTES = 30;

/**
 * A teammate is about to send a message (Open in Gmail or Copy). Re-checks the case right now, so a
 * stale team page can't send something the tenant paused, withdrew or that a teammate is already
 * sending. Pass `force` after checking the team inbox's Sent folder.
 */
export async function teamClaim(messageId: string, force: boolean): Promise<ActionResult & { claimed?: "recently" }> {
  const found = await findMessageWithCase(messageId);
  if (!found || !isPendingSend(found.message)) return { ok: false, message: "This message is no longer waiting to be sent. Refresh the page." };
  const { record, message } = found;
  if (record.pausedAt) return { ok: false, message: "The tenant paused this case. Don't send it." };
  if (record.status === "fixed") return { ok: false, message: "This case is marked fixed. No need to send it." };
  if (!force && message.claimedAt && Date.now() - Date.parse(message.claimedAt) < CLAIM_MINUTES * 60_000) {
    return { ok: false, claimed: "recently", message: "A teammate opened this in the last 30 minutes. Check the team inbox's Sent folder before sending it again." };
  }
  await updateMessage(record.id, messageId, { claimed_at: new Date().toISOString() });
  return { ok: true };
}

/** The team sent an approved message from the team inbox. */
export async function teamMarkSent(messageId: string): Promise<ActionResult> {
  const found = await findMessageWithCase(messageId);
  if (!found || !isPendingSend(found.message)) return { ok: false, message: "That message isn't waiting to be sent." };
  const { record, message } = found;
  // A claimed message may already be out even if the tenant paused since; record what really happened.
  if (!message.claimedAt && record.pausedAt) return { ok: false, message: "The tenant paused this case. Don't send it." };
  if (!message.claimedAt && record.status === "fixed") return { ok: false, message: "This case is marked fixed. No need to send it." };
  await updateMessage(record.id, messageId, { sent_at: new Date().toISOString(), sent_by: "team" });

  let updated = record;
  if (message.step === "missed_repair") {
    // Clear the missed appointment, unless management has given a new date since the tenant approved.
    const messages = liveMessages(await listMessages(record.id));
    const newerDate = messages.some(
      (m) => m.direction === "incoming" && m.classification === "scheduled" && message.approvedAt && messageTime(m) > message.approvedAt,
    );
    if (!newerDate) {
      await updateCase(record.id, { repair_scheduled_for: null });
      updated = { ...record, repairScheduledFor: null };
    }
  }
  await refreshNextStep(updated);
  await logEvent(record.id, "team_sent", { step: message.step });
  return { ok: true };
}

/** A reply that arrived in the team inbox, logged with our team's reading. */
export async function teamLogReply(code: string, text: string, receivedOn: IsoDate, category: ReplyCategory, scheduledFor: IsoDate | null): Promise<ActionResult> {
  const record = await findCaseByCode(code);
  if (!record) return { ok: false, message: `No case with code ${code}.` };
  if (record.status !== "open") return { ok: false, message: "That case is already marked fixed." };
  const result = await saveReply(record, text, receivedOn, "team", { category, scheduledFor });
  return result.ok ? { ok: true } : result;
}

/** Our team's reading of a reply. Won't overwrite the tenant's own reading or a reply someone already read. */
export async function teamClassify(messageId: string, category: ReplyCategory, scheduledFor: IsoDate | null): Promise<ActionResult> {
  const found = await findMessageWithCase(messageId);
  if (!found || found.message.direction !== "incoming") return { ok: false, message: "We couldn't find that reply." };
  const { record, message } = found;
  if (record.status !== "open") return { ok: false, message: "That case is already marked fixed." };
  if (message.classifiedBy === "tenant") return { ok: false, message: "The tenant already told us what this reply meant. Refresh the page." };
  if (message.classification && message.classification !== "unclear" && message.classifiedBy !== "agent") {
    return { ok: false, message: "A teammate already read this reply. Refresh the page." };
  }
  return classifyReply(record, messageId, category, scheduledFor, "team");
}

/** Management's email, found by the team after the tenant started the case. */
export async function teamSetMgmtEmail(code: string, email: string): Promise<ActionResult> {
  const record = await findCaseByCode(code);
  if (!record) return { ok: false, message: `No case with code ${code}.` };
  await updateCase(record.id, { mgmt_email: email });
  await logEvent(record.id, "mgmt_email_added", { by: "team" });
  return { ok: true };
}

export type TeamCase = {
  record: CaseRecord;
  messages: MessageRecord[];
  isTest: boolean;
  /** What the tenant sees as their next step today. */
  next: ReturnType<typeof nextAction>;
};

export type SendQueueItem = {
  record: CaseRecord;
  message: MessageRecord;
  /** Management replied after the tenant approved it: re-check before sending. */
  replyAfterApproval: boolean;
};

export type TeamOverview = {
  toSend: SendQueueItem[];
  toRead: Array<{ record: CaseRecord; message: MessageRecord }>;
  waitingOnTenant: TeamCase[];
  open: TeamCase[];
  metrics: Metrics;
  invites: number;
  helpRequests: number;
};

/** Everything the team page shows: the send queue, replies to read, nudges, and the live numbers. */
export async function teamOverview(scope: CaseScope): Promise<TeamOverview> {
  const rows = await listCasesWithMessages(scope);
  const today = nyDate();
  const cases: TeamCase[] = rows.map(({ record, messages, isTest }) => {
    const { ladderCase, ladderMessages } = ladderInputs(record, messages);
    return { record, messages, isTest, next: nextAction(ladderCase, ladderMessages, today) };
  });
  const open = cases.filter((c) => c.record.status === "open");

  // Paused cases stay out of the send queue, unless a teammate was already sending (to record it).
  const toSend: SendQueueItem[] = open.flatMap((c) =>
    liveMessages(c.messages)
      .filter((m) => isPendingSend(m) && (!c.record.pausedAt || m.claimedAt))
      .map((message) => ({
        record: c.record,
        message,
        replyAfterApproval: c.messages.some((r) => r.direction === "incoming" && message.approvedAt !== null && messageTime(r) > message.approvedAt),
      })),
  );

  // Every case waiting on our team's reading, including replies someone marked "not sure".
  const toRead = open.flatMap((c) => {
    if (c.next.kind !== "team_review") return [];
    const latest = liveMessages(c.messages)
      .filter((m) => m.direction === "incoming")
      .sort((a, b) => messageTime(a).localeCompare(messageTime(b)))
      .pop();
    return latest ? [{ record: c.record, message: latest }] : [];
  });

  const waitingOnTenant = open.filter(
    (c) => !c.record.pausedAt && (c.next.kind === "confirm_fixed" || c.next.kind === "checkin" || (c.next.kind === "send" && c.next.dueOn <= today)),
  );
  const invites = await countEvents("neighbor_invited", scope);
  const helpRequests = cases.filter((c) => c.record.helpRequestedAt).length;
  return { toSend, toRead, waitingOnTenant, open, metrics: computeMetrics(cases), invites, helpRequests };
}
