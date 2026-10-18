import "server-only";
import { readReply } from "@/lib/agent";
import type { ReplyReading } from "@/lib/agent/types";
import { getBuildingSummary } from "@/lib/building";
import { daysBetween, nyDate, type IsoDate } from "@/lib/domain/dates";
import { estimateAbatement } from "@/lib/domain/estimate";
import { getIssueType } from "@/lib/domain/issues";
import { dueSummary, nextAction, type ReplyCategory, type StepId } from "@/lib/domain/ladder";
import { buildMessage, type DraftMessage } from "@/lib/domain/templates";
import { isCaseCode } from "./ids";
import {
  countRepliesSince,
  findBuildingByCode,
  findCaseByToken,
  insertCase,
  insertMessage,
  listMessages,
  logEvent,
  updateCase,
  updateMessage,
  uploadCasePhotos,
} from "./repo";
import type { CaseRecord, MessageRecord } from "./types";
import { draftWasEdited, firstReplyAfterNotice, receivedAtFor } from "./rules";
import type { NewCaseInput } from "./validation";
import { ladderInputs, messageTime, templateContext } from "./view";

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

export type ActionResult = { ok: true } | { ok: false; message: string };

/** What the composer showed: the day it was drafted and the violation count it used. */
export type ShownDraft = { draftedOn: IsoDate; openViolations: number | null };

export async function recordSent(token: string, step: StepId, subject: string, body: string, shown: ShownDraft | null): Promise<ActionResult> {
  const record = await findCaseByToken(token);
  if (!record) return { ok: false, message: "We couldn't find this case." };
  const messages = await listMessages(record.id);
  const today = nyDate();
  // Rebuild the draft exactly as the tenant saw it (a tab left open overnight still compares fairly).
  const draftedOn = shown && Math.abs(daysBetween(shown.draftedOn, today)) <= 1 ? shown.draftedOn : today;
  const draft = await draftFor(record, messages, step, draftedOn, shown ? { openViolations: shown.openViolations } : undefined);
  const edited = draftWasEdited(draft, { subject, body });

  await insertMessage(record.id, {
    direction: "outgoing",
    step,
    subject,
    body,
    draft_body: draft.body,
    edited,
    sent_at: new Date().toISOString(),
  });

  let updated: CaseRecord = record;
  if (step === "missed_repair") {
    await updateCase(record.id, { repair_scheduled_for: null });
    updated = { ...record, repairScheduledFor: null };
  }
  await refreshNextStep(updated);
  await logEvent(record.id, "send_confirmed", { step, edited });
  return { ok: true };
}

export type ReplyResult =
  | { ok: true; messageId: string; reading: Pick<ReplyReading, "category" | "summary" | "mentionedDate" | "source"> }
  | { ok: false; message: string };

/** Each pasted reply is a paid Claude call; cap them per case so a leaked link can't run up the bill. */
const MAX_REPLIES_PER_DAY = 20;

export async function logReply(token: string, text: string, receivedOn: IsoDate, loggedBy: "tenant" | "team"): Promise<ReplyResult> {
  const record = await findCaseByToken(token);
  if (!record) return { ok: false, message: "We couldn't find this case." };
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  if ((await countRepliesSince(record.id, dayAgo)) >= MAX_REPLIES_PER_DAY) {
    return { ok: false, message: "That's a lot of replies for one day. A teammate will help with the rest." };
  }
  const messages = await listMessages(record.id);
  const lastSent = [...messages].filter((m) => m.direction === "outgoing").sort((a, b) => messageTime(a).localeCompare(messageTime(b))).pop();

  const reading = await readReply({
    replyText: text,
    receivedOn,
    issue: getIssueType(record.issueType).short,
    lastStepSent: lastSent?.step ?? null,
  });

  const receivedAt = receivedAtFor(receivedOn, messages);
  const messageId = await insertMessage(record.id, {
    direction: "incoming",
    body: text,
    received_at: receivedAt,
    logged_by: loggedBy,
    classification: reading.category,
    ai_classification: reading.category,
    classification_summary: reading.summary,
    classification_date: reading.mentionedDate,
    reply_reference: reading.replyReference,
    ai_source: reading.source,
  });

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
      receivedAt,
      loggedBy,
      classification: reading.category,
      aiClassification: reading.category,
      classificationSummary: reading.summary,
      classificationDate: reading.mentionedDate,
      replyReference: reading.replyReference,
      aiSource: reading.source,
    },
  ];
  const patch: Record<string, unknown> = { mgmt_first_replied_at: firstReplyAfterNotice(all) };
  let updated: CaseRecord = record;
  if (reading.category === "scheduled" && reading.mentionedDate) {
    patch.repair_scheduled_for = reading.mentionedDate;
    patch.repair_missed_at = null;
    // Assumption 1 measures when a repair was first scheduled, from the reply that scheduled it.
    if (!record.repairScheduledAt) patch.repair_scheduled_at = receivedAt;
    updated = { ...record, repairScheduledFor: reading.mentionedDate, repairMissedAt: null };
  }
  await updateCase(record.id, patch);
  await refreshNextStep(updated, all);
  await logEvent(record.id, "reply_logged", { category: reading.category, source: reading.source, loggedBy, firstReply: !messages.some((m) => m.direction === "incoming") });

  return {
    ok: true,
    messageId,
    reading: { category: reading.category, summary: reading.summary, mentionedDate: reading.mentionedDate, source: reading.source },
  };
}

/** The tenant says the agent read a reply wrong. Their category drives the ladder; the agent's original stays for measurement. */
export async function correctReply(token: string, messageId: string, category: ReplyCategory, scheduledFor: IsoDate | null): Promise<ActionResult> {
  const record = await findCaseByToken(token);
  if (!record) return { ok: false, message: "We couldn't find this case." };
  const messages = await listMessages(record.id);
  const target = messages.find((m) => m.id === messageId && m.direction === "incoming");
  if (!target) return { ok: false, message: "We couldn't find that reply." };

  await updateMessage(record.id, messageId, {
    classification: category,
    classification_date: category === "scheduled" ? scheduledFor : null,
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
  const corrected = messages.map((m) => (m.id === messageId ? { ...m, classification: category } : m));
  await refreshNextStep(updated, corrected);
  await logEvent(record.id, "reply_corrected", { to: category });
  return { ok: true };
}

export async function confirmFixed(token: string, fixedOn: IsoDate): Promise<ActionResult> {
  const record = await findCaseByToken(token);
  if (!record) return { ok: false, message: "We couldn't find this case." };
  await updateCase(record.id, { status: "fixed", fixed_on: fixedOn, next_step: null, next_due_on: null });
  await logEvent(record.id, "marked_fixed", { fixedOn, days: estimateAbatement({ monthlyRent: record.monthlyRent, issueType: record.issueType, noticeOn: record.firstReportedOn, endOn: fixedOn }).days });
  return { ok: true };
}

export async function reportNotFixed(token: string): Promise<ActionResult> {
  const record = await findCaseByToken(token);
  if (!record) return { ok: false, message: "We couldn't find this case." };
  const now = new Date().toISOString();
  await updateCase(record.id, { repair_missed_at: now });
  await refreshNextStep({ ...record, repairMissedAt: now });
  await logEvent(record.id, "repair_missed", {});
  return { ok: true };
}

/** Saves where teammates should send reminders. */
export async function saveContact(token: string, contact: string): Promise<ActionResult> {
  const record = await findCaseByToken(token);
  if (!record) return { ok: false, message: "We couldn't find this case." };
  await updateCase(record.id, { tenant_contact: contact });
  await logEvent(record.id, "contact_added", {});
  return { ok: true };
}

export async function requestHelp(token: string, contact: string): Promise<ActionResult> {
  const record = await findCaseByToken(token);
  if (!record) return { ok: false, message: "We couldn't find this case." };
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
