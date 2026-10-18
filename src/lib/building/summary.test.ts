import { afterEach, describe, expect, it, vi } from "vitest";
import {
  daysOpen,
  fetchBuildingSummary,
  fetchBuildingSummaryResult,
  heatSeasonStart,
  median,
  pickAgent,
  pickOwner,
} from "./summary";

// Synthetic Socrata rows shaped like the live responses (Oct 2026). Every name is made up.
const BBL = "2012340056";
const BIN = "2099991";

const FIXTURES = {
  violations: [
    { class: "A", n: "3" },
    { class: "B", n: "5" },
    { class: "C", n: "2" },
    { class: "I", n: "1" },
  ],
  complaintCounts: [{ total: "8", heat: "6" }],
  closedComplaints: [
    { complaint_id: "100001", received_date: "2026-08-04T08:27:11.000", complaint_status_date: "2026-08-05T05:20:19.000" }, // 1
    { complaint_id: "100002", received_date: "2026-02-19T09:16:48.000", complaint_status_date: "2026-04-13T05:20:22.000" }, // 53
    { complaint_id: "100003", received_date: "2026-02-08T13:45:46.000", complaint_status_date: "2026-02-14T05:20:38.000" }, // 6
    { complaint_id: "100004", received_date: "2026-01-30T11:04:20.000", complaint_status_date: "2026-02-01T05:22:04.000" }, // 2
    { complaint_id: "100005", received_date: "2026-01-28T09:02:14.000", complaint_status_date: "2026-01-31T05:20:45.000" }, // 3
  ],
  registrations: [
    // Newest registration on the lot is for a different building; ours is second.
    { registrationid: "900002", bin: "2099990", lastregistrationdate: "2026-07-01T00:00:00.000" },
    { registrationid: "900001", bin: BIN, lastregistrationdate: "2025-10-15T00:00:00.000" },
  ],
  contacts: {
    "900001": [
      { type: "CorporateOwner", corporationname: "EXAMPLE HOLDINGS LLC" },
      { type: "HeadOfficer", firstname: "PAT", lastname: "SAMPLE" },
      { type: "Agent", firstname: "ALEX", lastname: "PLACEHOLDER", corporationname: "SAMPLE MANAGEMENT CO" },
      { type: "SiteManager", firstname: "SAM", lastname: "FICTIONAL" },
    ],
    "900002": [{ type: "Agent", corporationname: "OTHER BUILDING AGENT INC" }],
  } as Record<string, unknown[]>,
};

type Route = "violations" | "complaintCounts" | "closedComplaints" | "registrations" | "contacts";

function routeOf(url: URL): Route {
  const dataset = url.pathname.split("/").pop();
  const select = url.searchParams.get("$select") ?? "";
  if (dataset === "wvxf-dwi5.json") return "violations";
  if (dataset === "ygpa-z7cr.json") return select.includes("count(distinct") ? "complaintCounts" : "closedComplaints";
  if (dataset === "tesw-yqqr.json") return "registrations";
  if (dataset === "feu5-w2e2.json") return "contacts";
  throw new Error(`Unexpected request ${url}`);
}

/** Stubs fetch with the fixtures; routes listed in `fail` return HTTP 500. */
function stubOpenData(fail: Route[] = [], overrides: Partial<Record<Route, unknown>> = {}) {
  const urls: URL[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(input);
      urls.push(url);
      const route = routeOf(url);
      if (fail.includes(route)) return new Response("error", { status: 500 });
      if (route in overrides) return Response.json(overrides[route]);
      if (route === "contacts") {
        const id = url.searchParams.get("$where")?.match(/registrationid=(\d+)/)?.[1] ?? "";
        return Response.json(FIXTURES.contacts[id] ?? []);
      }
      return Response.json(FIXTURES[route]);
    }),
  );
  return urls;
}

const NOW = new Date("2026-10-18T16:00:00Z");

afterEach(() => vi.unstubAllGlobals());

describe("heatSeasonStart", () => {
  it("uses Oct 1 this year from October to December", () => {
    expect(heatSeasonStart("2026-10-18")).toBe("2026-10-01");
    expect(heatSeasonStart("2026-10-01")).toBe("2026-10-01");
    expect(heatSeasonStart("2026-12-31")).toBe("2026-10-01");
  });

  it("uses Oct 1 last year from January to September", () => {
    expect(heatSeasonStart("2027-02-14")).toBe("2026-10-01");
    expect(heatSeasonStart("2027-01-01")).toBe("2026-10-01");
    expect(heatSeasonStart("2026-08-15")).toBe("2025-10-01");
    expect(heatSeasonStart("2026-09-30")).toBe("2025-10-01");
  });

  it("follows New York's date, not UTC's, at the season boundary", async () => {
    stubOpenData();
    // 11:30pm Sep 30 in New York is already Oct 1 in UTC: still last season.
    const late = await fetchBuildingSummary(BBL, BIN, { now: new Date("2026-10-01T03:30:00Z") });
    expect(late?.complaintsThisSeason.since).toBe("2025-10-01");
    const next = await fetchBuildingSummary(BBL, BIN, { now: new Date("2026-10-01T04:30:00Z") });
    expect(next?.complaintsThisSeason.since).toBe("2026-10-01");
  });
});

describe("fetchBuildingSummary", () => {
  it("aggregates every query into a summary", async () => {
    stubOpenData();
    const result = await fetchBuildingSummaryResult(BBL, BIN, { now: NOW });
    expect(result).toEqual({
      complete: true,
      summary: {
        bbl: BBL,
        bin: BIN,
        openViolations: { total: 10, classA: 3, classB: 5, classC: 2 },
        complaintsThisSeason: { heat: 6, other: 2, since: "2026-10-01" },
        managingAgent: { name: "ALEX PLACEHOLDER", company: "SAMPLE MANAGEMENT CO" },
        owner: "EXAMPLE HOLDINGS LLC",
        medianDaysToClose: 3,
        fetchedAt: "2026-10-18T16:00:00.000Z",
      },
    });
  });

  it("sends validated, correctly scoped queries", async () => {
    const urls = stubOpenData();
    await fetchBuildingSummary(BBL, BIN, { now: NOW });
    const where = (route: Route) => urls.find((u) => routeOf(u) === route)?.searchParams.get("$where");

    expect(where("violations")).toBe(`bbl='${BBL}' AND violationstatus='Open'`);
    expect(where("complaintCounts")).toBe(`bbl=${BBL} AND received_date >= '2026-10-01T00:00:00'`);
    expect(where("closedComplaints")).toBe(`bbl=${BBL} AND complaint_status='CLOSE' AND received_date >= '2024-10-18T00:00:00'`);
    expect(where("registrations")).toBe("boroid=2 AND block=1234 AND lot=56");
    expect(where("contacts")).toBe("registrationid=900001");

    const closed = urls.find((u) => routeOf(u) === "closedComplaints")!;
    expect(Number(closed.searchParams.get("$limit"))).toBeLessThanOrEqual(1000);
    expect(closed.searchParams.get("$order")).toBe("received_date DESC");
  });

  it("uses the newest registration on the lot when there is no BIN", async () => {
    stubOpenData();
    const summary = await fetchBuildingSummary(BBL, null, { now: NOW });
    expect(summary?.bin).toBeNull();
    expect(summary?.managingAgent).toEqual({ name: null, company: "OTHER BUILDING AGENT INC" });
    expect(summary?.owner).toBeNull();
  });

  it("returns partial data with zeros and nulls when some queries fail", async () => {
    stubOpenData(["violations", "contacts"]);
    const result = await fetchBuildingSummaryResult(BBL, BIN, { now: NOW });
    expect(result?.complete).toBe(false);
    expect(result?.summary).toMatchObject({
      openViolations: { total: 0, classA: 0, classB: 0, classC: 0 },
      complaintsThisSeason: { heat: 6, other: 2, since: "2026-10-01" },
      managingAgent: null,
      owner: null,
      medianDaysToClose: 3,
    });
  });

  it("treats a failed registration lookup and failed complaint queries the same way", async () => {
    stubOpenData(["registrations", "complaintCounts", "closedComplaints"]);
    const result = await fetchBuildingSummaryResult(BBL, BIN, { now: NOW });
    expect(result?.complete).toBe(false);
    expect(result?.summary.openViolations.total).toBe(10);
    expect(result?.summary.complaintsThisSeason).toEqual({ heat: 0, other: 0, since: "2026-10-01" });
    expect(result?.summary.medianDaysToClose).toBeNull();
    expect(result?.summary.managingAgent).toBeNull();
  });

  it("returns null when every query fails, or when fetch itself throws", async () => {
    stubOpenData(["violations", "complaintCounts", "closedComplaints", "registrations"]);
    expect(await fetchBuildingSummary(BBL, BIN, { now: NOW })).toBeNull();

    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await fetchBuildingSummary(BBL, BIN, { now: NOW })).toBeNull();
  });

  it("handles a building with no records at all", async () => {
    stubOpenData([], { violations: [], complaintCounts: [{ total: "0", heat: "0" }], closedComplaints: [], registrations: [] });
    const summary = await fetchBuildingSummary(BBL, BIN, { now: NOW });
    expect(summary).toMatchObject({
      openViolations: { total: 0, classA: 0, classB: 0, classC: 0 },
      complaintsThisSeason: { heat: 0, other: 0 },
      managingAgent: null,
      owner: null,
      medianDaysToClose: null,
    });
  });

  it("rejects invalid BBLs without calling the API and drops placeholder BINs", async () => {
    const urls = stubOpenData();
    for (const bad of ["", "123", "6012340056", "2012340056' OR '1'='1"]) {
      expect(await fetchBuildingSummary(bad, BIN, { now: NOW })).toBeNull();
    }
    expect(urls).toHaveLength(0);

    const summary = await fetchBuildingSummary(BBL, "2000000", { now: NOW });
    expect(summary?.bin).toBeNull();
  });
});

describe("helpers", () => {
  it("picks the agent's person and company names", () => {
    expect(pickAgent([{ type: "Agent", firstname: "ALEX", lastname: "PLACEHOLDER" }])).toEqual({ name: "ALEX PLACEHOLDER", company: null });
    expect(pickAgent([{ type: "Agent", corporationname: " SAMPLE  MGMT " }])).toEqual({ name: null, company: "SAMPLE MGMT" });
    expect(pickAgent([{ type: "SiteManager", firstname: "SAM" }, { type: "Agent" }])).toBeNull();
  });

  it("prefers a corporate owner, then an individual owner", () => {
    expect(pickOwner([{ type: "IndividualOwner", firstname: "JO", lastname: "EXAMPLE" }, { type: "CorporateOwner", corporationname: "EXAMPLE LLC" }])).toBe("EXAMPLE LLC");
    expect(pickOwner([{ type: "IndividualOwner", firstname: "JO", lastname: "EXAMPLE" }])).toBe("JO EXAMPLE");
    expect(pickOwner([{ type: "HeadOfficer", firstname: "PAT", lastname: "SAMPLE" }])).toBeNull();
  });

  it("counts calendar days open and takes the median", () => {
    expect(daysOpen("2026-01-30T23:59:00.000", "2026-01-31T00:01:00.000")).toBe(1);
    expect(daysOpen("2026-01-30T10:00:00.000", "2026-01-30T18:00:00.000")).toBe(0);
    expect(daysOpen("2026-02-01T00:00:00.000", "2026-01-30T00:00:00.000")).toBe(0);
    expect(daysOpen(undefined, "2026-01-30T00:00:00.000")).toBeNull();
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 4, 10])).toBe(3);
  });
});
