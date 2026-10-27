import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isBbl,
  normalizeBin,
  soql,
  soqlDayStart,
  soqlString,
  soqlUrl,
  splitBbl,
  squish,
  toCount,
} from "./opendata";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("BBL and BIN validation", () => {
  it("accepts 10-digit BBLs with a borough code from 1 to 5", () => {
    expect(isBbl("2031520047")).toBe(true);
    expect(isBbl("5000070001")).toBe(true);
  });

  it("rejects anything else, including SoQL injection attempts", () => {
    for (const bad of ["", "203152004", "20315200477", "0031520047", "6031520047", "2031520O47", "1' OR '1'='1", " 2031520047", null, 2031520047]) {
      expect(isBbl(bad)).toBe(false);
    }
  });

  it("splits a BBL into borough, block and lot numbers", () => {
    expect(splitBbl("2031520047")).toEqual({ boroid: 2, block: 3152, lot: 47 });
    expect(() => splitBbl("abc")).toThrow();
  });

  it("treats placeholder BINs (borough digit + 000000) as missing", () => {
    expect(normalizeBin("2013587")).toBe("2013587");
    expect(normalizeBin(3018823)).toBe("3018823");
    expect(normalizeBin("3000000")).toBeNull();
    expect(normalizeBin("123")).toBeNull();
    expect(normalizeBin("7013587")).toBeNull();
    expect(normalizeBin(undefined)).toBeNull();
  });
});

describe("SoQL helpers", () => {
  it("doubles single quotes in string literals", () => {
    expect(soqlString("O'Brien")).toBe("'O''Brien'");
  });

  it("formats a day start and refuses anything that isn't a date", () => {
    expect(soqlDayStart("2026-10-01")).toBe("'2026-10-01T00:00:00'");
    expect(() => soqlDayStart("2026-10-01' OR 1=1 --")).toThrow();
  });

  it("builds the request URL with encoded parameters", () => {
    const url = new URL(
      soqlUrl("erm2-nwe9", { select: "class, count(*) as n", where: "bbl='2031520047'", group: "class", limit: 5 }),
    );
    expect(url.origin + url.pathname).toBe("https://data.cityofnewyork.us/resource/erm2-nwe9.json");
    expect(url.searchParams.get("$select")).toBe("class, count(*) as n");
    expect(url.searchParams.get("$where")).toBe("bbl='2031520047'");
    expect(url.searchParams.get("$group")).toBe("class");
    expect(url.searchParams.get("$limit")).toBe("5");
    expect(url.searchParams.has("$order")).toBe(false);
  });

  it("parses counts and squishes whitespace", () => {
    expect(toCount("14")).toBe(14);
    expect(toCount(undefined)).toBe(0);
    expect(toCount("-3")).toBe(0);
    expect(toCount("abc")).toBe(0);
    expect(squish("388 EAST    8 STREET ")).toBe("388 EAST 8 STREET");
  });
});

describe("soql()", () => {
  it("returns rows and sends the app token only when one is set", async () => {
    const fetchMock = vi.fn(async () => Response.json([{ class: "A", n: "2" }]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(soql("erm2-nwe9", { select: "class" })).resolves.toEqual([{ class: "A", n: "2" }]);
    const firstInit = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((firstInit.headers as Record<string, string>)["X-App-Token"]).toBeUndefined();
    expect(firstInit.signal).toBeInstanceOf(AbortSignal);

    vi.stubEnv("NYC_OPEN_DATA_APP_TOKEN", "test-token");
    await soql("erm2-nwe9", { select: "class" });
    const secondInit = (fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1];
    expect((secondInit.headers as Record<string, string>)["X-App-Token"]).toBe("test-token");
  });

  it("combines a shared signal with its own timeout", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.signal?.aborted) throw init.signal.reason;
      return Response.json([]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const shared = new AbortController();
    await expect(soql("erm2-nwe9", {}, { signal: shared.signal })).resolves.toEqual([]);
    shared.abort(new DOMException("deadline", "TimeoutError"));
    await expect(soql("erm2-nwe9", {}, { signal: shared.signal })).rejects.toThrow("deadline");
  });

  it("throws on an HTTP error or a body that isn't an array", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "bad query" }, { status: 400 })));
    await expect(soql("erm2-nwe9", {})).rejects.toThrow("HTTP 400");

    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: true })));
    await expect(soql("erm2-nwe9", {})).rejects.toThrow("unexpected body");
  });
});
