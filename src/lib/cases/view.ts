// Pure helpers that turn a case and its messages into what the case page shows.

import { nyDate, type IsoDate } from "@/lib/domain/dates";
import { estimateAbatement, type Estimate } from "@/lib/domain/estimate";
import { getIssueType, reportChannelPhrase } from "@/lib/domain/issues";
import { replyCategoryLabel, STEP_LABELS, TIMED_STEPS, type LadderCase, type LadderMessage, type StepId } from "@/lib/domain/ladder";
import type { TemplateContext } from "@/lib/domain/templates";
import type { CaseRecord, MessageRecord } from "./types";

export function messageTime(m: MessageRecord): string {
  return (m.direction === "outgoing" ? (m.sentAt ?? m.approvedAt) : m.receivedAt) ?? m.createdAt;
}

/** Approved by the tenant, waiting for the team to send it. */
export function isPendingSend(m: MessageRecord): boolean {
  return m.direction === "outgoing" && !m.sentAt && Boolean(m.approvedAt) && !m.withdrawnAt;
}

/** Messages that count: withdrawn approvals (never sent) are kept only for measurement. */
export function liveMessages(messages: MessageRecord[]): MessageRecord[] {
  return messages.filter((m) => !m.withdrawnAt);
}

/**
 * The day management was first told, which starts the estimate's clock. A tenant who hadn't told
 * management before starting the case tells them with the first notice, so the clock starts the
 * day that notice is sent; until then it hasn't started (null).
 */
export function clockStartOn(record: CaseRecord, messages: MessageRecord[]): IsoDate | null {
  if (record.toldBefore) return record.firstReportedOn;
  const notice = liveMessages(messages).find((m) => m.direction === "outgoing" && m.step === "notice" && m.sentAt);
  return notice ? nyDate(notice.sentAt!) : null;
}

/** Whether management wrote back before the first notice went out (or before now, if it hasn't). */
function repliedBeforeNotice(messages: MessageRecord[]): boolean {
  const live = liveMessages(messages);
  const noticeAt = live.find((m) => m.direction === "outgoing" && m.step === "notice" && m.sentAt)?.sentAt;
  return live.some((m) => m.direction === "incoming" && (!noticeAt || messageTime(m) < noticeAt));
}

/** The estimate for a case as of `today` (or its fix date). Zero days until the clock starts. */
export function caseEstimate(record: CaseRecord, messages: MessageRecord[], today: IsoDate): Estimate {
  const start = clockStartOn(record, messages);
  return estimateAbatement({
    monthlyRent: record.monthlyRent,
    issueTypes: record.issueTypes,
    noticeOn: start ?? today,
    endOn: start ? (record.fixedOn ?? today) : today,
  });
}

export function ladderInputs(record: CaseRecord, all: MessageRecord[]): { ladderCase: LadderCase; ladderMessages: LadderMessage[] } {
  const messages = liveMessages(all);
  return {
    ladderCase: {
      status: record.status,
      repairScheduledFor: record.repairScheduledFor,
      repairMissedAt: record.repairMissedAt,
      paused: Boolean(record.pausedAt),
    },
    ladderMessages: messages.map((m) => ({
      direction: m.direction,
      at: messageTime(m),
      step: m.step,
      classification: m.classification,
      pending: isPendingSend(m),
    })),
  };
}

/** The date each step was first sent. */
export function sentOnByStep(messages: MessageRecord[]): Partial<Record<StepId, IsoDate>> {
  const out: Partial<Record<StepId, IsoDate>> = {};
  for (const m of messages) {
    if (m.direction !== "outgoing" || !m.step || !m.sentAt) continue;
    const on = nyDate(m.sentAt);
    if (!out[m.step]) out[m.step] = on;
  }
  return out;
}

export function latestIncoming(messages: MessageRecord[]): MessageRecord | null {
  const incoming = messages.filter((m) => m.direction === "incoming").sort((a, b) => messageTime(a).localeCompare(messageTime(b)));
  return incoming[incoming.length - 1] ?? null;
}

/** The agent's quotable sentence from the latest reply, if that reply is newer than our last message. */
export function pendingReplyReference(messages: MessageRecord[]): string | null {
  const sorted = [...messages].sort((a, b) => messageTime(a).localeCompare(messageTime(b)));
  const last = sorted[sorted.length - 1];
  if (!last || last.direction !== "incoming") return null;
  return last.replyReference;
}

export function templateContext(args: {
  record: CaseRecord;
  messages: MessageRecord[];
  today: IsoDate;
  estimate: Estimate;
}): TemplateContext {
  const { record, messages, today, estimate } = args;
  return {
    today,
    tenantName: record.tenantName,
    address: record.address,
    unit: record.unit,
    mgmtName: record.mgmtName,
    issueTypes: record.issueTypes,
    issueDescription: record.issueDescription,
    startedOn: record.startedOn,
    toldBefore: record.toldBefore,
    noticeIsFirstReport: !record.toldBefore && !repliedBeforeNotice(messages),
    // Before the first notice tells management, letters don't cite a first-report date anyway.
    firstReportedOn: clockStartOn(record, messages) ?? today,
    firstReportedVia: record.firstReportedVia,
    priorFollowups: record.priorFollowups,
    daysSinceReport: estimate.days,
    estimate,
    sentOn: sentOnByStep(messages),
    replyReference: pendingReplyReference(messages),
    repairScheduledFor: record.repairScheduledFor,
    missedBecause: latestIncoming(messages)?.classification === "says_fixed" ? "says_fixed" : "appointment",
    voice: record.sendMode === "abate" ? "abate" : "tenant",
    estimateInNotice: record.dollarInNotice === true,
  };
}

export type TimelineTone = "brand" | "neutral" | "good" | "warn";

export type TimelineItem = {
  id: string;
  date: IsoDate;
  kind: "started" | "reported" | "joined" | "sent" | "reply" | "scheduled" | "fixed";
  title: string;
  detail?: string;
  tone: TimelineTone;
};

export function buildTimeline(record: CaseRecord, all: MessageRecord[]): TimelineItem[] {
  const messages = liveMessages(all);
  const items: TimelineItem[] = [
    {
      id: "started",
      date: record.startedOn,
      kind: "started",
      title: record.issueTypes.length > 1 ? "Problems started" : "Problem started",
      detail: record.issueTypes.map((id) => getIssueType(id).label).join(" + "),
      tone: "neutral",
    },
    // Tenants who hadn't told management before: the first notice (below) is the first report.
    ...(record.toldBefore
      ? [
          {
            id: "reported",
            date: record.firstReportedOn,
            kind: "reported",
            title: "First told management",
            detail:
              `Reported ${reportChannelPhrase(record.firstReportedVia)}` +
              (record.priorFollowups > 0 ? `, then followed up ${record.priorFollowups === 1 ? "once" : `${record.priorFollowups} times`}` : ""),
            tone: "neutral",
          } satisfies TimelineItem,
        ]
      : []),
    { id: "joined", date: nyDate(record.createdAt), kind: "joined", title: "Started your Abate case", tone: "brand" },
  ];

  for (const m of messages) {
    const date = nyDate(messageTime(m));
    if (m.direction === "outgoing") {
      const label = m.step ? STEP_LABELS[m.step] : "Message";
      const pending = isPendingSend(m);
      items.push({
        id: m.id,
        date,
        kind: "sent",
        title: pending ? `${label} approved` : m.sentBy === "team" ? `${label} sent by Abate` : `${label} sent`,
        detail: pending ? "Our team will send it and copy you" : (m.subject ?? undefined),
        tone: pending ? "neutral" : "brand",
      });
    } else if (!m.classification) {
      items.push({ id: m.id, date, kind: "reply", title: "Management replied", detail: "Our team is reading it", tone: "neutral" });
    } else {
      // Who decided what the reply meant: the tenant (a correction), our team, or the agent (its summary).
      const note = m.classifiedBy === "tenant" ? "corrected by you" : m.classifiedBy === "team" ? "read by our team" : m.classificationSummary;
      items.push({
        id: m.id,
        date,
        kind: "reply",
        title: "Management replied",
        detail: [m.classification ? replyCategoryLabel(m.classification) : null, note].filter(Boolean).join(" · ") || undefined,
        tone: m.classification === "disputes_or_refuses" ? "warn" : "good",
      });
    }
  }

  // A repair fixed before its appointment makes the appointment moot.
  if (record.repairScheduledFor && !(record.fixedOn && record.fixedOn < record.repairScheduledFor)) {
    items.push({ id: "scheduled", date: record.repairScheduledFor, kind: "scheduled", title: "Repair scheduled", tone: "good" });
  }
  if (record.fixedOn) {
    items.push({ id: "fixed", date: record.fixedOn, kind: "fixed", title: "Fixed", tone: "good" });
  }

  const order: Record<TimelineItem["kind"], number> = { started: 0, reported: 1, joined: 2, sent: 3, reply: 3, scheduled: 4, fixed: 5 };
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => a.it.date.localeCompare(b.it.date) || order[a.it.kind] - order[b.it.kind] || a.i - b.i)
    .map(({ it }) => it);
}

export type ProgressStep = { step: StepId; label: string; status: "done" | "current" | "upcoming"; date: IsoDate | null };

/** The four timed steps with their status, for the progress strip. */
export function ladderProgress(messages: MessageRecord[], currentStep: StepId | null): ProgressStep[] {
  const sent = sentOnByStep(messages);
  return TIMED_STEPS.map(({ step }) => ({
    step,
    label: STEP_LABELS[step],
    status: sent[step] ? "done" : step === currentStep ? "current" : "upcoming",
    date: sent[step] ?? null,
  }));
}
