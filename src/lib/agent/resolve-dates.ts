// Finds the dates a reply mentions ("tomorrow", "next Monday", "10/23", "October 22nd") and turns
// them into calendar dates, relative to the New York date the reply arrived.

import { addDays, daysBetween, isIsoDate, type IsoDate } from "@/lib/domain/dates";

export type DateMention = {
  date: IsoDate;
  /** Where the phrase starts and ends in the text. */
  index: number;
  end: number;
  phrase: string;
  /** True when the phrase names the calendar date itself (10/23, Oct 23) rather than a relative day. */
  explicit: boolean;
  /** Whether the words around the phrase talk about the past ("came Monday") or the future ("will come Monday"). */
  tense: "past" | "future" | null;
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH =
  "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

const NUMERIC = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/g;
// "1/2 inch valve", "3/4 pipe", "1 1/2" or "1/2 of the ceiling" are fractions, not month/day.
const FRACTION_AFTER =
  /^\s*(?:["”″]|''|-?\s*inch(?:es)?\b|-in\b|\s?in\.|\s?(?:ft|mm|cm)\b|\s?(?:foot|feet)\b|\s+(?:pipe|valve|fitting|line|copper|pvc|pex|drain|nut|bolt|screw|thread|turn|cup|gallon)s?\b|\s+of (?:an?|the)\b)/i;
const FRACTION_BEFORE = /\d[\s-]$/;
const MONTH_DAY = new RegExp(`\\b${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, "gi");
const DAY_OF_MONTH = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+of\\s+${MONTH}\\b(?:,?\\s+(\\d{4}))?`, "gi");
const ORDINAL_DAY = /\bthe\s+(\d{1,2})(st|nd|rd|th)\b(?!\s*(?:floor|fl\b|ave|avenue|street|st\b|of\b))/gi;
const RELATIVE =
  /\b(day after tomorrow|tomorrow|tomorow|tmrw|tmr|2morrow|today|tonight|this (?:morning|afternoon|evening)|yesterday)\b/gi;
const WEEKDAY =
  /\b(?:(this past|last|next|this coming|coming|this)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|weds?|thu(?:rs?)?|fri|sat|sun)\b\.?/gi;

const WEEKDAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
// Lowercase "mon", "wed", "sat", "sun" are too often other words to count as days.
const AMBIGUOUS_LOWERCASE = new Set(["mon", "wed", "sat", "sun"]);

const PAST =
  /\b(was|were|did|had|came|went|stopped|tried|fixed|repaired|replaced|completed|inspected|visited|checked|sealed|serviced|treated|restored|finished|installed|attempted|cleared|unclogged|patched|painted|answered|knocked|showed up|ago|yesterday|already|earlier)\b/gi;
// "was rescheduled to Thursday" or "postponed to Thursday" points ahead even after "was".
const FUTURE =
  /\b(will|shall|going to|gonna|can|could|plans? to|planning to|scheduled|resched\w*|postponed to|pushed (?:back )?to|booked|coming|come|arriv\w*|expect\w*|set for)\b|'ll\b/gi;

function weekdayOf(date: IsoDate): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function makeDate(year: number, month: number, day: number): IsoDate | null {
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : null;
}

/** A month and day with no year: pick the year that puts it nearest the date the reply arrived. */
function withNearestYear(month: number, day: number, receivedOn: IsoDate): IsoDate | null {
  const year = Number(receivedOn.slice(0, 4));
  const date = makeDate(year, month, day);
  if (!date) return null;
  const offset = daysBetween(receivedOn, date);
  if (offset < -60) return makeDate(year + 1, month, day);
  if (offset > 300) return makeDate(year - 1, month, day);
  return date;
}

function fullYear(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return raw.length === 2 ? 2000 + n : n;
}

function sentenceBounds(text: string, index: number, end: number): [number, number] {
  let start = index;
  while (start > 0 && !/[.!?\n]/.test(text[start - 1])) start--;
  let stop = end;
  while (stop < text.length && !/[.!?\n]/.test(text[stop])) stop++;
  return [start, stop];
}

function lastMatchIndex(re: RegExp, text: string): number {
  let last = -1;
  for (const m of text.matchAll(re)) last = m.index ?? last;
  return last;
}

function firstMatchIndex(re: RegExp, text: string): number {
  const m = [...text.matchAll(re)][0];
  return m?.index ?? -1;
}

/** "will be fixed" is about the future: blank out participles after "be" (same length, so indexes hold). */
function withoutPassiveParticiples(text: string): string {
  return text.replace(/\b(be|being|get|gets|getting) (\w+ed)\b/gi, (m, aux: string, verb: string) => `${aux} ${"x".repeat(verb.length)}`);
}

/** Past or future, judged by the nearest tense word in the same sentence. */
function tenseAround(rawText: string, index: number, end: number): "past" | "future" | null {
  const text = withoutPassiveParticiples(rawText);
  const [start, stop] = sentenceBounds(text, index, end);
  const before = text.slice(start, index);
  const past = lastMatchIndex(PAST, before);
  const future = lastMatchIndex(FUTURE, before);
  if (past >= 0 || future >= 0) return past > future ? "past" : "future";
  const after = text.slice(end, stop);
  const pastAfter = firstMatchIndex(PAST, after);
  const futureAfter = firstMatchIndex(FUTURE, after);
  if (pastAfter < 0 && futureAfter < 0) return null;
  if (pastAfter < 0) return "future";
  if (futureAfter < 0) return "past";
  return pastAfter < futureAfter ? "past" : "future";
}

function nextWeekday(target: number, receivedOn: IsoDate, allowToday: boolean): IsoDate {
  let diff = (target - weekdayOf(receivedOn) + 7) % 7;
  if (diff === 0 && !allowToday) diff = 7;
  return addDays(receivedOn, diff);
}

function previousWeekday(target: number, receivedOn: IsoDate): IsoDate {
  let diff = (weekdayOf(receivedOn) - target + 7) % 7;
  if (diff === 0) diff = 7;
  return addDays(receivedOn, -diff);
}

type Span = { index: number; end: number };
const overlaps = (a: Span, b: Span) => a.index < b.end && b.index < a.end;

/** Every date the text mentions, in order of appearance. */
export function findDateMentions(text: string, receivedOn: IsoDate): DateMention[] {
  const found: DateMention[] = [];
  const add = (m: RegExpMatchArray, date: IsoDate | null, explicit: boolean) => {
    if (!date || m.index === undefined) return;
    const span = { index: m.index, end: m.index + m[0].length };
    if (found.some((f) => overlaps(f, span))) return;
    found.push({ date, ...span, phrase: m[0], explicit, tense: tenseAround(text, span.index, span.end) });
  };

  for (const m of text.matchAll(NUMERIC)) {
    const end = (m.index ?? 0) + m[0].length;
    if (!m[3] && (FRACTION_AFTER.test(text.slice(end)) || FRACTION_BEFORE.test(text.slice(0, m.index)))) continue;
    const month = Number(m[1]);
    const day = Number(m[2]);
    const year = fullYear(m[3]);
    add(m, year ? makeDate(year, month, day) : withNearestYear(month, day, receivedOn), true);
  }
  for (const m of text.matchAll(MONTH_DAY)) {
    const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
    const year = fullYear(m[3]);
    add(m, year ? makeDate(year, month, Number(m[2])) : withNearestYear(month, Number(m[2]), receivedOn), true);
  }
  for (const m of text.matchAll(DAY_OF_MONTH)) {
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    const year = fullYear(m[3]);
    add(m, year ? makeDate(year, month, Number(m[1])) : withNearestYear(month, Number(m[1]), receivedOn), true);
  }
  for (const m of text.matchAll(ORDINAL_DAY)) {
    // "the 22nd": this month's 22nd, or next month's if that has passed (last month's when talking about the past).
    const day = Number(m[1]);
    const year = Number(receivedOn.slice(0, 4));
    const month = Number(receivedOn.slice(5, 7));
    const thisMonth = makeDate(year, month, day);
    const tense = tenseAround(text, m.index ?? 0, (m.index ?? 0) + m[0].length);
    let date = thisMonth;
    if (thisMonth && tense !== "past" && thisMonth < receivedOn) {
      date = month === 12 ? makeDate(year + 1, 1, day) : makeDate(year, month + 1, day);
    } else if (thisMonth && tense === "past" && thisMonth > receivedOn) {
      date = month === 1 ? makeDate(year - 1, 12, day) : makeDate(year, month - 1, day);
    }
    add(m, date, true);
  }
  for (const m of text.matchAll(RELATIVE)) {
    const word = m[1].toLowerCase();
    const offset = word === "yesterday" ? -1 : word === "day after tomorrow" ? 2 : /^(today|tonight|this )/.test(word) ? 0 : 1;
    add(m, addDays(receivedOn, offset), false);
  }
  for (const m of text.matchAll(WEEKDAY)) {
    if (m.index === undefined) continue;
    const token = m[2];
    if (token === token.toLowerCase() && AMBIGUOUS_LOWERCASE.has(token)) continue;
    // "Friday Oct 30" or "10/23 (Fri)": the explicit date already covers it.
    const end = m.index + m[0].length;
    const nextToExplicit = found.some(
      (f) => f.explicit && ((f.index >= end && /^[\s,(]{0,3}$/.test(text.slice(end, f.index))) || (f.end <= m.index! && /^[\s,(]{0,3}$/.test(text.slice(f.end, m.index)))),
    );
    if (nextToExplicit) continue;
    const target = WEEKDAY_INDEX[token.slice(0, 3).toLowerCase()];
    const modifier = m[1]?.toLowerCase();
    const past = tenseAround(text, m.index, end) === "past";
    let date: IsoDate;
    if (modifier === "last" || modifier === "this past") date = previousWeekday(target, receivedOn);
    // "We came by this Monday" is the Monday just gone (or today, if today is Monday).
    else if (modifier === "this" && past) date = weekdayOf(receivedOn) === target ? receivedOn : previousWeekday(target, receivedOn);
    else if (modifier) date = nextWeekday(target, receivedOn, modifier === "this");
    else if (past) date = previousWeekday(target, receivedOn);
    else date = nextWeekday(target, receivedOn, false);
    add(m, date, false);
  }

  return found.sort((a, b) => a.index - b.index);
}

/** The first date the text mentions, or null. */
export function resolveFirstDate(text: string, receivedOn: IsoDate): IsoDate | null {
  return findDateMentions(text, receivedOn)[0]?.date ?? null;
}
