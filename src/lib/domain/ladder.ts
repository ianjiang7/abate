// The escalation ladder: which follow-up comes next, and when.
// Pure logic so it can be unit tested and recomputed whenever a message is sent or logged.

import { addDays, maxDate, nyDate, type IsoDate } from "./dates";

export const REPLY_CATEGORIES = [
  { id: "acknowledged_no_date", label: "Acknowledged, no date given" },
  { id: "scheduled", label: "Repair scheduled" },
  { id: "needs_access", label: "Needs access to the unit" },
  { id: "disputes_or_refuses", label: "Disputes or refuses" },
  { id: "says_fixed", label: "Says it's fixed" },
  { id: "unclear", label: "Unclear" },
] as const;

export type ReplyCategory = (typeof REPLY_CATEGORIES)[number]["id"];

export function isReplyCategory(value: unknown): value is ReplyCategory {
  return REPLY_CATEGORIES.some((c) => c.id === value);
}

export function replyCategoryLabel(id: ReplyCategory): string {
  return REPLY_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export type StepId =
  | "notice"
  | "reminder"
  | "formal_notice"
  | "guide_311"
  | "ask_date"
  | "confirm_schedule"
  | "offer_access"
  | "missed_repair";

export const STEP_LABELS: Record<StepId, string> = {
  notice: "Written notice",
  reminder: "Reminder",
  formal_notice: "Formal notice",
  guide_311: "311 complaint",
  ask_date: "Ask for a date",
  confirm_schedule: "Confirm the repair date",
  offer_access: "Offer access times",
  missed_repair: "Missed repair",
};

/** Timed steps, in days after the first notice. Compressed for the sprint (see AGENTS.md). */
export const TIMED_STEPS: ReadonlyArray<{ step: StepId; day: number }> = [
  { step: "notice", day: 0 },
  { step: "reminder", day: 3 },
  { step: "formal_notice", day: 5 },
  { step: "guide_311", day: 7 },
];

/** Never schedule a timed step sooner than this many days after the last message we sent. */
export const MIN_GAP_DAYS = 2;

export type LadderMessage = {
  direction: "outgoing" | "incoming";
  /** ISO timestamp when it was sent (outgoing) or received (incoming). */
  at: string;
  step?: StepId | null;
  classification?: ReplyCategory | null;
};

export type LadderCase = {
  status: "open" | "fixed";
  repairScheduledFor?: IsoDate | null;
  /** ISO timestamp when the tenant said a scheduled repair didn't happen. */
  repairMissedAt?: string | null;
};

export type NextAction =
  | { kind: "send"; step: StepId; dueOn: IsoDate; reason: string }
  | { kind: "confirm_fixed"; reason: string }
  | { kind: "checkin"; scheduledFor: IsoDate; reason: string }
  | { kind: "waiting_for_repair"; scheduledFor: IsoDate; reason: string }
  | { kind: "team_review"; reason: string }
  | { kind: "all_sent"; reason: string }
  | { kind: "done"; reason: string };

const byTime = (a: LadderMessage, b: LadderMessage) => a.at.localeCompare(b.at);

export function nextAction(c: LadderCase, messages: LadderMessage[], today: IsoDate): NextAction {
  if (c.status === "fixed") return { kind: "done", reason: "The repair is marked fixed." };

  const outgoing = messages.filter((m) => m.direction === "outgoing").sort(byTime);
  const incoming = messages.filter((m) => m.direction === "incoming").sort(byTime);

  if (outgoing.length === 0) {
    return { kind: "send", step: "notice", dueOn: today, reason: "Start with a written notice, so there's a dated record." };
  }

  const lastOut = outgoing[outgoing.length - 1];
  const lastIn = incoming[incoming.length - 1];
  const sent = new Set(outgoing.map((m) => m.step).filter(Boolean));

  // A scheduled repair that didn't happen, reported after our last message.
  if (c.repairMissedAt && c.repairMissedAt > lastOut.at) {
    return { kind: "send", step: "missed_repair", dueOn: today, reason: "The scheduled repair didn't happen. Ask for a new date in writing." };
  }

  // A reply we haven't answered yet decides the path.
  if (lastIn && lastIn.at > lastOut.at) {
    switch (lastIn.classification) {
      case "acknowledged_no_date":
        return { kind: "send", step: "ask_date", dueOn: today, reason: "They answered but gave no date. Ask for one." };
      case "scheduled":
        if (c.repairScheduledFor && today > c.repairScheduledFor) {
          return { kind: "checkin", scheduledFor: c.repairScheduledFor, reason: "The repair date has passed. Was it fixed?" };
        }
        return { kind: "send", step: "confirm_schedule", dueOn: today, reason: "Confirm the repair date in writing." };
      case "needs_access":
        return { kind: "send", step: "offer_access", dueOn: today, reason: "They need to get in. Offer times that work for you." };
      case "disputes_or_refuses":
        if (!sent.has("formal_notice")) {
          return { kind: "send", step: "formal_notice", dueOn: today, reason: "They pushed back. Send the formal notice now." };
        }
        if (!sent.has("guide_311")) {
          return { kind: "send", step: "guide_311", dueOn: today, reason: "They pushed back after the formal notice. File with 311." };
        }
        return { kind: "all_sent", reason: "Every step has been sent." };
      case "says_fixed":
        return { kind: "confirm_fixed", reason: "Management says it's fixed. Is it?" };
      default:
        return { kind: "team_review", reason: "A teammate is reading this reply and will help with the next step." };
    }
  }

  // An appointment only stands while the latest reply is the one that scheduled it. A later reply
  // that says something else (a cancellation, a dispute) makes it moot.
  const scheduleActive = Boolean(c.repairScheduledFor) && (!lastIn || lastIn.classification === "scheduled");
  if (c.repairScheduledFor && scheduleActive) {
    if (today <= c.repairScheduledFor) {
      return { kind: "waiting_for_repair", scheduledFor: c.repairScheduledFor, reason: "The repair is scheduled." };
    }
    return { kind: "checkin", scheduledFor: c.repairScheduledFor, reason: "The repair date has passed. Was it fixed?" };
  }

  const firstSentOn = nyDate(outgoing[0].at);
  const lastSentOn = nyDate(lastOut.at);
  for (const { step, day } of TIMED_STEPS) {
    if (sent.has(step)) continue;
    const dueOn = maxDate(addDays(firstSentOn, day), addDays(lastSentOn, MIN_GAP_DAYS));
    return { kind: "send", step, dueOn, reason: timedReason(step) };
  }
  return { kind: "all_sent", reason: "Every step has been sent." };
}

function timedReason(step: StepId): string {
  switch (step) {
    case "reminder":
      return "No useful reply yet. A short reminder keeps the record going.";
    case "formal_notice":
      return "Still no repair. The formal notice lays out the timeline and what you may be owed.";
    case "guide_311":
      return "Time to bring in the city. File a 311 complaint and let management know.";
    default:
      return "";
  }
}

/** The step and due date to store on the case, so teammates can see what's due in Supabase. */
export function dueSummary(action: NextAction, today: IsoDate): { nextStep: string | null; nextDueOn: IsoDate | null } {
  switch (action.kind) {
    case "send":
      return { nextStep: action.step, nextDueOn: action.dueOn };
    case "checkin":
    case "waiting_for_repair":
      // Stored fields only change when the tenant acts, so schedule the day-after check-in now.
      return { nextStep: "checkin", nextDueOn: addDays(action.scheduledFor, 1) };
    case "confirm_fixed":
    case "team_review":
      return { nextStep: action.kind, nextDueOn: today };
    default:
      return { nextStep: null, nextDueOn: null };
  }
}
