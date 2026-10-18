// The stand-in reader: keyword rules, no network. It runs when there is no ANTHROPIC_API_KEY or
// the Claude API fails, so the ladder keeps moving. A teammate checks every reading either way.
//
// Precedence, when a reply carries more than one signal (the Claude prompt uses the same order):
//   1. scheduled            a concrete future date for a visit or repair ("will come Tuesday"), not
//                           a cancelled or refused one ("can't come Tuesday"), a recurring one
//                           ("every Tuesday") or one about something else ("we'll respond Monday")
//   2. says_fixed           says the repair is done ("we fixed it", "heat is back on"), not a
//                           promise ("heat will be back once the part arrives")
//   3. needs_access         asks to get in, or offers times to pick from ("which day works?")
//   4. disputes_or_refuses  denies the problem or responsibility, or refuses ("not our responsibility")
//   5. acknowledged_no_date answers without a date ("received", "we'll look into it", "next week")
//   6. unclear              anything else, including out-of-office replies

import { formatLongDate, type IsoDate } from "@/lib/domain/dates";
import type { ReplyCategory } from "@/lib/domain/ladder";
import { findDateMentions, type DateMention } from "./resolve-dates";
import { defaultSummary, monthDay, sanitizeDate, sanitizeReading, truncate } from "./sanitize";
import { cleanReply, isFiller, normalizeText, splitSentences, withoutGreeting } from "./text";
import type { ReadReplyInput, ReplyReading } from "./types";

export const STANDIN_SOURCE = "stand-in";
const QUOTE_MAX = 140;

const OUT_OF_OFFICE =
  /\b(out of (the )?office|out of office|on vacation|on leave|away from (my|the) desk|limited access to (e-?mail|email))\b/;

// "can" but not "can't": a refusal is not a plan.
const VISIT_INTENT =
  /\b(will|shall|going to|gonna|could|plans? to|planning to|scheduled|rescheduled|booked|coming|come|be there|be by|stop by|arriv\w*|appointment|visit|set for|expect\w*)\b|\bcan\b(?!'t)|'ll\b/;
// A scheduled reply must be about someone coming, the work, or the broken thing itself, not just
// any future date ("we will respond Monday", "rent will be due on the 1st").
const REPAIR_WORDS =
  /\b(plumbers?|super|superintendent|handyman|technicians?|tech|electricians?|exterminators?|contractors?|locksmith|maintenance|crew|team|workers?|vendor|inspector|porter|staff|someone|somebody|repair\w*|fix\w*|replac\w*|install\w*|inspect\w*|treat\w*|servic\w*|patch\w*|paint\w*|address\w*|handl\w*|check|look at|come|comes|coming|come by|drop by|stop by|stop in|swing by|be there|be by|be at|visit\w*|appointment|scheduled|rescheduled|booked|set for|arriv\w*|send\w*|work|apartment|apt|unit|heat|hot water|water|boiler|radiators?|leak\w*|pipes?|sink|toilet|tub|shower|drain|window|door|lock|mold|outlets?|lights?|power|ceiling|elevator|pests?|mice|rats?|roaches|bedbugs)\b/;
const OFFER = /\?|\bwhich (day|days|time|times|works?)\b|\b(does|do|would|will) (that|this|it|any of (these|those)) work\b|\bworks? (best )?for you\b/;
// "can't come Tuesday", "won't be coming", "no one will be there", "not until Monday at the earliest".
const NEGATED =
  /\b(not|never|cannot|unable|no longer|no one|nobody|noone|cant|wont|dont|didnt|couldnt)\b|n't\b|\bat the earliest\b|\bno earlier than\b/;
const CANCELLED = /\b(cancel\w*|called off|call(?:ing)? off|postpon\w*|pushed back)\b/;
// "postponed to Thursday" or "moved from Tuesday to Thursday": the new date is the one that counts.
const NEW_DATE_BEFORE = /\b(to|until|till|for)\s+(the\s+)?$/;
const OLD_DATE_BEFORE = /\bfrom\s+(the\s+)?$/;
const MOVED = /\b(resched\w*|moved|postpon\w*|pushed|changed)\b/;
// Dates that aren't about the repair: when the office will answer, rent, a standing building schedule.
const NOT_ABOUT_REPAIR =
  /\b(respond|response|reply|replies|get back to|follow up|update you|let you know|be in touch|reach out|call you|email you|text you|contact you|reopen\w*|rent|rents|payments?|late fees?|invoice|lease|renewal)\b|\b(we are|we're|office is|office will be|we will be) closed\b|\bdue\b(?!\s+to\b)/;
const RECURRING =
  /\b(every|each)\s+(other\s+|second\s+|third\s+)?(day|week|month|morning|afternoon|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|weds?|thu(rs?)?|fri|sat|sun)\b|\b(daily|weekly|biweekly|monthly)\b/;
// Clause boundaries within a sentence, so "We can't come Monday, but we will come Tuesday" reads as Tuesday.
// A colon between digits ("10:30") is a time, not a boundary.
const CLAUSE_BREAK = /[,;()]|:(?!\d)|\s[-–—]\s|\b(?:but|however|although|though|whereas)\b/gi;

const FIXED_PATTERNS = [
  /\b(has|have|had) been (fixed|repaired|replaced|resolved|restored|completed|taken care of|addressed|serviced|treated|sealed|patched|cleared|unclogged)\b/,
  /\b(was|were|is|are) (now |all )?(fixed|repaired|replaced|resolved|restored|completed|taken care of)\b/,
  /\b(we|i|he|she|they|super|plumber|electrician|technician|tech|handyman|exterminator|contractor|maintenance|crew|team|someone|porter)\b[^.!?]{0,40}\b(fixed|repaired|replaced|resolved|restored|sealed|patched|unclogged|completed|took care of|exterminated|treated|installed)\b/,
  /^(fixed|done|repaired|all set|resolved|completed|taken care of)\b/,
  /\balready (fixed|repaired|took care|taken care|handled|done|replaced)\b/,
  /\b(heat|hot water|water|power|electricity|lights?|gas|elevator|outlet|toilet|sink)\b[^.!?]{0,25}\b(is|are)\b[^.!?]{0,10}\b(back( on| up)?|restored|working (again|now)|on again)\b/,
  /\b(working|functioning|running) (again|now|properly now|fine now)\b/,
  // "should be back" alone is a promise; "should be working now" reports a repair.
  /\bshould (now )?be (working|fine|good|all set|back)( on| up)?( again)? now\b|\bshould now be (working|fine|good|all set|back)\b/,
  /\bwork order\b[^.!?]{0,60}\b(completed|closed)\b/,
  /\b(it'?s|it is|that'?s|this is) (all )?(done|fixed|all set|taken care of|resolved)\b/,
];
const FIXED_NEGATION = /\b(not|isn'?t|wasn'?t|aren'?t|haven'?t|hasn'?t|never|yet to)\b/;
// Words that turn "the heat is back" into a promise or a condition, when they come before it in
// the clause ("once the heat is back", "we hope the heat is back") or right after ("back soon").
const FIX_HEDGE_BEFORE =
  /\b(will|going to|gonna|plans? to|planning to|scheduled|need to|needs to|to be|once|until|till|when|hope|hopefully|expect\w*|as soon as|by the time|if)\b|'ll\b/;
const FIX_HEDGE_AFTER = /\b(once|until|till|soon|shortly|as soon as)\b/;
const SHOULD = /\bshould\b(?!\s+have\b)/;
// "The elevator is working again but we still need to look at your radiator" isn't a finished repair.
const STILL_OPEN =
  /\bstill (need|needs|have to|has to|waiting|working on|broken|out|leaking|not|cold|no)\b|\bbut\b[^.!?]*\b(still|need to|needs to|have to|has to)\b/;

const ACCESS_PATTERNS = [
  /\b(access|entry|enter)\b/,
  /\bget in(to)?\b/,
  /\blet (us|him|her|them|the \w+|our \w+) in\b/,
  /\b(be|someone|somebody|anyone|an adult) (will be )?(home|present|available)\b/,
  /\b(no one|nobody|noone) (was home|answered|was there|was available)\b/,
  /\b(not home|didn'?t answer|no answer|couldn'?t get in)\b/,
  /\b(when|what time) (are|r|will) (you|u)( be)? (home|available|around)\b/,
  /\b(leave|drop off|give us) (a|the|your) key\b|\bmaster key\b/,
  /\b(your|ur) availability\b|\bwhat (day|days|time|times) (work|works|is good)\b|\bwhich (day|days|time|times) (work|works)\b/,
  /\b(set up|schedule|arrange|coordinate) a (time|day|visit|appointment)\b/,
  /\b(dates and times|days and times|times that work)\b/,
];

const DISPUTE_PATTERNS = [
  /\bnot (our|the landlord'?s|the building'?s|management'?s|my) (problem|responsibility|issue|fault|concern)\b/,
  /\b(your|ur|tenant'?s|tenants'?) (responsibility|problem|fault)\b/,
  /\b(tenants?|you) (are|is) responsible\b/,
  /\bnot responsible\b/,
  /\b(caused|damaged|created|brought in|broken) by (you|your|the tenant|tenants|a tenant)\b/,
  /\btenant (damage|maintenance|responsibility|negligence)\b/,
  /\b(we|i|management|the landlord) (will not|won'?t|cannot|can'?t|are not going to|aren'?t going to|refuse to|do not|don'?t|will no longer) (be )?(fix|repair|replac|repaint|paint|come|send|do|handl|cover|pay|treat|address)\w*/,
  /\bno (further action|further repairs)\b|\bnothing (wrong|we can do|more we can do)\b/,
  /\bfound no\b|\bthere (is|was|are|were) no (leak|mold|problem|issue|sign|evidence|pests?|mice|roaches)\b|\bno (active|visible) (leak|mold|problem)\b/,
  /\b(meets|meet|within|complies with|in compliance with|up to) (the )?(city |legal |building )?(requirements|code|limits|standards|range|guidelines)\b/,
  /\b(running|working|operating|functioning) (normally|properly|fine|as (it|they) should)\b/,
  /\b(cosmetic|normal wear|wear and tear|not a priority)\b/,
  /\binsurance\b/,
  /\b(charged?|billed?|deducted) (to )?(you|your account|from your)\b|\bat your (own )?expense\b/,
  /\bper (your|the) lease\b|\byour lease (says|states)\b/,
  /\bstop (sending|emailing|contacting|texting|calling|writing)\b|\bmove out\b|\bdon'?t (email|contact|text|call) (us|me|the office)\b/,
  /\bbuy (traps|bait|spray|a|your own)\b|\b(hire|call) (your own|a private)\b|\bclean it\b|\b(fix|treat) it yourself\b/,
  /\b(deny|denied|refuse|refused|decline|declined|reject|rejected)\b/,
  /\bnot our problem\b|\bnot (a|our) concern\b/,
];

const ACK_PATTERNS = [
  /\b(received|got|have|saw) (your|the) (email|message|request|note|complaint|letter|text|follow[- ]?up)s?\b/,
  /^received\b|\bhas been received\b|\bwell received\b/,
  /\b(look|looking|check|checking) (in)?to (it|this|that|the)\b|\bwill (look|check) (into|on|at)\b/,
  /\b(forwarded|passed (this |it |that )?(along|on)|sent (this|it) to|escalated|notified|informed|let (the|our) \w+ know)\b/,
  /\bwork order\b|\bticket\b|\bservice request\b|\brequest #?\d+/,
  /\b(we are|we're|i am|i'm) (aware|on it|working on)\b|\bworking on (it|this)\b|\bon it\b/,
  /\b(will|'ll) (follow up|get back|reach out|contact you|be in touch|update you|keep you|let you know|send someone|have someone|take care of|fix|repair|address|handle|reschedule|get (someone|it))\b/,
  /\b(should|will) be (back|working|fixed|repaired|restored|done)\b|\bonce the parts? (arrives?|comes? in|is in|are in)\b/,
  /\b(asap|as soon as possible|shortly|soon|in the queue|on (the|our) list|next week|this week|in a few days|be patient)\b/,
  /\bparts? (are|is) (on order|ordered|coming)\b/,
  /\bnoted\b|\bthanks? (you )?for (letting us know|reaching out|your patience|the heads up|your (email|message))\b/,
  /\bsorry (for|about) the (delay|slow|late)\b/,
  /^(ok|okay|k|will do)\b/,
];

type Sentence = { text: string; lower: string; mentions: DateMention[] };

function readSentences(cleaned: string, receivedOn: IsoDate): Sentence[] {
  return splitSentences(cleaned).map((text) => ({
    text,
    lower: normalizeText(text).toLowerCase(),
    // A date the sanitizer would drop anyway can't decide the category either.
    mentions: findDateMentions(text, receivedOn).filter((m) => sanitizeDate(m.date, receivedOn) !== null),
  }));
}

/** The clause of `text` around [index, end): bounded by commas, colons, "but" and the like. */
function clauseAt(text: string, index: number, end: number): { start: number; stop: number } {
  let start = 0;
  let stop = text.length;
  for (const m of text.matchAll(CLAUSE_BREAK)) {
    const at = m.index ?? 0;
    if (at + m[0].length <= index) start = at + m[0].length;
    else if (at >= end) {
      stop = at;
      break;
    }
  }
  return { start, stop };
}

const isFutureMention = (m: DateMention, receivedOn: IsoDate) =>
  m.date > receivedOn || (m.date === receivedOn && m.tense !== "past");

/** "Wednesday or Thursday?" or "Can you be home Monday?": dates offered, not set. */
function offersDates(s: Sentence, receivedOn: IsoDate): boolean {
  const future = s.mentions.filter((m) => isFutureMention(m, receivedOn));
  if (future.length === 0) return false;
  return OFFER.test(s.lower) || (future.length > 1 && /\bor\b/.test(s.lower));
}

/**
 * The date of a visit or repair this sentence sets, or null. Each future date is checked in its own
 * clause: skipped when that clause cancels or negates the visit ("can't come Tuesday", "Tuesday's
 * appointment is cancelled"), repeats on a schedule ("every Tuesday"), or is about something other
 * than the repair ("we will respond Monday", "rent is due on the 1st").
 */
function plannedVisitDate(s: Sentence, receivedOn: IsoDate): IsoDate | null {
  if (!VISIT_INTENT.test(s.lower) || !REPAIR_WORDS.test(s.lower) || offersDates(s, receivedOn)) return null;
  const sentenceNegated = NEGATED.test(s.lower) || CANCELLED.test(s.lower);
  for (const m of s.mentions) {
    if (!isFutureMention(m, receivedOn)) continue;
    const { start, stop } = clauseAt(s.lower, m.index, m.end);
    const clause = s.lower.slice(start, stop);
    const before = s.lower.slice(0, m.index);
    if (RECURRING.test(clause) || NOT_ABOUT_REPAIR.test(clause) || NEGATED.test(clause)) continue;
    if (CANCELLED.test(clause) && !NEW_DATE_BEFORE.test(before)) continue;
    if (MOVED.test(s.lower) && OLD_DATE_BEFORE.test(before)) continue;
    // "Unfortunately, Tuesday, the plumber can't come": the clause must state the plan on its own.
    if (sentenceNegated && !VISIT_INTENT.test(clause)) continue;
    return m.date;
  }
  return null;
}

/** True if the sentence says the repair is already done, not promised or conditional. */
function saysFixed(lower: string): boolean {
  if (FIXED_NEGATION.test(lower) || STILL_OPEN.test(lower)) return false;
  return FIXED_PATTERNS.some((re) => {
    const m = re.exec(lower);
    if (!m) return false;
    const matchEnd = m.index + m[0].length;
    const { start, stop } = clauseAt(lower, matchEnd - 1, matchEnd);
    const before = lower.slice(Math.min(start, m.index), matchEnd);
    const after = lower.slice(matchEnd, stop);
    if (FIX_HEDGE_BEFORE.test(before) || FIX_HEDGE_AFTER.test(after)) return false;
    return !(SHOULD.test(before) && !/\bnow\b/.test(lower.slice(start, stop)));
  });
}

type Verdict = { category: ReplyCategory; sentence: string | null; date: IsoDate | null };

function classify(cleaned: string, receivedOn: IsoDate): Verdict {
  const sentences = readSentences(cleaned, receivedOn);
  const firstDate = (s: Sentence) => s.mentions[0]?.date ?? sentences.find((x) => x.mentions.length)?.mentions[0].date ?? null;
  const firstMatching = (patterns: RegExp[]) => sentences.find((s) => patterns.some((re) => re.test(s.lower))) ?? null;

  if (OUT_OF_OFFICE.test(normalizeText(cleaned).toLowerCase())) return { category: "unclear", sentence: null, date: null };

  // 1. A concrete future date for a visit or repair, stated as a plan rather than offered as a choice.
  for (const s of sentences) {
    const date = plannedVisitDate(s, receivedOn);
    if (date) return { category: "scheduled", sentence: s.text, date };
  }

  // 2. Says the repair is done.
  const fixed = sentences.find((s) => saysFixed(s.lower)) ?? null;
  if (fixed) return { category: "says_fixed", sentence: fixed.text, date: firstDate(fixed) };

  // 3. Offers times to choose from, or asks to get in.
  const access = sentences.find((s) => offersDates(s, receivedOn)) ?? firstMatching(ACCESS_PATTERNS);
  if (access) return { category: "needs_access", sentence: access.text, date: firstDate(access) };

  // 4. Denies the problem or responsibility, or refuses.
  const dispute = firstMatching(DISPUTE_PATTERNS);
  if (dispute) return { category: "disputes_or_refuses", sentence: dispute.text, date: firstDate(dispute) };

  // 5. Answers without a date.
  const ack = firstMatching(ACK_PATTERNS);
  if (ack) return { category: "acknowledged_no_date", sentence: ack.text, date: null };

  return { category: "unclear", sentence: null, date: null };
}

/** The sentence to quote back: the one that decided the category, else the first one with content. */
function quotableSentence(cleaned: string, decisive: string | null): string | null {
  if (decisive && !isFiller(decisive)) return decisive;
  return splitSentences(cleaned).find((s) => !isFiller(s)) ?? null;
}

function quoteReference(sentence: string | null, receivedOn: IsoDate): string | null {
  if (!sentence) return null;
  const trimmed = withoutGreeting(sentence).replace(/"/g, "'");
  let quote = truncate(trimmed.charAt(0).toUpperCase() + trimmed.slice(1), QUOTE_MAX);
  if (!/[.!?…]$/.test(quote)) quote = `${quote}.`;
  return `On ${monthDay(receivedOn)} you replied: "${quote}"`;
}

function summarize(category: ReplyCategory, date: IsoDate | null): string {
  const when = date ? formatLongDate(date) : null;
  switch (category) {
    case "scheduled":
      return when ? `Says the repair or visit is set for ${when}.` : defaultSummary(category);
    case "says_fixed":
      return when ? `Says the repair was done on ${when}.` : defaultSummary(category);
    case "needs_access":
      return when ? `Asks for access to the apartment; mentions ${when}.` : defaultSummary(category);
    default:
      return defaultSummary(category);
  }
}

/** Reads a reply with keyword rules. Deterministic and offline. */
export function readReplyStandIn(input: ReadReplyInput): ReplyReading {
  const cleaned = cleanReply(input.replyText);
  const verdict = classify(cleaned, input.receivedOn);
  const date = sanitizeDate(verdict.date, input.receivedOn);
  return sanitizeReading(
    {
      category: verdict.category,
      summary: summarize(verdict.category, date),
      mentionedDate: date,
      replyReference: verdict.category === "unclear" ? null : quoteReference(quotableSentence(cleaned, verdict.sentence), input.receivedOn),
    },
    input.receivedOn,
    STANDIN_SOURCE,
  );
}
