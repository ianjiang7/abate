// Builds a BuildingSummary for one tax lot (BBL) from NYC Open Data. See opendata.ts for the
// datasets and fields, verified live.
//
// Scope: violations and complaints are counted for the whole tax lot (BBL), which is one building
// for almost every rental building run by a large management company. The BIN is used only to pick
// the right HPD registration when a lot has several buildings.
//
// Complaints come from ONE source, HPD's complaints dataset (ygpa-z7cr), for both heat and other
// conditions. 311 HEAT/HOT WATER calls are routed to HPD and appear there too, so adding 311 would
// double count. HPD's dataset is also fresher than 311's and has the close dates we need for
// medianDaysToClose.

import { addDays, nyDate, type IsoDate } from "@/lib/domain/dates";
import {
  DATASETS,
  isBbl,
  normalizeBin,
  soql,
  soqlDayStart,
  splitBbl,
  squish,
  toCount,
  type SoqlRow,
} from "./opendata";
import type { BuildingSummary } from "./types";

const HEAT_CATEGORY = "HEAT/HOT WATER";
/** Rows fetched to compute the median days to close. Newest first, so a busy building's median covers its most recent complaints. */
export const MEDIAN_ROW_CAP = 1000;

/**
 * October 1 of the heat season that `today` falls in (New York's heat season runs Oct 1 to May 31).
 * October to December belong to the season that started this year; January to September to the
 * one that started last year, so summer counts still cover the whole last season.
 */
export function heatSeasonStart(today: IsoDate): IsoDate {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return `${month >= 10 ? year : year - 1}-10-01`;
}

export type SummaryResult = {
  summary: BuildingSummary;
  /** False when one or more queries failed and their parts were filled with zeros or nulls. */
  complete: boolean;
};

/**
 * Fetches a building summary live. Queries run in parallel and each may fail on its own; missing
 * parts become zeros or nulls. Returns null for an invalid BBL or when every query failed.
 */
export async function fetchBuildingSummary(
  bbl: string,
  bin: string | null,
  opts: { now?: Date } = {},
): Promise<BuildingSummary | null> {
  return (await fetchBuildingSummaryResult(bbl, bin, opts))?.summary ?? null;
}

/** Like fetchBuildingSummary, but also says whether every part loaded, so callers can avoid caching gaps. */
export async function fetchBuildingSummaryResult(
  bbl: string,
  bin: string | null,
  opts: { now?: Date } = {},
): Promise<SummaryResult | null> {
  if (!isBbl(bbl)) return null;
  const buildingBin = normalizeBin(bin);
  const now = opts.now ?? new Date();
  const today = nyDate(now);
  const since = heatSeasonStart(today);

  const [violations, complaints, closed, contacts] = await Promise.allSettled([
    fetchOpenViolations(bbl),
    fetchComplaintCounts(bbl, since),
    fetchMedianDaysToClose(bbl, addDays(today, -730)),
    fetchRegistrationContacts(bbl, buildingBin),
  ]);

  const parts = [violations, complaints, closed, contacts];
  if (parts.every((p) => p.status === "rejected")) return null;

  const people = contacts.status === "fulfilled" ? contacts.value : null;
  const summary: BuildingSummary = {
    bbl,
    bin: buildingBin,
    openViolations:
      violations.status === "fulfilled" ? violations.value : { total: 0, classA: 0, classB: 0, classC: 0 },
    complaintsThisSeason: {
      ...(complaints.status === "fulfilled" ? complaints.value : { heat: 0, other: 0 }),
      since,
    },
    managingAgent: people?.managingAgent ?? null,
    owner: people?.owner ?? null,
    medianDaysToClose: closed.status === "fulfilled" ? closed.value : null,
    fetchedAt: now.toISOString(),
  };
  return { summary, complete: parts.every((p) => p.status === "fulfilled") };
}

// ---------------------------------------------------------------------------------------------
// One function per query. Each throws if its request fails.

/**
 * Open HPD violations by hazard class. `total` is A + B + C, so the breakdown adds up; info-only
 * class I orders (such as an order to register) are left out.
 */
export async function fetchOpenViolations(bbl: string): Promise<BuildingSummary["openViolations"]> {
  const rows = await soql<SoqlRow & { class?: string; n?: string }>(DATASETS.hpdViolations, {
    select: "class, count(*) as n",
    where: `bbl='${digits(bbl)}' AND violationstatus='Open'`,
    group: "class",
  });
  const byClass = (c: string) => toCount(rows.find((r) => r.class === c)?.n);
  const classA = byClass("A");
  const classB = byClass("B");
  const classC = byClass("C");
  return { total: classA + classB + classC, classA, classB, classC };
}

/**
 * Distinct HPD complaints received since `since`. A complaint with any heat or hot water problem
 * counts as heat; every other complaint counts as other, so no complaint is counted twice.
 */
export async function fetchComplaintCounts(bbl: string, since: IsoDate): Promise<{ heat: number; other: number }> {
  const rows = await soql<SoqlRow & { total?: string; heat?: string }>(DATASETS.hpdComplaints, {
    select: `count(distinct complaint_id) as total, count(distinct case(major_category='${HEAT_CATEGORY}', complaint_id)) as heat`,
    where: `bbl=${digits(bbl)} AND received_date >= ${soqlDayStart(since)}`,
  });
  const total = toCount(rows[0]?.total);
  const heat = Math.min(toCount(rows[0]?.heat), total);
  return { heat, other: total - heat };
}

/** Median calendar days from received to closed, over closed HPD complaints received since `since`. */
export async function fetchMedianDaysToClose(bbl: string, since: IsoDate): Promise<number | null> {
  const rows = await soql<SoqlRow & { received_date?: string; complaint_status_date?: string }>(
    DATASETS.hpdComplaints,
    {
      // Grouping by the complaint-level fields gives one row per complaint instead of per problem.
      select: "complaint_id, received_date, complaint_status_date",
      where: `bbl=${digits(bbl)} AND complaint_status='CLOSE' AND received_date >= ${soqlDayStart(since)}`,
      group: "complaint_id, received_date, complaint_status_date",
      order: "received_date DESC",
      limit: MEDIAN_ROW_CAP,
    },
  );
  const days = rows
    .map((r) => daysOpen(r.received_date, r.complaint_status_date))
    .filter((d): d is number => d !== null);
  return median(days);
}

type Contact = { type?: string; corporationname?: string; firstname?: string; lastname?: string };

/** Managing agent and owner from the building's latest HPD registration. Null parts when not listed. */
export async function fetchRegistrationContacts(
  bbl: string,
  bin: string | null,
): Promise<{ managingAgent: BuildingSummary["managingAgent"]; owner: string | null }> {
  const { boroid, block, lot } = splitBbl(bbl);
  const registrations = await soql<SoqlRow & { registrationid?: string; bin?: string }>(DATASETS.hpdRegistrations, {
    select: "registrationid, bin, lastregistrationdate",
    where: `boroid=${boroid} AND block=${block} AND lot=${lot}`,
    order: "lastregistrationdate DESC",
    limit: 50,
  });
  const registration =
    (bin ? registrations.find((r) => normalizeBin(r.bin) === bin) : undefined) ?? registrations[0];
  const registrationId = registration?.registrationid;
  if (!registrationId || !/^\d+$/.test(registrationId)) return { managingAgent: null, owner: null };

  const contacts = await soql<SoqlRow & Contact>(DATASETS.hpdRegistrationContacts, {
    select: "type, corporationname, firstname, lastname",
    where: `registrationid=${registrationId}`,
    limit: 100,
  });
  return { managingAgent: pickAgent(contacts), owner: pickOwner(contacts) };
}

// ---------------------------------------------------------------------------------------------
// Pure helpers, exported for tests.

export function pickAgent(contacts: Contact[]): BuildingSummary["managingAgent"] {
  for (const c of contacts) {
    if (c.type !== "Agent") continue;
    const name = personName(c);
    const company = squish(c.corporationname) || null;
    if (name || company) return { name, company };
  }
  return null;
}

export function pickOwner(contacts: Contact[]): string | null {
  const corporate = contacts.find((c) => c.type === "CorporateOwner" && squish(c.corporationname));
  if (corporate) return squish(corporate.corporationname);
  for (const c of contacts) {
    if (c.type !== "IndividualOwner") continue;
    const name = personName(c);
    if (name) return name;
  }
  return null;
}

function personName(c: Contact): string | null {
  return squish([c.firstname, c.lastname].filter(Boolean).join(" ")) || null;
}

/** Calendar days between two floating New York timestamps ("2026-08-04T08:27:11.000"). */
export function daysOpen(received: string | undefined, closed: string | undefined): number | null {
  const from = Date.parse(`${received?.slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${closed?.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

/** Median rounded to a whole day, or null for no values. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(value);
}

function digits(value: string): string {
  if (!/^\d+$/.test(value)) throw new Error("Expected digits");
  return value;
}
