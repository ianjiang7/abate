// The two hypotheses' numbers, computed from cases and messages. Pure, so it can be unit tested.

import { daysBetween, nyDate, type IsoDate } from "@/lib/domain/dates";
import { nextAction, type StepId } from "@/lib/domain/ladder";
import { readyOnFor } from "./rules";
import type { CaseRecord, MessageRecord } from "./types";
import { ladderInputs, liveMessages } from "./view";

export const PASS = {
  respondedWithin7: 0.5, // H1: at least half of cases
  authorized: 0.8, // H2: at least 8 of 10 testers let Abate send
  approvedWithinDay: 0.7, // H2: at least 70% of drafts approved within 24 hours
  maxBackedOut: 1, // H2: at most 1 tester pauses or switches to sending themselves
};

export type Metrics = {
  cases: number;
  h1: {
    /** Cases whose first follow-up has gone out. */
    started: number;
    /** Of those, cases old enough to judge (7+ days since the first follow-up) or already answered. */
    judged: number;
    responded: number;
    /** Still inside their first 7 days with no reply yet. */
    waiting: number;
    rate: number | null;
    pass: boolean | null;
    medianBaselineDays: number | null;
    medianDaysToReply: number | null;
    /** Which follow-up was last sent before management's first reply. */
    firstReplyAfterStep: Partial<Record<StepId, number>>;
    fixed: number;
  };
  h2: {
    /** Cases offered the who-sends choice (cases from before the concierge pilot weren't). */
    offered: number;
    authorized: number;
    rate: number | null;
    authorizedPass: boolean | null;
    /** Drafts that became ready: approved ones, plus ones still waiting more than a day. */
    approvals: number;
    approvedWithinDay: number;
    /** Ready more than a day ago and still not approved (counted as not within a day). */
    overdue: number;
    approvalRate: number | null;
    approvalPass: boolean | null;
    backedOut: number;
    backedOutPass: boolean;
    pauseReasons: Record<string, number>;
  };
  shadow: { compared: number; agreed: number; rate: number | null };
};

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const ratio = (n: number, d: number): number | null => (d > 0 ? n / d : null);

export function computeMetrics(rows: Array<{ record: CaseRecord; messages: MessageRecord[] }>, now: Date = new Date()): Metrics {
  const today: IsoDate = nyDate(now);
  let started = 0;
  let judged = 0;
  let responded = 0;
  let waiting = 0;
  let fixed = 0;
  const baselines: number[] = [];
  const toReply: number[] = [];
  const afterStep: Partial<Record<StepId, number>> = {};

  let offered = 0;
  let authorized = 0;
  let overdue = 0;
  let approvals = 0;
  let approvedWithinDay = 0;
  let backedOut = 0;
  const pauseReasons: Record<string, number> = {};
  let compared = 0;
  let agreed = 0;

  for (const { record, messages } of rows) {
    if (record.status === "fixed") fixed++;

    // Hypothesis 1: time from Abate's first follow-up to management's first reply or scheduling.
    const live = liveMessages(messages);
    const sent = live
      .filter((m) => m.direction === "outgoing" && m.sentAt)
      .sort((a, b) => a.sentAt!.localeCompare(b.sentAt!));
    if (sent.length > 0) {
      started++;
      const firstSentAt = sent[0].sentAt!;
      const firstSentOn = nyDate(firstSentAt);
      baselines.push(Math.max(0, daysBetween(record.firstReportedOn, firstSentOn)));

      const replies = live
        .filter((m) => m.direction === "incoming" && (m.receivedAt ?? m.createdAt) >= firstSentAt)
        .map((m) => m.receivedAt ?? m.createdAt)
        .sort();
      // A reply, a scheduled repair, or the repair itself (the super often fixes it without writing).
      const fixedAt = record.fixedOn && record.fixedOn >= firstSentOn ? `${record.fixedOn}T23:59:59.000Z` : null;
      const candidates = [replies[0], record.repairScheduledAt, fixedAt].filter((t): t is string => Boolean(t) && t! >= firstSentAt).sort();
      const firstResponse = candidates[0];
      if (firstResponse) {
        const d = daysBetween(firstSentOn, firstResponse === fixedAt ? record.fixedOn! : nyDate(firstResponse));
        toReply.push(d);
        judged++;
        if (d <= 7) responded++;
        const before = sent.filter((m) => m.sentAt! <= firstResponse).pop();
        if (before?.step) afterStep[before.step] = (afterStep[before.step] ?? 0) + 1;
      } else if (daysBetween(firstSentOn, today) > 7) {
        judged++;
      } else {
        waiting++;
      }
    }

    // Hypothesis 2: did tenants let Abate send, approve promptly, and stay in?
    // Choosing Abate counts even if they later switched (that's counted as backing out instead).
    if (record.sendModeChosen) {
      offered++;
      if (record.sendAuthorizedAt) authorized++;
    }
    for (const m of messages) {
      if (m.direction !== "outgoing" || !m.approvedAt) continue;
      approvals++;
      const ready = m.readyOn ?? nyDate(m.approvedAt);
      if (daysBetween(ready, nyDate(m.approvedAt)) <= 1) approvedWithinDay++;
    }
    // A draft that's been ready for more than a day without approval counts as not approved in time.
    if (record.sendMode === "abate" && record.status === "open" && !record.pausedAt) {
      const { ladderCase, ladderMessages } = ladderInputs(record, messages);
      const action = nextAction(ladderCase, ladderMessages, today);
      if (action.kind === "send") {
        const ready = readyOnFor(action.step, action.dueOn, record, messages, today);
        if (daysBetween(ready, today) > 1) {
          approvals++;
          overdue++;
        }
      }
    }
    // pause_reason is never cleared, so a tenant who paused and resumed still counts.
    if (record.pauseReason) {
      backedOut++;
      pauseReasons[record.pauseReason] = (pauseReasons[record.pauseReason] ?? 0) + 1;
    }

    // Shadow mode: how often the AI agreed with our team's reading.
    for (const m of messages) {
      if (m.direction !== "incoming" || m.classifiedBy !== "team" || !m.classification || !m.aiClassification) continue;
      compared++;
      if (m.aiClassification === m.classification) agreed++;
    }
  }

  const rate = ratio(responded, judged);
  const authRate = ratio(authorized, offered);
  const approvalRate = ratio(approvedWithinDay, approvals);
  return {
    cases: rows.length,
    h1: {
      started,
      judged,
      responded,
      waiting,
      rate,
      pass: rate === null ? null : rate >= PASS.respondedWithin7,
      medianBaselineDays: median(baselines),
      medianDaysToReply: median(toReply),
      firstReplyAfterStep: afterStep,
      fixed,
    },
    h2: {
      offered,
      authorized,
      rate: authRate,
      authorizedPass: authRate === null ? null : authRate >= PASS.authorized,
      approvals,
      approvedWithinDay,
      overdue,
      approvalRate,
      approvalPass: approvalRate === null ? null : approvalRate >= PASS.approvedWithinDay,
      backedOut,
      backedOutPass: backedOut <= PASS.maxBackedOut,
      pauseReasons,
    },
    shadow: { compared, agreed, rate: ratio(agreed, compared) },
  };
}
