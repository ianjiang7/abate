import { describe, expect, it } from "vitest";
import { isCaseCode, isCaseToken, newCaseCode, newCaseToken } from "./ids";
import { chooseDollarInNotice, draftWasEdited, firstReplyAfterNotice, readyOnFor, receivedAtFor } from "./rules";
import type { CaseRecord, MessageRecord } from "./types";
import { newCaseSchema, replySchema } from "./validation";
import { estimateAbatement } from "@/lib/domain/estimate";
import { nextAction } from "@/lib/domain/ladder";
import { buildMessage } from "@/lib/domain/templates";
import { computeMetrics } from "./metrics";
import { buildTimeline, ladderInputs, ladderProgress, pendingReplyReference, sentOnByStep, templateContext } from "./view";

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
  sendMode: "self",
  sendModeChosen: false,
  dollarInNotice: null,
  sendAuthorizedAt: null,
  tenantEmail: null,
  pausedAt: null,
  pauseReason: null,
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
    approvedAt: null,
    readyOn: null,
    sentBy: null,
    claimedAt: null,
    withdrawnAt: null,
    edited: null,
    draftBody: null,
    receivedAt: null,
    loggedBy: null,
    classification: null,
    aiClassification: null,
    classifiedBy: null,
    classifiedAt: null,
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
    const corrected = { ...reply, classification: "scheduled" as const, aiClassification: "acknowledged_no_date" as const, classifiedBy: "tenant" as const };
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
    sendMode: "self",
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

  it("requires an email and authorization when Abate sends", () => {
    const r = newCaseSchema.safeParse({ ...valid, sendMode: "abate" });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(new Set(r.error.issues.map((i) => String(i.path[0])))).toEqual(new Set(["mgmtEmailForAbate", "tenantEmail", "sendAuthorized"]));
    // Abate can't send without management's email.
    const noMgmt = newCaseSchema.safeParse({ ...valid, sendMode: "abate", tenantEmail: "t@example.com", sendAuthorized: "on" });
    expect(noMgmt.success).toBe(false);
    if (!noMgmt.success) expect(noMgmt.error.issues.map((i) => String(i.path[0]))).toEqual(["mgmtEmailForAbate"]);
    expect(newCaseSchema.safeParse({ ...valid, sendMode: "abate", tenantEmail: "t@example.com", sendAuthorized: "on", mgmtEmail: "repairs@example.com" }).success).toBe(true);
    // Self-send tenants can leave it blank.
    expect(newCaseSchema.safeParse({ ...valid, sendMode: "self" }).success).toBe(true);
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

describe("concierge", () => {
  const abate = { ...record, sendMode: "abate" as const, sendAuthorizedAt: "2026-10-18T14:00:00Z", tenantEmail: "tenant@example.com" };

  it("holds the ladder while an approved message waits for the team", () => {
    const approved = msg({ step: "notice", approvedAt: "2026-10-18T15:00:00Z" });
    const { ladderCase, ladderMessages } = ladderInputs(abate, [approved]);
    expect(nextAction(ladderCase, ladderMessages, "2026-10-18")).toMatchObject({ kind: "awaiting_send", step: "notice" });
    const sent = { ...approved, sentAt: "2026-10-18T18:00:00Z", sentBy: "team" as const };
    const after = ladderInputs(abate, [sent]);
    expect(nextAction(after.ladderCase, after.ladderMessages, "2026-10-19")).toMatchObject({ kind: "send", step: "reminder" });
  });

  it("ignores approvals that were withdrawn before sending", () => {
    const withdrawn = msg({ step: "notice", approvedAt: "2026-10-18T15:00:00Z", withdrawnAt: "2026-10-18T16:00:00Z" });
    const { ladderCase, ladderMessages } = ladderInputs(abate, [withdrawn]);
    expect(nextAction(ladderCase, ladderMessages, "2026-10-18")).toMatchObject({ kind: "send", step: "notice" });
    expect(buildTimeline(abate, [withdrawn]).map((i) => i.kind)).not.toContain("sent");
  });

  it("dates readiness from what made the step ready", () => {
    const created = { ...abate, createdAt: "2026-10-15T14:00:00Z" };
    expect(readyOnFor("notice", "2026-10-18", created, [], "2026-10-18")).toBe("2026-10-15");
    const notice = msg({ step: "notice", sentAt: "2026-10-15T16:00:00Z" });
    const reply = msg({ direction: "incoming", receivedAt: "2026-10-16T16:00:00Z", classification: "acknowledged_no_date", classifiedAt: "2026-10-17T13:00:00Z" });
    expect(readyOnFor("ask_date", "2026-10-18", created, [notice, reply], "2026-10-18")).toBe("2026-10-17");
    expect(readyOnFor("reminder", "2026-10-18", created, [notice], "2026-10-20")).toBe("2026-10-18");
    expect(readyOnFor("reminder", "2026-10-21", created, [notice], "2026-10-20")).toBe("2026-10-20"); // never in the future
  });

  it("stops everything while paused", () => {
    const { ladderCase, ladderMessages } = ladderInputs({ ...abate, pausedAt: "2026-10-19T12:00:00Z" }, []);
    expect(nextAction(ladderCase, ladderMessages, "2026-10-19").kind).toBe("paused");
  });

  it("labels the timeline by who sent what", () => {
    const pending = msg({ step: "notice", approvedAt: "2026-10-18T15:00:00Z" });
    const teamSent = msg({ step: "reminder", approvedAt: "2026-10-21T15:00:00Z", sentAt: "2026-10-21T16:00:00Z", sentBy: "team" });
    const unread = msg({ direction: "incoming", receivedAt: "2026-10-22T16:00:00Z" });
    const titles = buildTimeline(abate, [pending, teamSent, unread]).map((i) => i.title);
    expect(titles).toContain("Written notice approved");
    expect(titles).toContain("Reminder sent by Abate");
    expect(buildTimeline(abate, [unread]).find((i) => i.kind === "reply")?.detail).toBe("Our team is reading it");
  });

  it("writes in Abate's voice when the team sends", () => {
    const ctx = templateContext({
      record: abate,
      messages: [],
      today: "2026-10-18",
      estimate: estimateAbatement({ monthlyRent: 1500, issueType: "heat", noticeOn: "2026-10-06", endOn: "2026-10-18" }),
      openViolations: 3,
    });
    const notice = buildMessage("notice", ctx);
    expect(notice.body).toContain("We're writing on behalf of Test Tenant, your tenant at");
    expect(notice.body).toContain("Test first reported it to you on October 6, 2026");
    expect(notice.body).toContain("Test is copied on this email.");
    expect(notice.body).toContain("The Abate team, on behalf of Test Tenant");
    expect(notice.body).not.toMatch(/\bmy apartment\b|\bI first\b/);
    const formal = buildMessage("formal_notice", ctx);
    expect(formal.body).toContain("sent on behalf of Test Tenant");
    expect(formal.body).toContain("Based on Test's rent");
  });
});

describe("metrics", () => {
  const base = { ...record, sendMode: "abate" as const, sendModeChosen: true, sendAuthorizedAt: "2026-10-10T14:00:00Z" };
  const now = new Date("2026-10-25T16:00:00Z");

  it("scores hypothesis 1 only on cases old enough to judge", () => {
    const quick = {
      record: { ...base, id: "a", firstReportedOn: "2026-10-01" },
      messages: [
        msg({ step: "notice", approvedAt: "2026-10-10T15:00:00Z", sentAt: "2026-10-10T16:00:00Z", sentBy: "team", readyOn: "2026-10-10" }),
        msg({ direction: "incoming", receivedAt: "2026-10-12T16:00:00Z", classification: "acknowledged_no_date", classifiedBy: "team", aiClassification: "acknowledged_no_date" }),
      ],
    };
    const silent = { record: { ...base, id: "b", firstReportedOn: "2026-10-05" }, messages: [msg({ step: "notice", sentAt: "2026-10-12T16:00:00Z", approvedAt: "2026-10-12T15:00:00Z", readyOn: "2026-10-10" })] };
    const fresh = { record: { ...base, id: "c" }, messages: [msg({ step: "notice", sentAt: "2026-10-23T16:00:00Z", approvedAt: "2026-10-23T15:00:00Z", readyOn: "2026-10-23" })] };
    const m = computeMetrics([quick, silent, fresh], now);
    expect(m.h1).toMatchObject({ started: 3, judged: 2, responded: 1, waiting: 1, rate: 0.5, pass: true, medianDaysToReply: 2 });
    expect(m.h1.medianBaselineDays).toBe(9); // waits of 9, 7 and 17 days before the first notice
    expect(m.h1.firstReplyAfterStep).toEqual({ notice: 1 });
    // Approvals: 3 approved (2 within a day of being ready) plus 2 drafts ready for over a day and
    // still unapproved (case a's ask-for-a-date, case b's reminder).
    expect(m.h2).toMatchObject({ offered: 3, authorized: 3, approvals: 5, approvedWithinDay: 2, overdue: 2, backedOut: 0, backedOutPass: true });
    expect(m.shadow).toEqual({ compared: 1, agreed: 1, rate: 1 });
  });

  it("counts pauses and switches to self-sending as backing out", () => {
    const paused = { record: { ...base, id: "p", pausedAt: "2026-10-20T12:00:00Z", pauseReason: "worried" }, messages: [] };
    const switched = { record: { ...base, id: "s", sendMode: "self" as const, pauseReason: "send_myself" }, messages: [] };
    const resumed = { record: { ...base, id: "r", pausedAt: null, pauseReason: "other" }, messages: [] };
    const preConcierge = { record: { ...record, id: "t" }, messages: [] };
    const m = computeMetrics([paused, switched, resumed, preConcierge], now);
    expect(m.h2.backedOut).toBe(3); // a pause still counts after resuming
    expect(m.h2.backedOutPass).toBe(false);
    expect(m.h2.pauseReasons).toEqual({ worried: 1, send_myself: 1, other: 1 });
    // Switching to self-send still counts as having chosen Abate; the pre-pilot case wasn't offered the choice.
    expect(m.h2).toMatchObject({ offered: 3, authorized: 3 });
  });

  it("counts a fix as management responding, even with no written reply", () => {
    const silentFix = {
      record: { ...base, id: "f", status: "fixed" as const, fixedOn: "2026-10-14" },
      messages: [msg({ step: "notice", approvedAt: "2026-10-10T15:00:00Z", sentAt: "2026-10-10T16:00:00Z", readyOn: "2026-10-10" })],
    };
    const m = computeMetrics([silentFix], now);
    expect(m.h1).toMatchObject({ judged: 1, responded: 1, medianDaysToReply: 4, fixed: 1 });
  });
});

describe("hypothesis 1 split: sender vs dollar figure", () => {
  it("assigns whichever first-notice version has fewer cases, and flips a coin on a tie", () => {
    expect(chooseDollarInNotice({ with: 2, without: 3 }, 0.9)).toBe(true);
    expect(chooseDollarInNotice({ with: 3, without: 2 }, 0.1)).toBe(false);
    expect(chooseDollarInNotice({ with: 2, without: 2 }, 0.2)).toBe(true);
    expect(chooseDollarInNotice({ with: 2, without: 2 }, 0.7)).toBe(false);
  });

  const est = estimateAbatement({ monthlyRent: 1500, issueType: "heat", noticeOn: "2026-10-06", endOn: "2026-10-18" });
  const ctxFor = (r: typeof record) => templateContext({ record: r, messages: [], today: "2026-10-18", estimate: est, openViolations: null });

  it("puts the dollar estimate in the first notice only for the dollar group, in either voice", () => {
    const abateWith = buildMessage("notice", ctxFor({ ...record, sendMode: "abate", dollarInNotice: true })).body;
    expect(abateWith).toContain("warranty of habitability");
    expect(abateWith).toContain("Based on Test's rent and how long this has gone on, we estimate that reduction may be between $120 and $300 so far");
    const tenantWith = buildMessage("notice", ctxFor({ ...record, sendMode: "self", dollarInNotice: true })).body;
    expect(tenantWith).toContain("Based on my rent and how long this has gone on, I estimate");
    for (const dollar of [false, null]) {
      const body = buildMessage("notice", ctxFor({ ...record, sendMode: "abate", dollarInNotice: dollar })).body;
      expect(body).not.toMatch(/warranty|\$\d/);
    }
    // The reminder never carries it; the formal notice always does.
    expect(buildMessage("reminder", ctxFor({ ...record, dollarInNotice: true })).body).not.toMatch(/warranty|\$\d/);
    expect(buildMessage("formal_notice", ctxFor({ ...record, dollarInNotice: false })).body).toContain("may be between $120 and $300");
  });

  it("compares responses in the 3 days after the first notice, by sender and dollar group", () => {
    const now = new Date("2026-10-25T16:00:00Z");
    const notice = (sentAt: string, sentBy: "team" | "tenant") => msg({ step: "notice", sentAt, sentBy, approvedAt: sentBy === "team" ? sentAt : null });
    const reply = (receivedAt: string) => msg({ direction: "incoming", receivedAt, classification: "acknowledged_no_date", classifiedBy: "team" });
    const base = { ...record, sendModeChosen: true };
    const rows = [
      // Abate, with $: answered in 1 day.
      { record: { ...base, id: "1", sendMode: "abate" as const, dollarInNotice: true }, messages: [notice("2026-10-15T16:00:00Z", "team"), reply("2026-10-16T16:00:00Z")] },
      // Abate, without $: answered on day 5 (too late for the 3-day window).
      { record: { ...base, id: "2", sendMode: "abate" as const, dollarInNotice: false }, messages: [notice("2026-10-15T16:00:00Z", "team"), reply("2026-10-20T16:00:00Z")] },
      // Abate, without $: answered in 2 days.
      { record: { ...base, id: "3", sendMode: "abate" as const, dollarInNotice: false }, messages: [notice("2026-10-15T16:00:00Z", "team"), reply("2026-10-17T16:00:00Z")] },
      // Tenant-sent, with $: fixed on day 2 without a written reply.
      { record: { ...base, id: "4", sendMode: "self" as const, dollarInNotice: true, status: "fixed" as const, fixedOn: "2026-10-17" }, messages: [notice("2026-10-15T16:00:00Z", "tenant")] },
      // Tenant-sent, without $: sent yesterday, still in its window.
      { record: { ...base, id: "5", sendMode: "self" as const, dollarInNotice: false }, messages: [notice("2026-10-24T16:00:00Z", "tenant")] },
      // Before the split: not counted.
      { record: { ...base, id: "6", sendMode: "self" as const, dollarInNotice: null }, messages: [notice("2026-10-15T16:00:00Z", "tenant"), reply("2026-10-16T16:00:00Z")] },
    ];
    const f = computeMetrics(rows, now).h1.firstNotice;
    expect(f.abateWith).toMatchObject({ judged: 1, responded: 1, rate: 1 });
    expect(f.abateWithout).toMatchObject({ judged: 2, responded: 1, rate: 0.5 });
    expect(f.selfWith).toMatchObject({ judged: 1, responded: 1, rate: 1 });
    expect(f.selfWithout).toMatchObject({ judged: 0, responded: 0, waiting: 1, rate: null });
    expect(f.companyPass).toBe(true); // 50% of Abate notices without $ answered within 3 days
    expect(f.allWith.rate).toBe(1);
    expect(f.allWithout.rate).toBe(0.5);
    expect(f.dollarLift).toBe(0.5);
    expect(f.dollarPass).toBe(true);
  });
});
