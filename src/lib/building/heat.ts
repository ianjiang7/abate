// Buildings with the most 311 heat and hot water complaints, for the team to pick buildings to
// flyer. Used by scripts/heat-buildings.ts. The counting happens in SoQL on the city's side; we
// only download the top rows.

import { addDays, isIsoDate, nyDate, type IsoDate } from "@/lib/domain/dates";
import { DATASETS, isZip, soql, soqlDayStart, soqlString, squish, toCount, type SoqlRow } from "./opendata";

/** Borough names as 311 stores them, keyed by what a teammate might type. */
const BOROUGH_ALIASES: Record<string, string> = {
  manhattan: "MANHATTAN",
  mn: "MANHATTAN",
  bronx: "BRONX",
  bx: "BRONX",
  "the bronx": "BRONX",
  brooklyn: "BROOKLYN",
  bk: "BROOKLYN",
  queens: "QUEENS",
  qn: "QUEENS",
  "staten island": "STATEN ISLAND",
  si: "STATEN ISLAND",
};

export type HeatOptions = { days: number; borough: string | null; zips: string[]; limit: number };

export type HeatBuilding = { count: number; address: string; borough: string; zip: string; bbl: string };

export const HEAT_DEFAULTS: HeatOptions = { days: 7, borough: null, zips: [], limit: 40 };

/** "Staten Island" -> "STATEN ISLAND", or null if it isn't a borough. */
export function normalizeBorough(value: string): string | null {
  return BOROUGH_ALIASES[value.trim().toLowerCase().replace(/\s+/g, " ")] ?? null;
}

/** Parses `--days N --borough NAME --zip 10003,10009 --limit N`. Throws with a readable message on bad input. */
export function parseHeatArgs(argv: string[]): HeatOptions {
  const opts: HeatOptions = { ...HEAT_DEFAULTS, zips: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [flag, inline] = arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
    const value = () => {
      const v = inline ?? argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${flag} needs a value`);
      return v;
    };
    switch (flag) {
      case "--days": {
        const days = Number(value());
        if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error("--days must be a whole number from 1 to 365");
        opts.days = days;
        break;
      }
      case "--borough": {
        const raw = value();
        const borough = normalizeBorough(raw);
        if (!borough) throw new Error(`Unknown borough "${raw}". Use Manhattan, Bronx, Brooklyn, Queens or Staten Island.`);
        opts.borough = borough;
        break;
      }
      case "--zip": {
        const zips = value().split(",").map((z) => z.trim()).filter(Boolean);
        const bad = zips.find((z) => !isZip(z));
        if (bad || zips.length === 0) throw new Error(`--zip takes 5-digit ZIP codes separated by commas`);
        opts.zips = [...new Set(zips)];
        break;
      }
      case "--limit": {
        const limit = Number(value());
        if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("--limit must be a whole number from 1 to 1000");
        opts.limit = limit;
        break;
      }
      default:
        throw new Error(`Unknown option ${arg}. Options: --days N, --borough NAME, --zip 10003,10009, --limit N`);
    }
  }
  return opts;
}

/** The $where clause: heat complaints created on or after `since`, with a known BBL, in the chosen area. */
export function heatWhere(opts: HeatOptions, since: IsoDate): string {
  if (!isIsoDate(since)) throw new Error("Invalid date");
  const clauses = [
    "complaint_type='HEAT/HOT WATER'",
    `created_date >= ${soqlDayStart(since)}`,
    "bbl IS NOT NULL",
  ];
  if (opts.borough) clauses.push(`borough=${soqlString(opts.borough)}`);
  if (opts.zips.length) clauses.push(`incident_zip in (${opts.zips.filter(isZip).map(soqlString).join(", ")})`);
  return clauses.join(" AND ");
}

/** First day counted: `days` days before New York's today. */
export function heatSince(days: number, now: Date = new Date()): IsoDate {
  return addDays(nyDate(now), -days);
}

export async function fetchHeatBuildings(opts: HeatOptions, now: Date = new Date()): Promise<HeatBuilding[]> {
  const rows = await soql<SoqlRow & { bbl?: string; addr?: string; boro?: string; zip_code?: string; n?: string }>(
    DATASETS.serviceRequests311,
    {
      // Group by BBL only: corner buildings get complaints under more than one address. Aliases
      // must not reuse column names, or SoQL reads the alias in $where ("borough" broke it).
      select: "bbl, max(incident_address) as addr, max(borough) as boro, max(incident_zip) as zip_code, count(*) as n",
      where: heatWhere(opts, heatSince(opts.days, now)),
      group: "bbl",
      order: "n DESC, bbl",
      limit: opts.limit,
    },
    { timeoutMs: 30_000 },
  );
  return rows.map((r) => ({
    count: toCount(r.n),
    address: squish(r.addr),
    borough: squish(r.boro),
    zip: squish(r.zip_code),
    bbl: squish(r.bbl),
  }));
}

/** A plain fixed-width table for the terminal. */
export function formatHeatTable(rows: HeatBuilding[]): string {
  const header = ["count", "address", "borough", "zip", "bbl"];
  const cells = rows.map((r) => [String(r.count), r.address, r.borough, r.zip, r.bbl]);
  const widths = header.map((h, i) => Math.max(h.length, ...cells.map((c) => c[i].length)));
  const line = (c: string[]) =>
    c.map((v, i) => (i === 0 ? v.padStart(widths[i]) : v.padEnd(widths[i]))).join("  ").trimEnd();
  return [line(header), line(widths.map((w) => "-".repeat(w))), ...cells.map(line)].join("\n");
}
