import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BuildingSummary } from "./types";

const mocks = vi.hoisted(() => ({
  hasDatabase: vi.fn(() => true),
  maybeSingle: vi.fn(async (): Promise<{ data: unknown; error: unknown }> => ({ data: null, error: null })),
  upsert: vi.fn<(row: unknown, opts?: unknown) => Promise<{ error: unknown }>>(async () => ({ error: null })),
  from: vi.fn(),
  eq: vi.fn(),
  fetchResult: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  hasDatabase: mocks.hasDatabase,
  db: () => ({ from: mocks.from }),
}));

vi.mock("./summary", () => ({ fetchBuildingSummaryResult: mocks.fetchResult }));

import { CACHE_TTL_MS, getBuildingSummary, isBuildingSummary } from "./index";

const BBL = "2012340056";
const BIN = "2099991";

function summary(overrides: Partial<BuildingSummary> = {}): BuildingSummary {
  return {
    bbl: BBL,
    bin: BIN,
    openViolations: { total: 10, classA: 3, classB: 5, classC: 2 },
    complaintsThisSeason: { heat: 6, other: 2, since: "2026-10-01" },
    managingAgent: { name: "ALEX PLACEHOLDER", company: "SAMPLE MANAGEMENT CO" },
    owner: "EXAMPLE HOLDINGS LLC",
    medianDaysToClose: 3,
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

function cachedRow(data: unknown, ageMs: number) {
  return { data: { data, fetched_at: new Date(Date.now() - ageMs).toISOString() }, error: null };
}

const LIVE = summary({ openViolations: { total: 12, classA: 4, classB: 6, classC: 2 } });

beforeEach(() => {
  mocks.hasDatabase.mockReturnValue(true);
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.eq.mockImplementation(() => ({ maybeSingle: mocks.maybeSingle }));
  mocks.from.mockImplementation(() => ({ select: () => ({ eq: mocks.eq }), upsert: mocks.upsert }));
  mocks.fetchResult.mockResolvedValue({ summary: LIVE, complete: true });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => vi.clearAllMocks());

describe("getBuildingSummary", () => {
  it("returns a fresh cached summary without fetching", async () => {
    const cached = summary();
    mocks.maybeSingle.mockResolvedValue(cachedRow(cached, 60_000));

    expect(await getBuildingSummary(BBL, BIN)).toEqual(cached);
    expect(mocks.from).toHaveBeenCalledWith("building_cache");
    expect(mocks.eq).toHaveBeenCalledWith("bbl", BBL);
    expect(mocks.fetchResult).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("fetches live and writes the cache on a miss", async () => {
    expect(await getBuildingSummary(BBL, BIN)).toEqual(LIVE);
    expect(mocks.fetchResult).toHaveBeenCalledWith(BBL, BIN);
    expect(mocks.upsert).toHaveBeenCalledWith(
      { bbl: BBL, data: LIVE, fetched_at: LIVE.fetchedAt },
      { onConflict: "bbl" },
    );
  });

  it("refetches when the cached copy is older than 24 hours", async () => {
    mocks.maybeSingle.mockResolvedValue(cachedRow(summary(), CACHE_TTL_MS + 60_000));
    expect(await getBuildingSummary(BBL, BIN)).toEqual(LIVE);
    expect(mocks.fetchResult).toHaveBeenCalledOnce();
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });

  it("refetches when the cached copy was for another building on the same lot", async () => {
    mocks.maybeSingle.mockResolvedValue(cachedRow(summary({ bin: "2099990" }), 60_000));
    expect(await getBuildingSummary(BBL, BIN)).toEqual(LIVE);
    expect(mocks.fetchResult).toHaveBeenCalledOnce();
  });

  it("uses a cached copy for any building on the lot when no BIN is given", async () => {
    const cached = summary({ bin: "2099990" });
    mocks.maybeSingle.mockResolvedValue(cachedRow(cached, 60_000));
    expect(await getBuildingSummary(BBL)).toEqual(cached);
    expect(mocks.fetchResult).not.toHaveBeenCalled();
  });

  it("refetches when the cached JSON has the wrong shape", async () => {
    mocks.maybeSingle.mockResolvedValue(cachedRow({ bbl: BBL, openViolations: 3 }, 60_000));
    expect(await getBuildingSummary(BBL, BIN)).toEqual(LIVE);
    expect(mocks.fetchResult).toHaveBeenCalledOnce();
  });

  it("fetches live when the cache read returns an error or throws", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: "relation does not exist" } });
    expect(await getBuildingSummary(BBL, BIN)).toEqual(LIVE);

    mocks.maybeSingle.mockRejectedValue(new Error("network down"));
    expect(await getBuildingSummary(BBL, BIN)).toEqual(LIVE);
    expect(mocks.fetchResult).toHaveBeenCalledTimes(2);
  });

  it("still returns live data when the cache write fails or throws", async () => {
    mocks.upsert.mockResolvedValue({ error: { message: "permission denied" } });
    expect(await getBuildingSummary(BBL, BIN)).toEqual(LIVE);

    mocks.upsert.mockRejectedValue(new Error("network down"));
    expect(await getBuildingSummary(BBL, BIN)).toEqual(LIVE);
  });

  it("skips the cache entirely when there is no database", async () => {
    mocks.hasDatabase.mockReturnValue(false);
    expect(await getBuildingSummary(BBL, BIN)).toEqual(LIVE);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("does not cache partial data, and prefers an older complete copy over it", async () => {
    const partial = summary({ openViolations: { total: 0, classA: 0, classB: 0, classC: 0 } });
    mocks.fetchResult.mockResolvedValue({ summary: partial, complete: false });

    expect(await getBuildingSummary(BBL, BIN)).toEqual(partial);
    expect(mocks.upsert).not.toHaveBeenCalled();

    const stale = summary();
    mocks.maybeSingle.mockResolvedValue(cachedRow(stale, CACHE_TTL_MS * 3));
    expect(await getBuildingSummary(BBL, BIN)).toEqual(stale);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("falls back to an older cached copy, or null, when the live fetch fails entirely", async () => {
    mocks.fetchResult.mockResolvedValue(null);
    expect(await getBuildingSummary(BBL, BIN)).toBeNull();

    const stale = summary();
    mocks.maybeSingle.mockResolvedValue(cachedRow(stale, CACHE_TTL_MS * 3));
    expect(await getBuildingSummary(BBL, BIN)).toEqual(stale);
  });

  it("returns null for an invalid BBL without touching the cache or the API", async () => {
    for (const bad of ["", "abc", "201234005", "2012340056; drop table cases"]) {
      expect(await getBuildingSummary(bad, BIN)).toBeNull();
    }
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.fetchResult).not.toHaveBeenCalled();
  });

  it("passes a cleaned BIN to the live fetch", async () => {
    await getBuildingSummary(BBL, "2000000");
    expect(mocks.fetchResult).toHaveBeenCalledWith(BBL, null);
  });
});

describe("isBuildingSummary", () => {
  it("accepts a summary and rejects other shapes", () => {
    expect(isBuildingSummary(summary())).toBe(true);
    expect(isBuildingSummary(summary({ managingAgent: null, owner: null, medianDaysToClose: null, bin: null }))).toBe(true);
    expect(isBuildingSummary(null)).toBe(false);
    expect(isBuildingSummary({ ...summary(), complaintsThisSeason: { heat: 1 } })).toBe(false);
    expect(isBuildingSummary({ ...summary(), fetchedAt: 123 })).toBe(false);
  });
});
