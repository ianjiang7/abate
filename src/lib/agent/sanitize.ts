// Guardrails on every reading, whichever reader produced it. The reply reference goes into a
// message the tenant sends, so it must stay a plain, factual sentence about what management said:
// no legal or money language and no threats (see "Guardrails" in AGENTS.md).

import { addDays, isIsoDate, type IsoDate } from "@/lib/domain/dates";
import { isReplyCategory, type ReplyCategory } from "@/lib/domain/ladder";
import { splitSentences } from "./text";
import type { ReplyReading } from "./types";

export const SUMMARY_MAX = 140;
export const REFERENCE_MAX = 220;
/** A mentioned date is kept only inside this window around the day the reply arrived. */
export const DATE_WINDOW = { daysBefore: 7, daysAfter: 90 } as const;

const LEGAL_OR_MONEY =
  /\b(warrant(?:y|ies)|habitab\w*|abat\w*|owe|owed|owes|owing|rents?|sue|sued|sues|suing|lawsuits?|courts?|lawyers?|attorneys?|legal\w*|illegal\w*|violations?|judges?|damages|compensat\w*|refunds?|refunded|reimburs\w*|penalt\w*|fees?|fined|fines|dollars?|money|costs?|charged?|charges|billed|billing|hpd|dhcr|statutes?|laws?|liab\w*|negligen\w*|breach\w*|leases?|pay|pays|paid|paying|payments?|credit\w*|free months?|deposits?)\b|\$/i;
const THREAT =
  /\b(threat\w*|or else|consequences|evict\w*|retaliat\w*|police|cops?|arrest\w*|report (?:you|this|them)|withhold\w*|rent strike|warning|demand\w*|or i will|or i'll|311)\b/i;
// The reference reports what management said, without judging them.
const JUDGMENT = /\b(slumlords?|liars?|lied|lying|incompetent|pathetic|disgusting|ridiculous|unacceptable|shameful|outrageous|lazy)\b/i;
const PROFANITY = /\b(f+u+c+k\w*|shit\w*|bitch\w*|asshole\w*|bastard\w*|damn\w*|crap)\b/i;
const LINK_OR_EMAIL = /https?:\/\/|www\.|[\w.+-]+@[\w-]+\.[\w.]+/i;

/** True if the text has legal or money language, a threat or demand, a judgment, profanity, or a link. */
export function hasBlockedLanguage(text: string): boolean {
  return [LEGAL_OR_MONEY, THREAT, JUDGMENT, PROFANITY, LINK_OR_EMAIL].some((re) => re.test(text.replace(/[‘’]/g, "'")));
}

/**
 * True if the text is a single sentence. A quoted reply counts as part of the sentence around it,
 * but a sentence ending inside the quote still ends the sentence, so `you replied: "Received." Fix it.`
 * is two sentences.
 */
export function isOneSentence(text: string): boolean {
  if (/…\s/.test(text)) return false;
  const quotesBlanked = text.replace(/[“"]([^”"]*)[”"]/g, (_m, inner: string) => (/[.!?…]\s*$/.test(inner) ? '"Q".' : '"Q"'));
  return splitSentences(quotesBlanked).length === 1;
}

/** "October 17" for the reply reference. */
export function monthDay(date: IsoDate): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric" });
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Shortens text to `max` characters at a word boundary, ending with an ellipsis. */
export function truncate(text: string, max: number): string {
  const clean = oneLine(text);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const atWord = cut.slice(0, Math.max(cut.lastIndexOf(" "), Math.floor(max * 0.6)));
  return `${atWord.replace(/[\s,;:.-]+$/, "")}…`;
}

/** Keeps a mentioned date only if it is a real ISO date within the window around `receivedOn`. */
export function sanitizeDate(value: unknown, receivedOn: IsoDate): IsoDate | null {
  if (!isIsoDate(value)) return null;
  const earliest = addDays(receivedOn, -DATE_WINDOW.daysBefore);
  const latest = addDays(receivedOn, DATE_WINDOW.daysAfter);
  return value >= earliest && value <= latest ? value : null;
}

/**
 * Keeps the reply reference only if it is one plain sentence, addressed to management, that
 * starts "On <day the reply arrived> you", fits in REFERENCE_MAX characters, and has no blocked
 * language. Anything else becomes null, and the message is sent without it.
 */
export function sanitizeReplyReference(value: unknown, receivedOn: IsoDate): string | null {
  if (typeof value !== "string") return null;
  let ref = oneLine(value);
  if (!ref) return null;
  if (!/[.!?…]["']?$/.test(ref)) ref = `${ref}.`;
  if (ref.length > REFERENCE_MAX) return null;
  const prefix = new RegExp(`^On ${monthDay(receivedOn)},? you\\b`);
  if (!prefix.test(ref)) return null;
  if (!isOneSentence(ref)) return null;
  if (hasBlockedLanguage(ref)) return null;
  return ref;
}

const DEFAULT_SUMMARY: Record<ReplyCategory, string> = {
  acknowledged_no_date: "Acknowledges the request but gives no repair date.",
  scheduled: "Says the repair or visit is scheduled.",
  needs_access: "Asks for access to the apartment.",
  disputes_or_refuses: "Disputes the problem or refuses the repair.",
  says_fixed: "Says the repair is done.",
  unclear: "Reply needs a teammate to read it.",
};

export function defaultSummary(category: ReplyCategory): string {
  return DEFAULT_SUMMARY[category];
}

export function sanitizeSummary(value: unknown, category: ReplyCategory): string {
  const text = typeof value === "string" ? oneLine(value) : "";
  return text ? truncate(text, SUMMARY_MAX) : defaultSummary(category);
}

export type RawReading = {
  category: unknown;
  summary?: unknown;
  mentionedDate?: unknown;
  replyReference?: unknown;
};

/** Applies every rule above. Throws if the category isn't one of the six, so the caller can fall back. */
export function sanitizeReading(raw: RawReading, receivedOn: IsoDate, source: string): ReplyReading {
  if (!isReplyCategory(raw.category)) throw new Error("Reading has an unknown category.");
  const category = raw.category;
  return {
    category,
    summary: sanitizeSummary(raw.summary, category),
    mentionedDate: sanitizeDate(raw.mentionedDate, receivedOn),
    replyReference: category === "unclear" ? null : sanitizeReplyReference(raw.replyReference, receivedOn),
    source,
  };
}
