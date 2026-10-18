import { describe, expect, it } from "vitest";
import { cleanReply, isFiller, splitSentences, stripQuoted, stripSignature } from "./text";

describe("stripQuoted", () => {
  it("drops lines starting with >", () => {
    expect(stripQuoted("Tuesday works.\n> When can you come?\n> Thanks")).toBe("Tuesday works.");
  });

  it("cuts at an On ... wrote: line", () => {
    const text = "We'll send someone.\n\nOn Mon, Oct 19, 2026 at 8:02 AM Alex <alex@example.com> wrote:\nPlease fix the heat.";
    expect(stripQuoted(text)).toBe("We'll send someone.");
  });

  it("cuts at an On ... wrote: attribution wrapped over two lines", () => {
    const text = "Received.\n\nOn Fri, Oct 16, 2026 at 3:14 PM Jane Tenant <jane@\nexample.com> wrote:\nThe sink is leaking.";
    expect(stripQuoted(text)).toBe("Received.");
  });

  it("cuts at -----Original Message-----", () => {
    const text = "Access needed.\n\n-----Original Message-----\nFrom: Priya <p@example.org>\nSent: Wednesday\nThe mold is back.";
    expect(stripQuoted(text)).toBe("Access needed.");
  });

  it("cuts at an Outlook From:/Sent: header block", () => {
    const text = "We fixed it.\n\nFrom: Tenant <t@example.com>\nSent: Monday, October 12, 2026 9:00 AM\nTo: office@example.com\nSubject: Heat";
    expect(stripQuoted(text)).toBe("We fixed it.");
  });

  it("keeps a line that merely starts with On", () => {
    expect(stripQuoted("On Monday the plumber will come.")).toBe("On Monday the plumber will come.");
  });
});

describe("stripSignature", () => {
  it("cuts at a sign-off line", () => {
    expect(stripSignature("The super will come Tuesday.\n\nThanks,\nMarco\nMarrowstone Residential")).toBe("The super will come Tuesday.");
    expect(stripSignature("Noted.\n\nBest regards,\nTenant Relations\n(212) 555-0147")).toBe("Noted.");
  });

  it("cuts at Sent from my iPhone and similar", () => {
    expect(stripSignature("fixed\n\nSent from my iPhone")).toBe("fixed");
    expect(stripSignature("ok\nGet Outlook for iOS")).toBe("ok");
  });

  it("cuts at a -- delimiter and a confidentiality notice", () => {
    expect(stripSignature("Coming Friday.\n-- \nJoe\nSuper")).toBe("Coming Friday.");
    expect(stripSignature("No leak found.\n\nCONFIDENTIALITY NOTICE: This email is private.")).toBe("No leak found.");
  });

  it("cuts a dash-name sign-off near the end", () => {
    expect(stripSignature("Leave a key with the doorman.\n\n- Front desk")).toBe("Leave a key with the doorman.");
  });

  it("keeps a reply that is only a sign-off word", () => {
    expect(stripSignature("Thanks!")).toBe("Thanks!");
  });

  it("does not treat a sentence that starts with Thank you as a sign-off", () => {
    expect(stripSignature("Thank you for your patience. We'll be there Monday.")).toBe("Thank you for your patience. We'll be there Monday.");
  });
});

describe("cleanReply", () => {
  it("removes both the quoted thread and the signature", () => {
    const text = "Hi Sam,\n\nPassed this along.\n\nKind regards,\nLeasing Office\n\nOn Thu, Oct 15, 2026, 7:30 PM Sam <s@example.com> wrote:\n> It still isn't fixed.";
    expect(cleanReply(text)).toBe("Hi Sam,\n\nPassed this along.");
  });

  it("falls back to the original text when everything would be removed", () => {
    expect(cleanReply("> only quoted")).toBe("> only quoted");
  });
});

describe("splitSentences", () => {
  it("splits on sentence ends and lines, but not on abbreviations or a.m.", () => {
    expect(splitSentences("Hi,\nThe plumber comes Oct. 22 at 9 a.m. tomorrow. Mr. K will let him in!")).toEqual([
      "Hi,",
      "The plumber comes Oct. 22 at 9 a.m. tomorrow.",
      "Mr. K will let him in!",
    ]);
  });
});

describe("isFiller", () => {
  it("flags greetings and pleasantries only", () => {
    expect(isFiller("Hi Sam,")).toBe(true);
    expect(isFiller("Thank you for your email.")).toBe(true);
    expect(isFiller("Received, thank you.")).toBe(true);
    expect(isFiller("The plumber will come Tuesday.")).toBe(false);
  });
});
