// Pure rules behind the case service, kept separate so they can be unit tested.

import { nyDate, type IsoDate } from "@/lib/domain/dates";
import type { StepId } from "@/lib/domain/ladder";
import type { CaseRecord, MessageRecord } from "./types";
import { liveMessages, messageTime } from "./view";

/**
 * When a logged reply "arrived". Today's replies get the current time. A past date gets noon New
 * York time, but never earlier than a message we sent that same day (a reply logged the next
 * morning for yesterday afternoon must not sort before our own message), and never in the future.
 */
export function receivedAtFor(receivedOn: IsoDate, messages: MessageRecord[], now: Date = new Date()): string {
  const nowIso = now.toISOString();
  if (receivedOn === nyDate(now)) return nowIso;
  let at = `${receivedOn}T16:00:00.000Z`;
  for (const m of messages) {
    if (m.direction !== "outgoing") continue;
    const sent = messageTime(m);
    if (nyDate(sent) === receivedOn && sent >= at) {
      at = new Date(Date.parse(sent) + 1000).toISOString();
    }
  }
  return at > nowIso ? nowIso : at;
}

/** Assumption 1: the first reply that came after Abate's first notice (earlier replies are the old chasing). */
export function firstReplyAfterNotice(messages: MessageRecord[]): string | null {
  const sent = messages.filter((m) => m.direction === "outgoing").map(messageTime).sort();
  if (sent.length === 0) return null;
  const replies = messages
    .filter((m) => m.direction === "incoming")
    .map(messageTime)
    .filter((t) => t >= sent[0])
    .sort();
  return replies[0] ?? null;
}

const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Assumption 2: did the tenant change the draft? Filling in a required "[add ...]" placeholder
 * doesn't count as an edit; anything else does.
 */
export function draftWasEdited(draft: { subject: string; body: string }, sent: { subject: string; body: string }): boolean {
  if (normalize(sent.subject) !== normalize(draft.subject)) return true;
  const draftBody = normalize(draft.body);
  const sentBody = normalize(sent.body);
  if (draftBody === sentBody) return false;
  const parts = draftBody.split(/\[add [^\]]+\]/);
  if (parts.length === 1) return true;
  const pattern = new RegExp(`^${parts.map(escapeRegExp).join("(.+?)")}$`);
  return !pattern.test(sentBody);
}

/**
 * The day a step became ready for the tenant, for hypothesis 2's "approved within a day": the
 * notice when the case started, a reply-driven step when someone read the reply, a missed-repair
 * message when the tenant reported the miss, and a timed step on its due date. Never later than today.
 */
export function readyOnFor(step: StepId, dueOn: IsoDate, record: CaseRecord, all: MessageRecord[], today: IsoDate): IsoDate {
  const messages = liveMessages(all);
  const sent = messages
    .filter((m) => m.direction === "outgoing" && m.sentAt)
    .map((m) => m.sentAt!)
    .sort();
  const lastSent = sent[sent.length - 1];
  const replies = messages.filter((m) => m.direction === "incoming").sort((a, b) => messageTime(a).localeCompare(messageTime(b)));
  const lastReply = replies[replies.length - 1];

  let ready: IsoDate;
  if (step === "notice") ready = nyDate(record.createdAt);
  else if (step === "missed_repair" && record.repairMissedAt) ready = nyDate(record.repairMissedAt);
  else if (lastReply?.classification && (!lastSent || messageTime(lastReply) > lastSent)) ready = nyDate(lastReply.classifiedAt ?? messageTime(lastReply));
  else ready = dueOn;
  return ready > today ? today : ready;
}
