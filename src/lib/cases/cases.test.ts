import { describe, expect, it } from "vitest";
import { isCaseCode, isCaseToken, newCaseCode, newCaseToken } from "./ids";
import { draftWasEdited, firstReplyAfterNotice, receivedAtFor } from "./rules";
import type { CaseRecord, MessageRecord } from "./types";
import { newCaseSchema, replySchema } from "./validation";
import { buildTimeline, ladderInputs, ladderProgress, pendingReplyReference, sentOnByStep } from "./view";

const record: CaseRecord = {
  id: "c1",
  token: "t".repeat(32),
  code: "K7QM4X",
  createdAt: "2026-10-18T14:00:00Z",
  address: "123 Example St, Bronx, NY 10452",
  unit: "4B",
  borough: "Bronx",
  bbl: "2012340001",
  bin: "2001234",
  issueType: "heat",
  issueDescription: null,
  startedOn: "2026-10-05",
  firstReportedOn: "2026-10-06",
  firstReportedVia: "text",
  priorFollowups: 2,
  monthlyRent: 1500,
  tenantName: "Test Tenant",
  tenantContact: null,
  mgmtName: null,
  mgmtEmail: null,
  status: "open",
  repairScheduledFor: null,
  repairScheduledAt: null,
  repairMissedAt: null,
  fixedOn: null,
  helpRequestedAt: null,
};

function msg(partial: Partial<MessageRecord>): MessageRecord {
  return {
    id: Math.random().toString(36).slice(2),
    direction: "outgoing",
    createdAt: "2026-10-18T15:00:00Z",
    step: null,
    subject: null,
    body: null,
    sentAt: null,
    receivedAt: null,
    loggedBy: null,
    classification: null,
    aiClassification: null,
    classificationSummary: null,
    classificationDate: null,
    replyReference: null,
    aiSource: null,
    ...partial,
  };
}

describe("ids", () => {
  it("makes 32-character URL-safe tokens and readable 6-character codes", () => {
    const token = newCaseToken();
    expect(isCaseToken(token)).toBe(true);
    expect(isCaseToken("short")).toBe(false);
    const code = newCaseCode();
    expect(isCaseCode(code)).toBe(true);
    expect(code).not.toMatch(/[01OIL]/);
  });
});

describe("view helpers", () => {
  const notice = msg({ step: "notice", subject: "Repair needed", sentAt: "2026-10-18T16:00:00Z" });
  const reply = msg({
    direction: "incoming",
    receivedAt: "2026-10-19T16:00:00Z",
    classification: "acknowledged_no_date",
    classificationSummary: "Says they'll look into it.",
    replyReference: "On October 19 you wrote that you would look into it.",
  });

  it("orders the timeline by date, with started and reported first", () => {
    const items = buildTimeline(record, [reply, notice]);
    expect(items.map((i) => i.kind)).toEqual(["started", "reported", "joined", "sent", "reply"]);
    expect(items[1].detail).toBe("Reported by text message, then followed up 2 times");
    expect(items[4].detail).toBe("Acknowledged, no date given · Says they'll look into it.");
  });

  it("labels a tenant-corrected reply instead of showing the agent's stale summary", () => {
    const corrected = { ...reply, classification: "scheduled" as const, aiClassification: "acknowledged_no_date" as const };
    expect(buildTimeline(record, [notice, corrected])[4].detail).toBe("Repair scheduled · corrected by you");
  });

  it("drops a repair appointment that came after the fix", () => {
    const fixedEarly = { ...record, status: "fixed" as const, fixedOn: "2026-10-18", repairScheduledFor: "2026-10-20" };
    expect(buildTimeline(fixedEarly, [notice]).map((i) => i.kind)).not.toContain("scheduled");
  });

  it("uses sent and received times for the ladder, in New York dates", () => {
    const { ladderMessages } = ladderInputs(record, [notice, reply]);
    expect(ladderMessages.map((m) => m.at)).toEqual(["2026-10-18T16:00:00Z", "2026-10-19T16:00:00Z"]);
    expect(sentOnByStep([notice])).toEqual({ notice: "2026-10-18" });
  });

  it("offers the reply reference only while the reply is unanswered", () => {
    expect(pendingReplyReference([notice, reply])).toBe("On October 19 you wrote that you would look into it.");
    const answered = msg({ step: "ask_date", sentAt: "2026-10-19T18:00:00Z" });
    expect(pendingReplyReference([notice, reply, answered])).toBeNull();
  });

  it("marks timed steps done, current or upcoming", () => {
    expect(ladderProgress([notice], "reminder").map((p) => p.status)).toEqual(["done", "current", "upcoming", "upcoming"]);
  });
});

describe("newCaseSchema", () => {
  const valid = {
    address: "245 East 7 Street, Manhattan, NY 10009",
    unit: "4B",
    borough: "Manhattan",
    bbl: "1003770001",
    bin: "1004567",
    issueType: "heat",
    issueDescription: "",
    startedOn: "2026-10-05",
    firstReportedOn: "2026-10-06",
    firstReportedVia: "text",
    priorFollowups: "2",
    mgmtName: "",
    mgmtEmail: "",
    tenantName: "Test Tenant",
    monthlyRent: "1850",
    tenantContact: "",
    aiConsent: "on",
    invite: "",
  };

  it("accepts a complete form and normalizes empty strings to null", () => {
    const r = newCaseSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.mgmtEmail).toBeNull();
    expect(r.data.issueDescription).toBeNull();
    expect(r.data.priorFollowups).toBe(2);
    expect(r.data.monthlyRent).toBe(1850);
  });

  it("strips an autofilled Apt prefix from the unit", () => {
    const r = newCaseSchema.safeParse({ ...valid, unit: "Apt 4B" });
    expect(r.success && r.data.unit).toBe("4B");
  });

  it("allows a free-text address with no building match", () => {
    expect(newCaseSchema.safeParse({ ...valid, bbl: "", bin: "", borough: "" }).success).toBe(true);
  });

  it("rejects bad input with field-specific messages", () => {
    const r = newCaseSchema.safeParse({ ...valid, issueType: "lava", mgmtEmail: "nope", aiConsent: undefined, firstReportedOn: "2026-10-01", bbl: "12" });
    expect(r.success).toBe(false);
    if (r.success) return;
    const fields = new Set(r.error.issues.map((i) => String(i.path[0])));
    expect(fields).toEqual(new Set(["issueType", "mgmtEmail", "aiConsent", "bbl"]));
  });

  it("rejects a report date before the problem started", () => {
    const r = newCaseSchema.safeParse({ ...valid, firstReportedOn: "2026-10-01" });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues[0].path[0]).toBe("firstReportedOn");
  });

  it("requires reply text", () => {
    expect(replySchema.safeParse({ text: " ", receivedOn: "2026-10-18" }).success).toBe(false);
    expect(replySchema.safeParse({ text: "We'll come Tuesday.", receivedOn: "2026-10-18" }).success).toBe(true);
  });
});

describe("rules", () => {
  const sentAfternoon = msg({ step: "notice", sentAt: "2026-10-18T20:30:00Z" }); // 4:30pm New York
  it("never sorts a past-dated reply before our message sent that same day", () => {
    const at = receivedAtFor("2026-10-18", [sentAfternoon], new Date("2026-10-19T13:00:00Z"));
    expect(at > "2026-10-18T20:30:00Z").toBe(true);
    expect(at.startsWith("2026-10-18T20:30:01")).toBe(true);
  });

  it("uses noon New York time for an earlier day, and now for today", () => {
    expect(receivedAtFor("2026-10-16", [sentAfternoon], new Date("2026-10-19T13:00:00Z"))).toBe("2026-10-16T16:00:00.000Z");
    const now = new Date("2026-10-19T13:00:00Z");
    expect(receivedAtFor("2026-10-19", [], now)).toBe(now.toISOString());
  });

  it("counts only replies after Abate's first notice for assumption 1", () => {
    const early = msg({ direction: "incoming", receivedAt: "2026-10-15T16:00:00Z" });
    const after = msg({ direction: "incoming", receivedAt: "2026-10-20T16:00:00Z" });
    expect(firstReplyAfterNotice([early, sentAfternoon, after])).toBe("2026-10-20T16:00:00Z");
    expect(firstReplyAfterNotice([early])).toBeNull();
  });

  it("doesn't count filling in a placeholder as editing the draft", () => {
    const draft = { subject: "311 complaint filed", body: "My complaint number is [add your 311 number].\n\nThanks" };
    expect(draftWasEdited(draft, { subject: "311 complaint filed", body: "My complaint number is 311-12345678.\n\nThanks" })).toBe(false);
    expect(draftWasEdited(draft, { subject: "311 complaint filed", body: "My complaint number is 311-12345678. Fix it now!\n\nThanks" })).toBe(true);
    expect(draftWasEdited(draft, { subject: "Changed", body: draft.body })).toBe(true);
    expect(draftWasEdited({ subject: "a", body: "Hello" }, { subject: "a", body: "Hello " })).toBe(false);
  });
});
