import { describe, expect, it } from "vitest";
import { findDateMentions, resolveFirstDate } from "./resolve-dates";

// 2026-10-17 is a Saturday.
const SAT = "2026-10-17";

describe("resolveFirstDate", () => {
  it.each([
    ["The plumber is coming today.", "2026-10-17"],
    ["Someone will be there tonight.", "2026-10-17"],
    ["We'll stop by this afternoon.", "2026-10-17"],
    ["coming tomorrow", "2026-10-18"],
    ["plumber coming tmrw 10am", "2026-10-18"],
    ["The day after tomorrow works.", "2026-10-19"],
    ["We fixed it yesterday.", "2026-10-16"],
  ])("relative words: %s", (text, expected) => {
    expect(resolveFirstDate(text, SAT)).toBe(expected);
  });

  it.each([
    ["The super will come Tuesday.", "2026-10-20"],
    ["He'll come by on tues.", "2026-10-20"],
    ["We'll be there Monday morning.", "2026-10-19"],
    ["Next Monday works for us.", "2026-10-19"],
    ["We can come this coming Friday.", "2026-10-23"],
    ["The crew comes Saturday.", "2026-10-24"],
    ["This Saturday we will finish.", "2026-10-17"],
  ])("weekdays resolve to the next occurrence: %s", (text, expected) => {
    expect(resolveFirstDate(text, SAT)).toBe(expected);
  });

  it.each([
    ["The electrician replaced the breaker on Monday.", "2026-10-12"],
    ["Last Wednesday the super checked it.", "2026-10-14"],
    ["We came by this past Thursday.", "2026-10-15"],
  ])("weekdays talked about in the past resolve backward: %s", (text, expected) => {
    expect(resolveFirstDate(text, SAT)).toBe(expected);
  });

  it("does not read a passive future as the past", () => {
    expect(resolveFirstDate("The heat will be fixed Tuesday.", SAT)).toBe("2026-10-20");
  });

  it.each([
    ["Scheduled for 10/23.", "2026-10-23"],
    ["Scheduled for 10/23/26.", "2026-10-23"],
    ["It was completed on 10/12/2026.", "2026-10-12"],
    ["Booked for Oct 22.", "2026-10-22"],
    ["Booked for Oct. 22nd.", "2026-10-22"],
    ["Booked for October 22nd, 2026.", "2026-10-22"],
    ["Booked for the 22nd of October.", "2026-10-22"],
    ["We'll come on the 22nd.", "2026-10-22"],
    ["Rent is due on the 1st.", "2026-11-01"],
    ["We'll be there January 4.", "2027-01-04"],
  ])("explicit dates: %s", (text, expected) => {
    expect(resolveFirstDate(text, SAT)).toBe(expected);
  });

  it("prefers the explicit date when a weekday sits next to it", () => {
    const mentions = findDateMentions("He will come Friday Oct 30 instead.", "2026-10-26");
    expect(mentions.map((m) => m.date)).toEqual(["2026-10-30"]);
    expect(findDateMentions("Confirmed for Monday, 10/26.", "2026-10-22").map((m) => m.date)).toEqual(["2026-10-26"]);
  });

  it("returns null when there is no date, or only a vague one", () => {
    expect(resolveFirstDate("We'll look into it.", SAT)).toBeNull();
    expect(resolveFirstDate("Parts should arrive next week.", SAT)).toBeNull();
    expect(resolveFirstDate("Open 24/7, unit 3rd floor, the 3rd floor hallway.", SAT)).toBeNull();
    expect(resolveFirstDate("Invalid 13/45 date.", SAT)).toBeNull();
  });

  it("ignores lowercase words that look like day abbreviations", () => {
    expect(resolveFirstDate("the water sat in the sun all day", SAT)).toBeNull();
    expect(resolveFirstDate("coming fri", SAT)).toBe("2026-10-23");
  });

  it("lists every mention in order", () => {
    const mentions = findDateMentions("We can send the locksmith Wednesday or Thursday afternoon.", SAT);
    expect(mentions.map((m) => m.date)).toEqual(["2026-10-21", "2026-10-22"]);
  });
});
