import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BuildingSummary } from "./types";

const mocks = vi.hoisted(() => ({
  hasDatabase: vi.fn(() => true),
  maybeSingle: vi.fn(async (): Promise<{ data: unknown; error: unknown }> => ({ data: null, error: null })),
  upsert: vi.fn<(row: unknown, opts?: unknown) => Promise<{ error: unknown }>>(async () => ({ error: null })),
  from: vi.fn(),
  eq: vi.fn(),
  /** Signals passed to .abortSignal(), in call order. */
  signals: [] as AbortSignal[],
  fetchResult: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  hasDatabase: mocks.hasDatabase,
  db: () => ({ from: mocks.from }),
}));

// Keep the real heatSeasonStart; only the live fetch is mocked.
vi.mock("./summary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./summary")>()),
  fetchBuildingSummaryResult: mocks.fetchResult,
}));

import {
  CACHE_FALLBACK_MAX_AGE_MS,
  CACHE_TIMEOUT_MS,
  CACHE_TTL_MS,
  getBuildingSummary,
  isBuildingSummary,
} from "./index";

// Mid heat season in New York; the season started 2026-10-01.
const NOW = new Date("2026-10-18T16:00:00Z");

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
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mocks.signals.length = 0;
  mocks.hasDatabase.mockReturnValue(true);
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
  mocks.upsert.mockResolvedValue({ error: null });
  // Mirrors supabase-js: .select().eq().abortSignal().maybeSingle() and .upsert().abortSignal().
  const withSignal = <T>(next: () => T) => ({
    abortSignal: (signal: AbortSignal) => {
      mocks.signals.push(signal);
      return next();
    },
  });
  mocks.eq.mockImplementation(() => withSignal(() => ({ maybeSingle: mocks.maybeSingle })));
  mocks.from.mockImplementation(() => ({
    select: () => ({ eq: mocks.eq }),
    upsert: (row: unknown, opts?: unknown) => withSignal(() => mocks.upsert(row, opts)),
  }));
  mocks.fetchResult.mockResolvedValue({ summary: LIVE, complete: true });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

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

  it("only uses a cached copy made for exactly the same building or whole lot", async () => {
    // Counts are per building now, so one building's copy isn't the lot's numbers, and vice versa.
    mocks.maybeSingle.mockResolvedValue(cachedRow(summary({ bin: "2099990" }), 60_000));
    expect(await getBuildingSummary(BBL)).toEqual(LIVE);
    expect(mocks.fetchResult).toHaveBeenLastCalledWith(BBL, null);

    mocks.maybeSingle.mockResolvedValue(cachedRow(summary({ bin: null }), 60_000));
    expect(await getBuildingSummary(BBL, BIN)).toEqual(LIVE);
    expect(mocks.fetchResult).toHaveBeenCalledTimes(2);

    const lot = summary({ bin: null });
    mocks.maybeSingle.mockResolvedValue(cachedRow(lot, 60_000));
    expect(await getBuildingSummary(BBL, "2000000")).toEqual(lot);
    expect(mocks.fetchResult).toHaveBeenCalledTimes(2);
  });

  it("never uses a cached copy from an earlier heat season", async () => {
    // Fetched 18 hours ago, on Sep 30, before this season began.
    const lastSeason = summary({ complaintsThisSeason: { heat: 40, other: 9, since: "2025-10-01" } });
    vi.setSystemTime(new Date("2026-10-01T16:00:00Z"));
    mocks.maybeSingle.mockResolvedValue(cachedRow(lastSeason, 18 * 60 * 60 * 1000));
    expect(await getBuildingSummary(BBL, BIN)).toEqual(LIVE);
    expect(mocks.fetchResult).toHaveBeenCalledOnce();

    // Nor as a fallback when the live fetch fails.
    mocks.fetchResult.mockResolvedValue(null);
    expect(await getBuildingSummary(BBL, BIN)).toBeNull();
  });

  it("gives cache reads and writes a 2 second timeout", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    await getBuildingSummary(BBL, BIN);
    expect(mocks.signals).toHaveLength(2); // the read, then the write
    expect(mocks.signals.every((s) => s instanceof AbortSignal)).toBe(true);
    expect(timeout).toHaveBeenCalledWith(CACHE_TIMEOUT_MS);
    expect(CACHE_TIMEOUT_MS).toBe(2_000);
  });

  it("fetches live when the cache read times out", async () => {
    mocks.maybeSingle.mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    expect(await getBuildingSummary(BBL, BIN)).toEqual(LIVE);
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

  it("does not cache partial data, and prefers a complete copy up to 7 days old over it", async () => {
    const partial = summary({ openViolations: { total: 0, classA: 0, classB: 0, classC: 0 } });
    mocks.fetchResult.mockResolvedValue({ summary: partial, complete: false });

    expect(await getBuildingSummary(BBL, BIN)).toEqual(partial);
    expect(mocks.upsert).not.toHaveBeenCalled();

    const stale = summary();
    mocks.maybeSingle.mockResolvedValue(cachedRow(stale, CACHE_TTL_MS * 3));
    expect(await getBuildingSummary(BBL, BIN)).toEqual(stale);
    expect(mocks.upsert).not.toHaveBeenCalled();

    // Past 7 days, the fresh parts of the partial fetch win.
    mocks.maybeSingle.mockResolvedValue(cachedRow(stale, CACHE_FALLBACK_MAX_AGE_MS + 60_000));
    expect(await getBuildingSummary(BBL, BIN)).toEqual(partial);
    expect(CACHE_FALLBACK_MAX_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("falls back to a recent cached copy, or null, when the live fetch fails entirely", async () => {
    mocks.fetchResult.mockResolvedValue(null);
    expect(await getBuildingSummary(BBL, BIN)).toBeNull();

    const stale = summary();
    mocks.maybeSingle.mockResolvedValue(cachedRow(stale, CACHE_TTL_MS * 3));
    expect(await getBuildingSummary(BBL, BIN)).toEqual(stale);

    mocks.maybeSingle.mockResolvedValue(cachedRow(stale, CACHE_FALLBACK_MAX_AGE_MS + 60_000));
    expect(await getBuildingSummary(BBL, BIN)).toBeNull();
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
