// Small, typed helpers for NYC Open Data (Socrata). No secrets: an app token is optional and only
// raises the rate limit.
//
// What we use, checked against the live API on Oct 18, 2026 with curl:
//
// - Base URL: https://data.cityofnewyork.us/resource/<id>.json with SoQL parameters $select,
//   $where, $group, $order, $limit. Counts come back as strings ("14"). Optional header
//   X-App-Token (env NYC_OPEN_DATA_APP_TOKEN). count(distinct x) and
//   count(distinct case(cond, x)) both work.
// - HPD Housing Maintenance Code Violations, wvxf-dwi5. Fields: bbl (text, 10 digits), bin (text),
//   boroid/block/lot, class ("A", "B", "C", and "I" for info-only orders), violationstatus
//   ("Open" or "Close"). We count open violations by class with
//   $where=bbl='<bbl>' AND bin='<bin>' AND violationstatus='Open' and $group=class. About 0.1% of
//   open violations have no bin.
// - HPD Housing Maintenance Code Complaints and Problems, ygpa-z7cr. This is the current HPD
//   complaints dataset (updated daily; it had same-day rows on Oct 18). One row per problem, so a
//   complaint (complaint_id) can have several rows. Fields: bbl (number), bin (number),
//   received_date (floating New York timestamp), major_category ("HEAT/HOT WATER", "PLUMBING",
//   "WATER LEAK", ...), complaint_status ("OPEN" or "CLOSE"), complaint_status_date (the close date
//   once closed).
// - 311 Service Requests, erm2-nwe9. Fields: complaint_type ("HEAT/HOT WATER"), created_date,
//   closed_date, bbl (text), incident_address (may contain runs of spaces), incident_zip, borough
//   ("MANHATTAN", "BRONX", "BROOKLYN", "QUEENS", "STATEN ISLAND"). Runs a day or two behind HPD.
//   311 HEAT/HOT WATER calls are routed to HPD and show up in ygpa-z7cr too (Oct 11 to 16: 2,022
//   in 311 vs 2,139 HPD heat complaints), so we never add the two together.
// - HPD Multiple Dwelling Registrations, tesw-yqqr. No bbl field: filter by boroid, block, lot
//   (numbers). Fields: registrationid, bin (number), lastregistrationdate. A lot can have hundreds
//   of registrations (Parkchester's lot 2-3944-7501 has 55), so we filter by the building's BIN.
// - HPD Registration Contacts, feu5-w2e2. Filter by registrationid. Fields: type (Agent,
//   CorporateOwner, IndividualOwner, JointOwner, HeadOfficer, Officer, SiteManager, Shareholder,
//   Lessee), corporationname, firstname, lastname. Agents have either a person's name or a
//   corporation name, sometimes both.

import { isIsoDate, type IsoDate } from "@/lib/domain/dates";

export const OPEN_DATA_BASE = "https://data.cityofnewyork.us/resource";

export const DATASETS = {
  serviceRequests311: "erm2-nwe9",
} as const;

export type DatasetId = (typeof DATASETS)[keyof typeof DATASETS];

export const OPEN_DATA_TIMEOUT_MS = 8_000;

export type SoqlQuery = {
  select?: string;
  where?: string;
  group?: string;
  having?: string;
  order?: string;
  limit?: number;
};

/** Socrata returns every value as a string (or leaves the key out when it is null). */
export type SoqlRow = Record<string, string | undefined>;

/** The request URL for a SoQL query. Values inside `where` must already be validated or escaped. */
export function soqlUrl(dataset: DatasetId, query: SoqlQuery): string {
  const params = new URLSearchParams();
  if (query.select) params.set("$select", query.select);
  if (query.where) params.set("$where", query.where);
  if (query.group) params.set("$group", query.group);
  if (query.having) params.set("$having", query.having);
  if (query.order) params.set("$order", query.order);
  if (query.limit !== undefined) params.set("$limit", String(Math.max(1, Math.trunc(query.limit))));
  return `${OPEN_DATA_BASE}/${dataset}.json?${params.toString()}`;
}

/**
 * Runs a SoQL query and returns its rows. Throws on a network error, a timeout, a non-2xx response
 * or a body that isn't a JSON array, so callers can treat each query as one settled promise.
 */
export async function soql<T extends SoqlRow = SoqlRow>(
  dataset: DatasetId,
  query: SoqlQuery,
  /** `signal` lets several queries share one deadline; the per-query timeout still applies. */
  opts: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<T[]> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = process.env.NYC_OPEN_DATA_APP_TOKEN;
  if (token) headers["X-App-Token"] = token;

  const timeout = AbortSignal.timeout(opts.timeoutMs ?? OPEN_DATA_TIMEOUT_MS);
  const res = await fetch(soqlUrl(dataset, query), {
    headers,
    signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`NYC Open Data ${dataset} returned HTTP ${res.status}`);
  const body: unknown = await res.json();
  if (!Array.isArray(body)) throw new Error(`NYC Open Data ${dataset} returned an unexpected body`);
  return body as T[];
}

// ---------------------------------------------------------------------------------------------
// Validation and escaping. Anything that goes into a $where clause passes through one of these.

const BBL = /^[1-5]\d{9}$/;
const BIN = /^[1-5]\d{6}$/;
const ZIP = /^\d{5}$/;

/** A 10-digit borough-block-lot with a borough code from 1 (Manhattan) to 5 (Staten Island). */
export function isBbl(value: unknown): value is string {
  return typeof value === "string" && BBL.test(value);
}

/**
 * A usable building identification number, or null. NYC uses 1000000, 2000000, ... 5000000 as
 * placeholders for buildings without a BIN, so those count as missing.
 */
export function normalizeBin(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const bin = String(value).trim();
  if (!BIN.test(bin) || bin.slice(1) === "000000") return null;
  return bin;
}

export function isZip(value: unknown): value is string {
  return typeof value === "string" && ZIP.test(value);
}

/** Splits a validated BBL into the numeric parts HPD registrations are keyed on. */
export function splitBbl(bbl: string): { boroid: number; block: number; lot: number } {
  if (!isBbl(bbl)) throw new Error("Invalid BBL");
  return {
    boroid: Number(bbl.slice(0, 1)),
    block: Number(bbl.slice(1, 6)),
    lot: Number(bbl.slice(6, 10)),
  };
}

/** A SoQL string literal, with single quotes doubled. */
export function soqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Start of a New York calendar day as a SoQL floating timestamp literal. */
export function soqlDayStart(date: IsoDate): string {
  if (!isIsoDate(date)) throw new Error("Invalid date");
  return soqlString(`${date}T00:00:00`);
}

/** A non-negative whole count from a Socrata string value. */
export function toCount(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/** Collapses runs of whitespace, e.g. "388 EAST    8 STREET" from 311. */
export function squish(value: string | undefined | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
