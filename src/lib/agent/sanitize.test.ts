import { describe, expect, it } from "vitest";
import { hasBlockedLanguage, sanitizeDate, sanitizeReading, sanitizeReplyReference, sanitizeSummary, truncate } from "./sanitize";

const ON = "2026-10-17";

describe("sanitizeDate", () => {
  it("keeps valid dates within 7 days before and 90 days after the reply", () => {
    expect(sanitizeDate("2026-10-20", ON)).toBe("2026-10-20");
    expect(sanitizeDate("2026-10-10", ON)).toBe("2026-10-10");
    expect(sanitizeDate("2027-01-15", ON)).toBe("2027-01-15");
  });

  it("nulls dates outside the window, invalid dates and non-strings", () => {
    expect(sanitizeDate("2026-10-09", ON)).toBeNull();
    expect(sanitizeDate("2027-01-16", ON)).toBeNull();
    expect(sanitizeDate("2026-02-30", ON)).toBeNull();
    expect(sanitizeDate("next Tuesday", ON)).toBeNull();
    expect(sanitizeDate(null, ON)).toBeNull();
    expect(sanitizeDate(20261020, ON)).toBeNull();
  });
});

describe("sanitizeReplyReference", () => {
  it("keeps a plain factual sentence addressed to management", () => {
    expect(sanitizeReplyReference("On October 17 you wrote that the super would come by on Tuesday.", ON)).toBe(
      "On October 17 you wrote that the super would come by on Tuesday.",
    );
    expect(sanitizeReplyReference('On October 17, you replied: "Received."', ON)).toBe('On October 17, you replied: "Received."');
  });

  it("collapses whitespace and adds a final period", () => {
    expect(sanitizeReplyReference("On October 17 you said\nthe plumber would come", ON)).toBe("On October 17 you said the plumber would come.");
  });

  it("drops references that don't start with the reply date and 'you'", () => {
    expect(sanitizeReplyReference("You said the plumber would come.", ON)).toBeNull();
    expect(sanitizeReplyReference("On October 16 you said the plumber would come.", ON)).toBeNull();
    expect(sanitizeReplyReference("On October 17 management said the plumber would come.", ON)).toBeNull();
  });

  it("drops references longer than 220 characters", () => {
    expect(sanitizeReplyReference(`On October 17 you wrote that ${"the plumber would come ".repeat(10)}.`, ON)).toBeNull();
  });

  it.each([
    "On October 17 you wrote that this is not a habitability issue.",
    "On October 17 you denied the warranty applies.",
    "On October 17 you wrote that no abatement is owed.",
    "On October 17 you refused a rent reduction.",
    "On October 17 you said I could sue you.",
    "On October 17 you said to take it to court.",
    "On October 17 you told me to get a lawyer.",
    "On October 17 you said this was a legal matter.",
    "On October 17 you said there was no violation.",
    "On October 17 you said the repair would cost $185.",
    "On October 17 you said you would evict me.",
    "On October 17 you said it would be charged to my account.",
  ])("drops legal, money or threat language: %s", (ref) => {
    expect(sanitizeReplyReference(ref, ON)).toBeNull();
  });

  it("does not trip on words that merely contain a blocked word", () => {
    expect(sanitizeReplyReference("On October 17 you wrote that the issue was in the courtyard drain.", ON)).not.toBeNull();
  });

  it("drops non-strings and empty strings", () => {
    expect(sanitizeReplyReference(null, ON)).toBeNull();
    expect(sanitizeReplyReference("   ", ON)).toBeNull();
  });
});

describe("hasBlockedLanguage", () => {
  it("flags links, emails and profanity too", () => {
    expect(hasBlockedLanguage("see https://example.com")).toBe(true);
    expect(hasBlockedLanguage("write to office@example.com")).toBe(true);
    expect(hasBlockedLanguage("stop this crap")).toBe(true);
    expect(hasBlockedLanguage("The super will come Tuesday.")).toBe(false);
  });
});

describe("summary", () => {
  it("truncates to 140 characters at a word boundary", () => {
    const long = "Says the super will come by ".repeat(10);
    const s = sanitizeSummary(long, "scheduled");
    expect(s.length).toBeLessThanOrEqual(140);
    expect(s.endsWith("…")).toBe(true);
    expect(truncate("short", 140)).toBe("short");
  });

  it("uses a default line when the summary is missing", () => {
    expect(sanitizeSummary("", "needs_access")).toBe("Asks for access to the apartment.");
    expect(sanitizeSummary(undefined, "unclear")).toBe("Reply needs a teammate to read it.");
  });
});

describe("sanitizeReading", () => {
  it("throws on an unknown category so the caller can fall back", () => {
    expect(() => sanitizeReading({ category: "angry" }, ON, "test")).toThrow();
  });

  it("never keeps a reference on an unclear reading", () => {
    const r = sanitizeReading({ category: "unclear", summary: "Asks which apartment.", replyReference: "On October 17 you asked which apartment." }, ON, "test");
    expect(r.replyReference).toBeNull();
  });
});
