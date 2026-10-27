import { describe, expect, it } from "vitest";
import { addDays, daysBetween, isIsoDate, nyDate } from "./dates";
import { estimateAbatement } from "./estimate";
import { issuesPhrase, mostSeriousIssue, sortIssues } from "./issues";
import { dueSummary, nextAction, type LadderMessage } from "./ladder";
import { buildMailto, trackingAddress } from "./mailto";
import { bareUnit, buildMessage, unfilledPlaceholders, type TemplateContext } from "./templates";

describe("dates", () => {
  it("uses New York's calendar date, not UTC's", () => {
    // 11pm in New York on Oct 18 is already Oct 19 in UTC.
    expect(nyDate("2026-10-19T03:00:00Z")).toBe("2026-10-18");
    expect(nyDate("2026-10-19T05:00:00Z")).toBe("2026-10-19");
  });

  it("counts and adds whole days across the end of daylight saving time", () => {
    expect(daysBetween("2026-10-30", "2026-11-03")).toBe(4);
    expect(addDays("2026-10-30", 4)).toBe("2026-11-03");
    expect(daysBetween("2026-10-20", "2026-10-18")).toBe(-2);
  });

  it("validates ISO dates", () => {
    expect(isIsoDate("2026-10-18")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("10/18/2026")).toBe(false);
  });
});

describe("estimateAbatement", () => {
  it("matches the worked example: a sink broken 3 weeks at $1,800 rent", () => {
    const e = estimateAbatement({ monthlyRent: 1800, issueTypes: ["plumbing"], noticeOn: "2026-09-27", endOn: "2026-10-18" });
    expect(e.days).toBe(21);
    expect(e.low).toBe(120);
    expect(e.high).toBe(310);
  });

  it("uses the higher range for no heat", () => {
    const e = estimateAbatement({ monthlyRent: 1500, issueTypes: ["heat"], noticeOn: "2026-10-04", endOn: "2026-10-18" });
    expect(e.days).toBe(14);
    expect(e.low).toBe(140); // 1500*12/365*14*0.2 = 138.08
    expect(e.high).toBe(350); // ... *0.5 = 345.2
    expect(e.perDayHigh).toBeCloseTo(24.66, 1);
  });

  it("never goes negative and handles bad rent", () => {
    expect(estimateAbatement({ monthlyRent: 2000, issueTypes: ["mold"], noticeOn: "2026-10-20", endOn: "2026-10-18" }).high).toBe(0);
    expect(estimateAbatement({ monthlyRent: Number.NaN, issueTypes: ["mold"], noticeOn: "2026-10-01", endOn: "2026-10-18" }).high).toBe(0);
  });

  it("uses the most serious problem when there are several, without adding them up", () => {
    const heatOnly = estimateAbatement({ monthlyRent: 1500, issueTypes: ["heat"], noticeOn: "2026-10-04", endOn: "2026-10-18" });
    const several = estimateAbatement({ monthlyRent: 1500, issueTypes: ["mold", "pests", "heat"], noticeOn: "2026-10-04", endOn: "2026-10-18" });
    expect(several).toEqual(heatOnly);
  });
});

describe("several problems", () => {
  it("sorts them most serious first, without duplicates", () => {
    expect(sortIssues(["mold", "heat", "mold", "other"])).toEqual(["heat", "mold", "other"]);
    expect(sortIssues([])).toEqual(["other"]);
    expect(mostSeriousIssue(["electrical", "leak"]).id).toBe("leak");
  });

  it("lists them the way a letter reads", () => {
    expect(issuesPhrase(["heat"])).toBe("no heat or hot water");
    expect(issuesPhrase(["mold", "heat"])).toBe("no heat or hot water and mold");
    expect(issuesPhrase(["pests", "mold", "heat"])).toBe("no heat or hot water, mold and pests");
    // An item with its own commas switches the list to semicolons so it stays readable.
    expect(issuesPhrase(["window_door", "mold", "heat"])).toBe("no heat or hot water; mold; and a broken window, door or lock");
    expect(issuesPhrase(["other", "mold"])).toBe("mold and another repair problem");
    expect(issuesPhrase(["window_door", "plumbing"])).toBe("a plumbing problem and a broken window, door or lock");
  });
});

describe("nextAction", () => {
  const open = { status: "open" as const };
  const sentNotice: LadderMessage = { direction: "outgoing", step: "notice", at: "2026-10-18T14:00:00Z" };

  it("starts with a notice due today", () => {
    expect(nextAction(open, [], "2026-10-18")).toMatchObject({ kind: "send", step: "notice", dueOn: "2026-10-18" });
  });

  it("schedules the reminder 3 days after the notice", () => {
    expect(nextAction(open, [sentNotice], "2026-10-19")).toMatchObject({ kind: "send", step: "reminder", dueOn: "2026-10-21" });
  });

  it("keeps at least 2 days after the last message we sent", () => {
    const msgs: LadderMessage[] = [
      sentNotice,
      { direction: "incoming", classification: "acknowledged_no_date", at: "2026-10-19T15:00:00Z" },
      { direction: "outgoing", step: "ask_date", at: "2026-10-20T15:00:00Z" },
    ];
    // Reminder would be due Oct 21 (notice + 3) but ask_date went out Oct 20, so Oct 22.
    expect(nextAction(open, msgs, "2026-10-20")).toMatchObject({ kind: "send", step: "reminder", dueOn: "2026-10-22" });
  });

  it("walks the timed ladder: reminder, formal notice, 311 guide, then all sent", () => {
    const msgs: LadderMessage[] = [sentNotice, { direction: "outgoing", step: "reminder", at: "2026-10-21T14:00:00Z" }];
    expect(nextAction(open, msgs, "2026-10-22")).toMatchObject({ step: "formal_notice", dueOn: "2026-10-23" });
    msgs.push({ direction: "outgoing", step: "formal_notice", at: "2026-10-23T14:00:00Z" });
    expect(nextAction(open, msgs, "2026-10-24")).toMatchObject({ step: "guide_311", dueOn: "2026-10-25" });
    msgs.push({ direction: "outgoing", step: "guide_311", at: "2026-10-25T14:00:00Z" });
    expect(nextAction(open, msgs, "2026-10-26").kind).toBe("all_sent");
  });

  it("answers each kind of reply", () => {
    const reply = (classification: LadderMessage["classification"]): LadderMessage[] => [
      sentNotice,
      { direction: "incoming", classification, at: "2026-10-19T15:00:00Z" },
    ];
    expect(nextAction(open, reply("acknowledged_no_date"), "2026-10-19")).toMatchObject({ step: "ask_date" });
    expect(nextAction(open, reply("scheduled"), "2026-10-19")).toMatchObject({ step: "confirm_schedule" });
    expect(nextAction(open, reply("needs_access"), "2026-10-19")).toMatchObject({ step: "offer_access" });
    expect(nextAction(open, reply("disputes_or_refuses"), "2026-10-19")).toMatchObject({ step: "formal_notice" });
    expect(nextAction(open, reply("says_fixed"), "2026-10-19").kind).toBe("confirm_fixed");
    expect(nextAction(open, reply("unclear"), "2026-10-19").kind).toBe("team_review");
    expect(nextAction(open, reply(null), "2026-10-19").kind).toBe("team_review");
  });

  it("goes to 311 when they refuse after the formal notice", () => {
    const msgs: LadderMessage[] = [
      sentNotice,
      { direction: "outgoing", step: "formal_notice", at: "2026-10-19T14:00:00Z" },
      { direction: "incoming", classification: "disputes_or_refuses", at: "2026-10-20T14:00:00Z" },
    ];
    expect(nextAction(open, msgs, "2026-10-20")).toMatchObject({ step: "guide_311" });
  });

  it("waits for a scheduled repair, then checks in", () => {
    const msgs: LadderMessage[] = [
      sentNotice,
      { direction: "incoming", classification: "scheduled", at: "2026-10-19T15:00:00Z" },
      { direction: "outgoing", step: "confirm_schedule", at: "2026-10-19T16:00:00Z" },
    ];
    const c = { status: "open" as const, repairScheduledFor: "2026-10-22" };
    expect(nextAction(c, msgs, "2026-10-22").kind).toBe("waiting_for_repair");
    expect(nextAction(c, msgs, "2026-10-23").kind).toBe("checkin");
  });

  it("asks for a new date when a scheduled repair is missed", () => {
    const msgs: LadderMessage[] = [sentNotice, { direction: "outgoing", step: "confirm_schedule", at: "2026-10-19T16:00:00Z" }];
    const c = { status: "open" as const, repairScheduledFor: null, repairMissedAt: "2026-10-23T12:00:00Z" };
    expect(nextAction(c, msgs, "2026-10-23")).toMatchObject({ step: "missed_repair", dueOn: "2026-10-23" });
  });

  it("drops an appointment once a later reply says something else", () => {
    const msgs: LadderMessage[] = [
      sentNotice,
      { direction: "incoming", classification: "scheduled", at: "2026-10-19T15:00:00Z" },
      { direction: "outgoing", step: "confirm_schedule", at: "2026-10-19T16:00:00Z" },
      { direction: "incoming", classification: "acknowledged_no_date", at: "2026-10-20T15:00:00Z" },
      { direction: "outgoing", step: "ask_date", at: "2026-10-20T16:00:00Z" },
    ];
    const c = { status: "open" as const, repairScheduledFor: "2026-10-22" };
    expect(nextAction(c, msgs, "2026-10-21")).toMatchObject({ kind: "send", step: "reminder" });
  });

  it("puts the day-after check-in on the team's list while waiting for a repair", () => {
    expect(dueSummary({ kind: "waiting_for_repair", scheduledFor: "2026-10-22", reason: "" }, "2026-10-19")).toEqual({ nextStep: "checkin", nextDueOn: "2026-10-23" });
  });

  it("is done once fixed", () => {
    expect(nextAction({ status: "fixed" }, [sentNotice], "2026-10-25").kind).toBe("done");
  });

  it("summarizes what's due for teammates", () => {
    expect(dueSummary({ kind: "send", step: "reminder", dueOn: "2026-10-21", reason: "" }, "2026-10-19")).toEqual({ nextStep: "reminder", nextDueOn: "2026-10-21" });
    expect(dueSummary({ kind: "team_review", reason: "" }, "2026-10-19")).toEqual({ nextStep: "team_review", nextDueOn: "2026-10-19" });
    expect(dueSummary({ kind: "done", reason: "" }, "2026-10-19")).toEqual({ nextStep: null, nextDueOn: null });
  });
});

describe("templates", () => {
  const ctx: TemplateContext = {
    today: "2026-10-18",
    tenantName: "Maria Lopez",
    address: "123 Example St, Bronx, NY 10452",
    unit: "4B",
    mgmtName: "Acme Management",
    issueTypes: ["heat"],
    issueDescription: "Radiators cold since Oct 5.",
    startedOn: "2026-10-05",
    firstReportedOn: "2026-10-06",
    firstReportedVia: "text",
    priorFollowups: 3,
    daysSinceReport: 12,
    estimate: estimateAbatement({ monthlyRent: 1500, issueTypes: ["heat"], noticeOn: "2026-10-06", endOn: "2026-10-18" }),
    sentOn: { notice: "2026-10-12", reminder: "2026-10-15" },
    openViolations: 14,
  };

  it("switches to plural wording when the tenant listed several problems", () => {
    const many = { ...ctx, issueTypes: ["mold", "heat"] as const };
    const notice = buildMessage("notice", many);
    expect(notice.subject).toBe("Repairs needed at 123 Example St, Bronx, NY 10452, Apt 4B");
    expect(notice.body).toContain("I'm writing about repairs needed in my apartment at 123 Example St, Bronx, NY 10452, Apt 4B: no heat or hot water and mold (Radiators cold since Oct 5).");
    expect(notice.body).toContain("The problems started on October 5, 2026. I first reported them to you on");
    expect(notice.body).toContain("since they were first reported, and they are still not fixed.");
    expect(buildMessage("notice", { ...many, voice: "abate" }).body).toContain("about repairs that are needed: no heat or hot water and mold");
    // Only some problems may be fixed or scheduled: never claim all of them were, and make the
    // tenant say which are still broken (approval is blocked until the blank is filled).
    const missed = buildMessage("missed_repair", { ...many, missedBecause: "says_fixed" }).body;
    expect(missed).toContain("I was told repairs at 123 Example St, Bronx, NY 10452, Apt 4B were complete, but not everything I reported (no heat or hot water and mold");
    expect(unfilledPlaceholders(missed)).toEqual(["[add which problems are still not fixed]"]);
    expect(missed).not.toMatch(/but the problems are still not fixed/);
    const passed = buildMessage("missed_repair", { ...many, repairScheduledFor: "2026-10-16", missedBecause: "appointment" }).body;
    expect(passed).toContain("did not happen or did not fix everything I reported");
    expect(unfilledPlaceholders(passed)).toHaveLength(1);
    const scheduled = buildMessage("confirm_schedule", { ...many, repairScheduledFor: "2026-10-20" }).body;
    expect(scheduled).toContain("Thank you for scheduling repairs at 123 Example St, Bronx, NY 10452, Apt 4B for");
    expect(scheduled).toContain("If this visit won't cover everything I reported (no heat or hot water and mold");
    // Single-problem letters keep their wording.
    expect(buildMessage("missed_repair", { ...ctx, missedBecause: "says_fixed" }).body).toContain("I was told the repair of no heat or hot water (Radiators cold since Oct 5) at");

    // No singular leftovers anywhere on the ladder.
    for (const step of ["notice", "reminder", "formal_notice", "guide_311", "ask_date", "confirm_schedule", "offer_access", "missed_repair"] as const) {
      for (const voice of ["tenant", "abate"] as const) {
        const { subject, body } = buildMessage(step, { ...many, voice, repairScheduledFor: "2026-10-16" });
        const text = `${subject}\n${body}`;
        expect(text, `${step} (${voice})`).not.toMatch(/\bthe problem\b(?!s)|\bthis problem\b|\ba repair\b(?! date)|\bit is still\b|\bit was first\b|\breported it\b|\bremains unrepaired\b/i);
      }
    }
  });

  it("says the first notice is the first report when management hadn't been told", () => {
    for (const voice of ["tenant", "abate"] as const) {
      const notice = buildMessage("notice", { ...ctx, voice, toldBefore: false, noticeIsFirstReport: true, priorFollowups: 0, daysSinceReport: 0 }).body;
      expect(notice).toContain("The problem started on October 5, 2026, and this is the first time it is being reported to you.");
      expect(notice).not.toMatch(/first reported it to you on|still not fixed/);
    }
    expect(buildMessage("notice", { ...ctx, issueTypes: ["heat", "mold"], toldBefore: false, noticeIsFirstReport: true }).body).toContain(
      "The problems started on October 5, 2026, and this is the first time they are being reported to you.",
    );
    // The formal notice's timeline treats the written notice as the first report.
    const formal = buildMessage("formal_notice", { ...ctx, toldBefore: false, noticeIsFirstReport: true, firstReportedOn: "2026-10-12" }).body;
    expect(formal).toContain("- October 12, 2026: written notice sent (first report)");
    expect(formal).not.toContain("first reported to you by");
    // Management already wrote back before the notice went out: don't call it the first report.
    const afterReply = buildMessage("notice", { ...ctx, toldBefore: false, noticeIsFirstReport: false }).body;
    expect(afterReply).toContain("The problem started on October 5, 2026, and it is still not fixed.");
    expect(afterReply).not.toMatch(/first time|first reported/);
  });

  it("writes a factual first notice with a reply-by date", () => {
    const m = buildMessage("notice", ctx);
    expect(m.subject).toBe("Repair needed at 123 Example St, Bronx, NY 10452, Apt 4B");
    expect(m.body).toContain("Hello Acme Management,");
    expect(m.body).toContain("no heat or hot water (Radiators cold since Oct 5)");
    expect(m.body).toContain("October 6, 2026 by text message, and followed up 3 times since");
    expect(m.body).toContain("12 days");
    expect(m.body).toContain("Please reply by Wednesday, October 21");
    expect(m.body).not.toMatch(/\b(abatement|warranty|owed)\b/i);
  });

  it("puts the timeline, estimate and violations in the formal notice, hedged", () => {
    const m = buildMessage("formal_notice", ctx);
    expect(m.body).toContain("- October 12, 2026: written notice sent");
    expect(m.body).toContain("warranty of habitability");
    expect(m.body).toContain("may be between $120 and $300");
    expect(m.body).toContain("14 open violations");
    expect(m.body).not.toMatch(/you owe|you are owed|will get|lawsuit|sue/i);
  });

  it("inserts the agent's reply reference only where the template allows", () => {
    const m = buildMessage("ask_date", { ...ctx, replyReference: "On October 17 you wrote that you would look into it." });
    expect(m.body).toContain("On October 17 you wrote that you would look into it.\n\nCould you please confirm");
  });

  it("flags placeholders the tenant must fill in", () => {
    expect(unfilledPlaceholders(buildMessage("guide_311", ctx).body)).toEqual(["[add your 311 number]"]);
    expect(unfilledPlaceholders(buildMessage("notice", ctx).body)).toEqual([]);
  });

  it("reads naturally when management was told today", () => {
    const m = buildMessage("notice", { ...ctx, daysSinceReport: 0 });
    expect(m.body).toContain("since. It is still not fixed.");
    expect(m.body).not.toContain("0 days");
    expect(buildMessage("ask_date", { ...ctx, daysSinceReport: 0 }).body).toContain("I reported it to you today.");
  });

  it("never writes Apt twice", () => {
    expect(buildMessage("notice", { ...ctx, unit: "Apt 4B" }).subject).toBe("Repair needed at 123 Example St, Bronx, NY 10452, Apt 4B");
    expect(bareUnit("#12C")).toBe("12C");
    expect(bareUnit("apt. 3")).toBe("3");
  });

  it("words a missed repair to match what happened", () => {
    const saidFixed = buildMessage("missed_repair", { ...ctx, missedBecause: "says_fixed", repairScheduledFor: "2026-10-25" });
    expect(saidFixed.body).toContain("I was told the repair");
    expect(saidFixed.body).not.toContain("did not happen");
    const passed = buildMessage("missed_repair", { ...ctx, missedBecause: "appointment", repairScheduledFor: "2026-10-16" });
    expect(passed.body).toContain("scheduled for October 16, 2026 did not happen or did not fix the problem");
    const future = buildMessage("missed_repair", { ...ctx, missedBecause: "appointment", repairScheduledFor: "2026-10-25" });
    expect(future.body).not.toContain("scheduled for");
  });

  it("says 'up to' when an issue's low end is zero", () => {
    const est = estimateAbatement({ monthlyRent: 2000, issueTypes: ["other"], noticeOn: "2026-09-18", endOn: "2026-10-18" });
    const m = buildMessage("formal_notice", { ...ctx, issueTypes: ["other"], estimate: est });
    expect(m.body).toMatch(/may be up to \$\d+/);
    expect(m.body).not.toContain("between $0");
  });

  it("handles a missing unit, manager name and description", () => {
    const m = buildMessage("notice", { ...ctx, unit: null, mgmtName: null, issueDescription: null, priorFollowups: 0 });
    expect(m.body.startsWith("Hello,")).toBe(true);
    expect(m.body).toContain("at 123 Example St, Bronx, NY 10452: no heat or hot water.");
    expect(m.body).not.toContain("followed up");
  });
});

describe("mailto", () => {
  it("plus-addresses the team inbox per case", () => {
    expect(trackingAddress("abate.team@gmail.com", "AB12CD")).toBe("abate.team+ab12cd@gmail.com");
    expect(trackingAddress("", "AB12CD")).toBeNull();
  });

  it("encodes subject, body line breaks and cc", () => {
    const link = buildMailto({ to: "mgmt@example.com", cc: "t+ab@gmail.com", subject: "Repair & more", body: "Line 1\nLine 2" });
    expect(link).toBe("mailto:mgmt@example.com?cc=t%2Bab%40gmail.com&subject=Repair%20%26%20more&body=Line%201%0D%0ALine%202");
  });
});
