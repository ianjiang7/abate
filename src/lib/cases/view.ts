// Pure helpers that turn a case and its messages into what the case page shows.

import { nyDate, type IsoDate } from "@/lib/domain/dates";
import type { Estimate } from "@/lib/domain/estimate";
import { getIssueType, reportChannelPhrase } from "@/lib/domain/issues";
import { replyCategoryLabel, STEP_LABELS, TIMED_STEPS, type LadderCase, type LadderMessage, type StepId } from "@/lib/domain/ladder";
import type { TemplateContext } from "@/lib/domain/templates";
import type { CaseRecord, MessageRecord } from "./types";

export function messageTime(m: MessageRecord): string {
  return (m.direction === "outgoing" ? m.sentAt : m.receivedAt) ?? m.createdAt;
}

export function ladderInputs(record: CaseRecord, messages: MessageRecord[]): { ladderCase: LadderCase; ladderMessages: LadderMessage[] } {
  return {
    ladderCase: {
      status: record.status,
      repairScheduledFor: record.repairScheduledFor,
      repairMissedAt: record.repairMissedAt,
    },
    ladderMessages: messages.map((m) => ({
      direction: m.direction,
      at: messageTime(m),
      step: m.step,
      classification: m.classification,
    })),
  };
}

/** The date each step was first sent. */
export function sentOnByStep(messages: MessageRecord[]): Partial<Record<StepId, IsoDate>> {
  const out: Partial<Record<StepId, IsoDate>> = {};
  for (const m of messages) {
    if (m.direction !== "outgoing" || !m.step) continue;
    const on = nyDate(messageTime(m));
    if (!out[m.step]) out[m.step] = on;
  }
  return out;
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
  openViolations: number | null;
}): TemplateContext {
  const { record, messages, today, estimate, openViolations } = args;
  return {
    today,
    tenantName: record.tenantName,
    address: record.address,
    unit: record.unit,
    mgmtName: record.mgmtName,
    issueType: record.issueType,
    issueDescription: record.issueDescription,
    startedOn: record.startedOn,
    firstReportedOn: record.firstReportedOn,
    firstReportedVia: record.firstReportedVia,
    priorFollowups: record.priorFollowups,
    daysSinceReport: estimate.days,
    estimate,
    sentOn: sentOnByStep(messages),
    openViolations,
    replyReference: pendingReplyReference(messages),
    repairScheduledFor: record.repairScheduledFor,
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

export function buildTimeline(record: CaseRecord, messages: MessageRecord[]): TimelineItem[] {
  const issue = getIssueType(record.issueType);
  const items: TimelineItem[] = [
    { id: "started", date: record.startedOn, kind: "started", title: "Problem started", detail: issue.label, tone: "neutral" },
    {
      id: "reported",
      date: record.firstReportedOn,
      kind: "reported",
      title: "First told management",
      detail:
        `Reported ${reportChannelPhrase(record.firstReportedVia)}` +
        (record.priorFollowups > 0 ? `, then followed up ${record.priorFollowups === 1 ? "once" : `${record.priorFollowups} times`}` : ""),
      tone: "neutral",
    },
    { id: "joined", date: nyDate(record.createdAt), kind: "joined", title: "Started your Abate case", tone: "brand" },
  ];

  for (const m of messages) {
    const date = nyDate(messageTime(m));
    if (m.direction === "outgoing") {
      items.push({
        id: m.id,
        date,
        kind: "sent",
        title: `${m.step ? STEP_LABELS[m.step] : "Message"} sent`,
        detail: m.subject ?? undefined,
        tone: "brand",
      });
    } else {
      // A tenant correction replaces the agent's reading, so its summary no longer applies.
      const corrected = Boolean(m.classification && m.aiClassification && m.classification !== m.aiClassification);
      items.push({
        id: m.id,
        date,
        kind: "reply",
        title: "Management replied",
        detail:
          [m.classification ? replyCategoryLabel(m.classification) : null, corrected ? "corrected by you" : m.classificationSummary].filter(Boolean).join(" · ") ||
          undefined,
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
