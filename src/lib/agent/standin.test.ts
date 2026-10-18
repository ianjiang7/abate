import { describe, expect, it } from "vitest";
import samples from "../../../data/sample-replies.json";
import { REPLY_CATEGORIES, type ReplyCategory } from "@/lib/domain/ladder";
import { readReplyStandIn } from "./standin";
import type { ReadReplyInput } from "./types";

type Sample = {
  id: string;
  receivedOn: string;
  issue: string;
  text: string;
  expectedCategory: ReplyCategory;
  expectedDate: string | null;
};

// Written after the stand-in rules, and deliberately not used to tune them, so this is the more
// honest measure of how the stand-in does on replies it hasn't seen. Made-up text only.
const HELD_OUT: Sample[] = [
  { id: "h-sched-1", receivedOn: "2026-10-22", issue: "no heat or hot water", text: "Good news - we have a boiler technician confirmed for Monday 10/26, 8am-12pm.", expectedCategory: "scheduled", expectedDate: "2026-10-26" },
  { id: "h-sched-2", receivedOn: "2026-10-20", issue: "a plumbing problem", text: "Super said he'll swing by this afternoon to snake the drain.", expectedCategory: "scheduled", expectedDate: "2026-10-20" },
  { id: "h-sched-3", receivedOn: "2026-10-28", issue: "pests", text: "Exterminator visits the building every second Tuesday. Your unit is on the list for the 3rd of November.", expectedCategory: "scheduled", expectedDate: "2026-11-03" },
  { id: "h-fixed-1", receivedOn: "2026-10-23", issue: "an electrical problem", text: "Hi, the bedroom outlet was rewired on Tuesday by our electrician. Please test it and confirm.", expectedCategory: "says_fixed", expectedDate: "2026-10-20" },
  { id: "h-fixed-2", receivedOn: "2026-10-16", issue: "a plumbing problem", text: "All good now? Maintenance said they swapped the cartridge in your shower valve.", expectedCategory: "says_fixed", expectedDate: null },
  { id: "h-fixed-3", receivedOn: "2026-10-13", issue: "no heat or hot water", text: "Hot water is back on in the whole building as of 6pm.", expectedCategory: "says_fixed", expectedDate: null },
  { id: "h-access-1", receivedOn: "2026-10-19", issue: "a leak and water damage", text: "Our contractor needs to get into 4B and the unit below. Can you be home Thursday morning?", expectedCategory: "needs_access", expectedDate: "2026-10-22" },
  { id: "h-access-2", receivedOn: "2026-10-24", issue: "mold", text: "We knocked twice this week and nobody answered. Leave your number with the doorman.", expectedCategory: "needs_access", expectedDate: null },
  { id: "h-access-3", receivedOn: "2026-10-10", issue: "a broken window, door or lock", text: "Before we can do anything we need to inspect. Reply with a good time for the super to come up.", expectedCategory: "needs_access", expectedDate: null },
  { id: "h-dispute-1", receivedOn: "2026-10-21", issue: "no heat or hot water", text: "The radiator is supposed to make noise. That is how steam heat works. There's nothing to repair.", expectedCategory: "disputes_or_refuses", expectedDate: null },
  { id: "h-dispute-2", receivedOn: "2026-10-14", issue: "a broken window, door or lock", text: "We are not replacing a window because of a draft. Use plastic film like everyone else.", expectedCategory: "disputes_or_refuses", expectedDate: null },
  { id: "h-dispute-3", receivedOn: "2026-10-15", issue: "a leak and water damage", text: "Our records show no complaint from your apartment and the inspection passed.", expectedCategory: "disputes_or_refuses", expectedDate: null },
  { id: "h-ack-1", receivedOn: "2026-10-09", issue: "mold", text: "Thank you for bringing this to our attention, we will address it promptly.", expectedCategory: "acknowledged_no_date", expectedDate: null },
  { id: "h-ack-2", receivedOn: "2026-10-17", issue: "a plumbing problem", text: "Copy that. Talking to the plumber today.", expectedCategory: "acknowledged_no_date", expectedDate: null },
  { id: "h-ack-3", receivedOn: "2026-10-12", issue: "no heat or hot water", text: "Your concern has been logged under ticket 4412-B. Expect a call from our maintenance coordinator.", expectedCategory: "acknowledged_no_date", expectedDate: null },
  { id: "h-unclear-1", receivedOn: "2026-10-18", issue: "pests", text: "Please call the office.", expectedCategory: "unclear", expectedDate: null },
  { id: "h-unclear-2", receivedOn: "2026-10-26", issue: "an electrical problem", text: "This email address is no longer monitored. Please use the resident portal.", expectedCategory: "unclear", expectedDate: null },
  { id: "h-unclear-3", receivedOn: "2026-10-11", issue: "a leak and water damage", text: "Is this about 2F or 2R?", expectedCategory: "unclear", expectedDate: null },
];

const input = (s: Pick<Sample, "text" | "receivedOn" | "issue">): ReadReplyInput => ({
  replyText: s.text,
  receivedOn: s.receivedOn,
  issue: s.issue,
  lastStepSent: "notice",
});

function score(set: Sample[]) {
  let category = 0;
  let date = 0;
  let missesToUnclear = 0;
  const misses: string[] = [];
  for (const s of set) {
    const r = readReplyStandIn(input(s));
    if (r.category === s.expectedCategory) category++;
    else {
      misses.push(`${s.id}: expected ${s.expectedCategory}, got ${r.category}`);
      if (r.category === "unclear") missesToUnclear++;
    }
    if (r.mentionedDate === s.expectedDate) date++;
  }
  return { category: category / set.length, date: date / set.length, misses, missesToUnclear };
}

describe("stand-in reader accuracy", () => {
  const set = samples as Sample[];

  it("covers all six categories with at least five samples each", () => {
    for (const c of REPLY_CATEGORIES) {
      expect(set.filter((s) => s.expectedCategory === c.id).length).toBeGreaterThanOrEqual(5);
    }
  });

  it("classifies the team's sample replies", () => {
    const result = score(set);
    // The rules were written alongside these samples, so this number is optimistic.
    console.info(
      `stand-in on ${set.length} samples: category ${(result.category * 100).toFixed(0)}%, date ${(result.date * 100).toFixed(0)}%`,
      result.misses,
    );
    expect(result.category).toBeGreaterThanOrEqual(0.9);
    expect(result.date).toBeGreaterThanOrEqual(0.9);
  });

  it("gets about half of held-out replies right, and fails safe on the rest", () => {
    const result = score(HELD_OUT);
    console.info(
      `stand-in on ${HELD_OUT.length} held-out replies: category ${(result.category * 100).toFixed(0)}%, date ${(result.date * 100).toFixed(0)}%, ${result.missesToUnclear} of ${result.misses.length} misses sent to "unclear"`,
      result.misses,
    );
    // Measured at 50% (9 of 18) when this set was written. Keyword rules miss new wording.
    expect(result.category).toBeGreaterThanOrEqual(0.45);
    // Most misses should land on "unclear", which sends the reply to a teammate instead of the wrong step.
    expect(result.missesToUnclear).toBeGreaterThanOrEqual(Math.ceil(result.misses.length * 0.75));
  });
});

describe("stand-in reader output", () => {
  const read = (text: string, receivedOn = "2026-10-17") => readReplyStandIn(input({ text, receivedOn, issue: "no heat or hot water" }));

  it("uses the precedence from the brief", () => {
    expect(read("The heat will be fixed Tuesday.").category).toBe("scheduled");
    expect(read("We fixed it.").category).toBe("says_fixed");
    expect(read("That is not our responsibility.").category).toBe("disputes_or_refuses");
    expect(read("Please let us in so the super can check, and be home in the morning.").category).toBe("needs_access");
    expect(read("We'll look into it.").category).toBe("acknowledged_no_date");
    expect(read("Received.").category).toBe("acknowledged_no_date");
    expect(read("Hmm.").category).toBe("unclear");
  });

  it("does not read a future fix as done", () => {
    expect(read("We will have it fixed soon.").category).toBe("acknowledged_no_date");
    expect(read("It isn't fixed yet but we're working on it.").category).toBe("acknowledged_no_date");
  });

  it("ignores the tenant's quoted message when classifying", () => {
    const reply = "Noted, passing it along.\n\nOn Fri, Oct 16, 2026 at 9:00 AM Tenant <t@example.com> wrote:\n> The plumber will come Tuesday? It is still not fixed.";
    const r = read(reply);
    expect(r.category).toBe("acknowledged_no_date");
    expect(r.mentionedDate).toBeNull();
  });

  it("quotes the deciding sentence back in the tenant's voice", () => {
    const r = read("Hi Sam,\n\nThanks for your email. The plumber will come Tuesday at 10.\n\nBest,\nOffice");
    expect(r.replyReference).toBe('On October 17 you replied: "The plumber will come Tuesday at 10."');
    expect(r.summary).toBe("Says the repair or visit is set for Tuesday, October 20.");
    expect(r.mentionedDate).toBe("2026-10-20");
    expect(r.source).toBe("stand-in");
  });

  it("trims a long quote to about 140 characters", () => {
    const long = `We have forwarded your request to maintenance and ${"they will review it carefully ".repeat(8)}.`;
    const ref = read(long).replyReference ?? "";
    const quoted = ref.slice(ref.indexOf('"') + 1, -1);
    expect(quoted.length).toBeLessThanOrEqual(141);
    expect(quoted.endsWith("…")).toBe(true);
  });

  it("drops the quote when it has money or legal language", () => {
    const r = read("The lock was broken by your guest and will be charged to you at $185.");
    expect(r.category).toBe("disputes_or_refuses");
    expect(r.replyReference).toBeNull();
  });

  it("returns no quote for unclear replies", () => {
    expect(read("Which apartment is this for?").replyReference).toBeNull();
  });
});

// Phrasings a reviewer found misread. They were used to write the fixes, so they live here as
// regression tests rather than in HELD_OUT. 2026-10-17 is a Saturday.
describe("stand-in reader: cancelled, refused and negated visits", () => {
  const read = (text: string, receivedOn = "2026-10-17") => readReplyStandIn(input({ text, receivedOn, issue: "a plumbing problem" }));

  it.each([
    ["The plumber cannot come Tuesday. We will update you.", "acknowledged_no_date"],
    ["Sorry, the plumber can't make it tomorrow, we will reschedule.", "acknowledged_no_date"],
    ["We will not be sending anyone Tuesday. This is not our responsibility.", "disputes_or_refuses"],
    ["The plumber won't be coming Monday, the appointment is cancelled.", "unclear"],
    ["Tuesday's appointment is cancelled, we will reach out.", "acknowledged_no_date"],
    ["Repairs can't be done until Monday at the earliest.", "unclear"],
    ["No one will be coming Tuesday.", "unclear"],
  ])("does not read %j as scheduled", (text, expected) => {
    const r = read(text);
    expect(r.category).toBe(expected);
    expect(r.summary).not.toMatch(/set for/);
  });

  it("still reads the new date when one visit is cancelled and another is set", () => {
    expect(read("We can't come Monday, but the plumber will come Tuesday.")).toMatchObject({ category: "scheduled", mentionedDate: "2026-10-20" });
    expect(read("The plumber can't come Tuesday. He will come Thursday instead.")).toMatchObject({ category: "scheduled", mentionedDate: "2026-10-22" });
    expect(read("Tuesday's appointment is postponed to Thursday.")).toMatchObject({ category: "scheduled", mentionedDate: "2026-10-22" });
    expect(read("The visit was rescheduled from Tuesday to Thursday.")).toMatchObject({ category: "scheduled", mentionedDate: "2026-10-22" });
  });

  it("keeps a plan next to an unrelated negative", () => {
    expect(read("Don't worry, the plumber will come Tuesday.")).toMatchObject({ category: "scheduled", mentionedDate: "2026-10-20" });
  });
});

describe("stand-in reader: promised fixes are not finished fixes", () => {
  const read = (text: string) => readReplyStandIn(input({ text, receivedOn: "2026-10-17", issue: "no heat or hot water" }));

  it.each([
    "The heat will be working again once the boiler part arrives.",
    "Hot water should be back once the part comes in.",
    "We hope the heat is back soon, the part is on order.",
    "Once the heat is back on we will let you know.",
    "We will pay for your hotel until the heat is back.",
    "The elevator is working again but we still need to look at your radiator.",
    "Let us know if the heat is back on.",
  ])("does not read %j as says_fixed", (text) => {
    expect(read(text).category).not.toBe("says_fixed");
  });

  it("still reads finished repairs as says_fixed", () => {
    expect(read("The heat is back on.").category).toBe("says_fixed");
    expect(read("Heat should be back on now, please check.").category).toBe("says_fixed");
    expect(read("We fixed the radiator yesterday, let us know if anything else comes up.").category).toBe("says_fixed");
    expect(read("When we checked, the heat was working again.").category).toBe("says_fixed");
  });
});

describe("stand-in reader: dates that aren't a repair date", () => {
  const read = (text: string, receivedOn = "2026-10-17") => readReplyStandIn(input({ text, receivedOn, issue: "a plumbing problem" }));

  it.each([
    ["Our office is closed today for the holiday. We will respond Monday.", "2026-10-17"],
    ["Rent will be due on the 1st as usual.", "2026-10-28"],
    ["The exterminator comes every Tuesday, you can sign up in the lobby.", "2026-10-17"],
    ["We will call you Monday.", "2026-10-17"],
  ])("does not read %j as scheduled", (text, receivedOn) => {
    expect(read(text, receivedOn).category).not.toBe("scheduled");
  });

  it("does not read a pipe size as a date", () => {
    expect(read("The plumber will replace the 1/2 inch valve soon.")).toMatchObject({ category: "acknowledged_no_date", mentionedDate: null });
    expect(read("We need to order a 3/4 pipe fitting, will update you.")).toMatchObject({ category: "acknowledged_no_date", mentionedDate: null });
  });

  it("does not call a reply scheduled on a date the sanitizer would drop", () => {
    // 3/4 resolves to March 4, outside the 90-day window, so it can't make the reply "scheduled".
    expect(read("The plumber will come 3/4.").category).not.toBe("scheduled");
  });

  it("resolves a past 'this Monday' backward", () => {
    expect(read("The super stopped by this Monday but nobody answered.")).toMatchObject({ category: "needs_access", mentionedDate: "2026-10-12" });
  });

  it("reads a vendor note that management forwarded", () => {
    const reply =
      "See below from our plumber.\n\n---------- Forwarded message ---------\nFrom: Ace Plumbing <dispatch@example.com>\nDate: Fri, Oct 16, 2026 at 4:10 PM\nSubject: 4B\nTo: office@example.com\n\nWe will be at the building Tuesday 9am for unit 4B.";
    expect(read(reply)).toMatchObject({ category: "scheduled", mentionedDate: "2026-10-20" });
  });
});

describe("stand-in reader: quotes", () => {
  const read = (text: string) => readReplyStandIn(input({ text, receivedOn: "2026-10-17", issue: "a leak and water damage" }));

  it("drops a quote with legal words", () => {
    expect(read("We are not liable for damage caused by tenant negligence.")).toMatchObject({ category: "disputes_or_refuses", replyReference: null });
    expect(read("You are in breach of your lease for blocking access.").replyReference).toBeNull();
  });
});
