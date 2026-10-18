// Cleaning up a pasted reply before we read it: drop the quoted earlier messages (usually the
// tenant's own letter) and the sender's signature, so only what management just said is left.

/** Normalizes line endings and curly quotes so the patterns below can stay simple. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/ /g, " ");
}

const ORIGINAL_MESSAGE = /^-{2,}\s*(original message|forwarded message)\s*-{2,}$/i;
const OUTLOOK_RULE = /^_{8,}$/;
const WROTE_LINE = /^On\b.{0,200}\bwrote:\s*$/i;
const HEADER_FIELD = /^(sent|date|to|cc|subject):/i;

/**
 * Removes quoted earlier messages: lines starting with ">", and everything from an
 * "On ... wrote:" line, an "-----Original Message-----" line, or an Outlook "From:/Sent:" header.
 */
export function stripQuoted(text: string): string {
  const lines = normalizeText(text).split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const next = (lines[i + 1] ?? "").trim();
    if (ORIGINAL_MESSAGE.test(line) || OUTLOOK_RULE.test(line)) break;
    if (WROTE_LINE.test(line)) break;
    // Gmail sometimes wraps the attribution: "On Fri, Oct 16, 2026 at 3:14 PM Jane <jane@" / "example.com> wrote:"
    if (/^On\s/.test(line) && line.length < 200 && /\bwrote:\s*$/i.test(next) && next.length < 120) break;
    if (/^From:\s/i.test(line) && lines.slice(i + 1, i + 5).some((l) => HEADER_FIELD.test(l.trim()))) break;
    if (line.startsWith(">")) continue;
    kept.push(lines[i]);
  }
  return kept.join("\n").trim();
}

const SIGN_OFF =
  /^(thanks|thank you|thanks again|thank you again|many thanks|best|best regards|kind regards|warm regards|warmly|regards|sincerely|respectfully|cheers|take care|all the best|yours truly)[\s,.!]*$/i;
const SIGNATURE_START = [
  /^--\s*$/, // the standard "-- " signature delimiter
  /^sent from my\b/i,
  /^sent from (yahoo|outlook|mail) for\b/i,
  /^get outlook for\b/i,
  /^(confidentiality notice|privacy notice|disclaimer)\b/i,
  /^this (e-?mail|message)( and any attachments)? (is|are|may be) (confidential|privileged|intended)\b/i,
];
/** "- Front desk" or "-Mike" on one of the last lines. */
const DASH_NAME = /^[-–—~]\s*[A-Za-z][\w .'&]{0,30}$/;

/**
 * Removes the signature: everything from a sign-off line ("Thanks,", "Best regards,"), a "-- "
 * delimiter, "Sent from my iPhone", or a confidentiality notice. Keeps the text if cutting would
 * leave nothing, because a reply that is only "Thanks!" still says something.
 */
export function stripSignature(text: string): string {
  const lines = normalizeText(text).split("\n");
  let cut = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const isCut =
      SIGNATURE_START.some((re) => re.test(line)) ||
      SIGN_OFF.test(line) ||
      (DASH_NAME.test(line) && i >= lines.length - 3);
    if (isCut && lines.slice(0, i).some((l) => /[a-z0-9]/i.test(l))) {
      cut = i;
      break;
    }
  }
  return lines.slice(0, cut).join("\n").trim();
}

/** The part of the reply management just wrote: no quoted thread, no signature. */
export function cleanReply(text: string): string {
  const unquoted = stripQuoted(text);
  const cleaned = stripSignature(unquoted);
  if (cleaned) return cleaned;
  return unquoted || normalizeText(text).trim();
}

// A period after one of these, or after a single letter ("a.m.", "p.m."), doesn't end a sentence.
const ABBREVIATION =
  /(\b(mr|mrs|ms|dr|st|ave|apt|no|bldg|fl|rm|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|approx|etc)|\b[a-z])\.$/i;

/** Splits text into sentences, treating each line as its own unit. */
export function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  for (const rawLine of normalizeText(text).split("\n")) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;
    const parts = line.replace(/([.!?]+["')\]]?)\s+/g, "$1\u0000").split("\u0000");
    let current = "";
    for (const part of parts) {
      current = current ? `${current} ${part}` : part;
      if (!ABBREVIATION.test(current)) {
        sentences.push(current);
        current = "";
      }
    }
    if (current) sentences.push(current);
  }
  return sentences;
}

const GREETING =
  /^(hi|hello|hey|dear|good (morning|afternoon|evening)|greetings|to whom it may concern)\b[^.!?]{0,40}[,.!:]?$/i;
const PLEASANTRY =
  /^(thanks|thank you)( so much| very much)?( for (your|the) (email|message|note|patience|letter|follow[- ]?up|reaching out|letting us know)[^.!?]{0,30})?[.!,]?$|^(sorry for the (delay|late reply|slow response)[^.!?]{0,30})[.!,]?$|^(ok|okay|noted|hi there)[.!,]?$|^(received|got it)[,.!]?( thank you| thanks)?[.!]?$/i;

/** Drops a leading "Hi," or "Hello Sam," so a quoted sentence starts with its content. */
export function withoutGreeting(sentence: string): string {
  return sentence.replace(/^(hi|hello|hey|good (morning|afternoon|evening))( there| [A-Z][a-z]+)?[,!]\s+/i, "");
}

/** True for greetings and pleasantries that carry no information about the repair. */
export function isFiller(sentence: string): boolean {
  const s = sentence.trim();
  return !s || GREETING.test(s) || PLEASANTRY.test(s) || !/[a-z0-9]/i.test(s);
}
