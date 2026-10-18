import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HEAT_DEFAULTS,
  fetchHeatBuildings,
  formatHeatTable,
  heatSince,
  heatWhere,
  normalizeBorough,
  parseHeatArgs,
} from "./heat";

afterEach(() => vi.unstubAllGlobals());

describe("parseHeatArgs", () => {
  it("defaults to the last 7 days, citywide, top 40", () => {
    expect(parseHeatArgs([])).toEqual({ days: 7, borough: null, zips: [], limit: 40 });
  });

  it("reads --days, --borough, --zip and --limit, with or without =", () => {
    expect(parseHeatArgs(["--days", "14", "--borough", "Staten  Island", "--zip=10003,10009, 10003", "--limit=10"])).toEqual({
      days: 14,
      borough: "STATEN ISLAND",
      zips: ["10003", "10009"],
      limit: 10,
    });
    expect(parseHeatArgs(["--borough=bx"]).borough).toBe("BRONX");
  });

  it("rejects bad values with a readable message", () => {
    expect(() => parseHeatArgs(["--days", "0"])).toThrow("--days");
    expect(() => parseHeatArgs(["--days"])).toThrow("needs a value");
    expect(() => parseHeatArgs(["--borough", "Jersey City"])).toThrow("Unknown borough");
    expect(() => parseHeatArgs(["--zip", "1000'; --"])).toThrow("ZIP");
    expect(() => parseHeatArgs(["--zip", "--days"])).toThrow("needs a value");
    expect(() => parseHeatArgs(["--verbose"])).toThrow("Unknown option");
  });

  it("does not share the defaults' zip list between calls", () => {
    parseHeatArgs(["--zip", "10003"]);
    expect(HEAT_DEFAULTS.zips).toEqual([]);
  });
});

describe("heat query", () => {
  it("normalizes borough names to how 311 stores them", () => {
    expect(normalizeBorough("brooklyn")).toBe("BROOKLYN");
    expect(normalizeBorough(" The Bronx ")).toBe("BRONX");
    expect(normalizeBorough("Hoboken")).toBeNull();
  });

  it("covers exactly N calendar days ending with New York's today", () => {
    // 11pm Oct 18 in New York is Oct 19 in UTC. 7 days is Oct 12 through Oct 18.
    expect(heatSince(7, new Date("2026-10-19T03:00:00Z"))).toBe("2026-10-12");
    expect(heatSince(1, new Date("2026-10-19T03:00:00Z"))).toBe("2026-10-18");
    expect(heatSince(14, new Date("2026-10-18T16:00:00Z"))).toBe("2026-10-05");
  });

  it("builds the $where clause from validated options", () => {
    expect(heatWhere({ days: 7, borough: null, zips: [], limit: 40 }, "2026-10-11")).toBe(
      "complaint_type='HEAT/HOT WATER' AND created_date >= '2026-10-11T00:00:00' AND bbl IS NOT NULL",
    );
    expect(heatWhere({ days: 7, borough: "STATEN ISLAND", zips: ["10003", "10009"], limit: 40 }, "2026-10-11")).toBe(
      "complaint_type='HEAT/HOT WATER' AND created_date >= '2026-10-11T00:00:00' AND bbl IS NOT NULL" +
        " AND borough='STATEN ISLAND' AND incident_zip in ('10003', '10009')",
    );
  });

  it("aggregates on the server and maps rows", async () => {
    const fetchMock = vi.fn<(input: string) => Promise<Response>>(async () =>
      // Synthetic rows shaped like the live 311 aggregate: made-up addresses.
      Response.json([
        { bbl: "2012340056", addr: "250 EXAMPLE  CONCOURSE", boro: "BRONX", zip_code: "10400", n: "26" },
        { bbl: "1005550012", addr: "12 SAMPLE    STREET", boro: "MANHATTAN", zip_code: "10099", n: "9" },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const rows = await fetchHeatBuildings({ days: 7, borough: null, zips: [], limit: 40 }, new Date("2026-10-18T16:00:00Z"));
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/resource/erm2-nwe9.json");
    expect(url.searchParams.get("$group")).toBe("bbl");
    expect(url.searchParams.get("$order")).toBe("n DESC, bbl");
    expect(url.searchParams.get("$limit")).toBe("40");
    expect(url.searchParams.get("$where")).toContain("created_date >= '2026-10-12T00:00:00'");
    // No alias may shadow a column used in $where.
    expect(url.searchParams.get("$select")).not.toMatch(/as (borough|incident_zip|bbl|created_date)\b/);

    expect(rows).toEqual([
      { count: 26, address: "250 EXAMPLE CONCOURSE", borough: "BRONX", zip: "10400", bbl: "2012340056" },
      { count: 9, address: "12 SAMPLE STREET", borough: "MANHATTAN", zip: "10099", bbl: "1005550012" },
    ]);
  });

  it("prints a plain aligned table", () => {
    const table = formatHeatTable([
      { count: 26, address: "250 EXAMPLE CONCOURSE", borough: "BRONX", zip: "10400", bbl: "2012340056" },
      { count: 9, address: "12 SAMPLE STREET", borough: "MANHATTAN", zip: "10099", bbl: "1005550012" },
    ]);
    expect(table.split("\n")).toEqual([
      "count  address                borough    zip    bbl",
      "-----  ---------------------  ---------  -----  ----------",
      "   26  250 EXAMPLE CONCOURSE  BRONX      10400  2012340056",
      "    9  12 SAMPLE STREET       MANHATTAN  10099  1005550012",
    ]);
  });
});
