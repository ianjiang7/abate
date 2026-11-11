import { describe, expect, it } from "vitest";
import { adTagsFrom, isTrackedPath, mayCapture, scrubEvent, scrubUrl, visitorFromCookie } from "./privacy";

const SITE = "https://abate.example";
const TOKEN = "t".repeat(32);

describe("which pages PostHog runs on", () => {
  it("tracks only the landing, start and privacy pages", () => {
    expect(["/", "/start", "/privacy"].every(isTrackedPath)).toBe(true);
    expect([`/case/${TOKEN}`, "/team/some-team-key", "/start/extra", "/nope", ""].some(isTrackedPath)).toBe(false);
  });

  it("sends nothing while a case or team page is on screen", () => {
    expect(mayCapture("$pageview", "/start", false)).toBe(true);
    expect(mayCapture("$pageview", `/case/${TOKEN}`, false)).toBe(false);
    expect(mayCapture("$snapshot", "/team/some-team-key", false)).toBe(false);
  });

  it("drops replay data once a case or team page was open in the tab, but keeps events", () => {
    expect(mayCapture("$snapshot", "/", false)).toBe(true);
    expect(mayCapture("$snapshot", "/", true)).toBe(false);
    expect(mayCapture("start_clicked", "/", true)).toBe(true);
  });
});

describe("scrubUrl", () => {
  it("keeps our tracked pages without the query string or hash", () => {
    expect(scrubUrl(`${SITE}/start?invite=K7QM4X#top`, SITE)).toBe(`${SITE}/start`);
    expect(scrubUrl(`${SITE}/?utm_source=flyer`, SITE)).toBe(`${SITE}/`);
  });

  it("shrinks case and team links to the origin", () => {
    expect(scrubUrl(`${SITE}/case/${TOKEN}?new=1`, SITE)).toBe(SITE);
    expect(scrubUrl(`${SITE}/team/some-team-key?test=1`, SITE)).toBe(SITE);
  });

  it("keeps only the origin of other sites", () => {
    expect(scrubUrl("https://www.reddit.com/r/AskNYC/comments/abc123/", SITE)).toBe("https://www.reddit.com");
    expect(scrubUrl("https://evil.example/start", SITE)).toBe("https://evil.example");
  });

  it("leaves values that aren't full URLs alone", () => {
    expect(scrubUrl("$direct", SITE)).toBe("$direct");
  });
});

describe("scrubEvent", () => {
  it("scrubs URLs in properties and person properties, and drops untracked paths", () => {
    const event = scrubEvent(
      {
        event: "$pageview",
        properties: {
          $current_url: `${SITE}/start?invite=K7QM4X`,
          $pathname: "/start",
          $referrer: `${SITE}/case/${TOKEN}`,
          $referring_domain: "abate.example",
          $prev_pageview_pathname: `/case/${TOKEN}`,
          step: 2,
          title: "What needs fixing?",
        },
        $set_once: { $initial_referrer: `https://www.reddit.com/r/AskNYC/comments/abc123/`, $initial_pathname: `/team/some-team-key` },
      },
      SITE,
    );
    expect(event.properties).toEqual({
      $current_url: `${SITE}/start`,
      $pathname: "/start",
      $referrer: SITE,
      $referring_domain: "abate.example",
      step: 2,
      title: "What needs fixing?",
    });
    expect(event.$set_once).toEqual({ $initial_referrer: "https://www.reddit.com" });
    expect(JSON.stringify(event)).not.toContain(TOKEN);
  });
});

describe("keeps ad tags", () => {
  // Which ad or partner link brought someone stays, as its own properties. URLs still lose their
  // query string, and search words go, since they can describe the tenant's problem.
  const SEARCH_TERM = "no heat landlord queens";

  function check(source: string, entrySource: string) {
    const tags = { utm_source: source, utm_medium: "cpc", utm_campaign: "nov-price", utm_content: "heat-ad" };
    const event = scrubEvent(
      {
        event: "price_buy_tapped",
        properties: {
          $current_url: `${SITE}/start?utm_source=${source}&utm_campaign=nov&invite=K7QM4X`,
          $session_entry_url: `${SITE}/?utm_source=${entrySource}`,
          ...tags,
          $session_entry_utm_source: entrySource,
          gclid: "<masked>",
          price_arm: "p29",
          utm_term: SEARCH_TERM,
          $session_entry_utm_term: SEARCH_TERM,
          ph_keyword: SEARCH_TERM,
        },
        $set_once: { $initial_utm_source: entrySource, $initial_utm_term: SEARCH_TERM },
      },
      SITE,
    );
    expect(event.properties).toEqual({
      $current_url: `${SITE}/start`,
      $session_entry_url: `${SITE}/`,
      ...tags,
      $session_entry_utm_source: entrySource,
      gclid: "<masked>",
      price_arm: "p29",
    });
    expect(event.$set_once).toEqual({ $initial_utm_source: entrySource });
    expect(JSON.stringify(event)).not.toContain(SEARCH_TERM);
    expect(JSON.stringify(event)).not.toContain("K7QM4X");
  }

  it("keeps utm tags and the price, drops the query string and search words", () => {
    check("google", "meta");
  });

  it.each(["google", "meta", "test", "partner-bronx"])("works for utm_source=%s", (source) => {
    check(source, source);
  });
});

describe("adTagsFrom (kept before PostHog loads)", () => {
  it("keeps source, medium, campaign and content", () => {
    expect(adTagsFrom("?utm_source=google&utm_medium=cpc&utm_campaign=nov-price&utm_content=ad_b&invite=K7QM4X")).toEqual({
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "nov-price",
      utm_content: "ad_b",
    });
  });

  it("never keeps search words or anything that isn't a plain word", () => {
    expect(adTagsFrom("?utm_term=no+heat+in+apartment&ph_keyword=landlord")).toEqual({});
    expect(adTagsFrom("?utm_source=" + encodeURIComponent("my landlord at 12 Main St"))).toEqual({});
    expect(adTagsFrom("?utm_source=" + "a".repeat(65))).toEqual({});
    expect(adTagsFrom("")).toEqual({});
  });
});

describe("visitorFromCookie", () => {
  const cookie = { distinct_id: "0192-anon", $sesid: [1761600000000, "0192-session", 1761600000000], $device_id: "0192-anon" };

  it("reads the anonymous ids, URL-encoded or not", () => {
    const expected = { distinctId: "0192-anon", sessionId: "0192-session" };
    expect(visitorFromCookie(encodeURIComponent(JSON.stringify(cookie)))).toEqual(expected);
    expect(visitorFromCookie(JSON.stringify(cookie))).toEqual(expected);
  });

  it("returns null without a usable id", () => {
    expect(visitorFromCookie(undefined)).toBeNull();
    expect(visitorFromCookie("not json")).toBeNull();
    expect(visitorFromCookie(JSON.stringify({ $sesid: cookie.$sesid }))).toBeNull();
  });
});
