import "server-only";
import { db, hasDatabase } from "@/lib/db/client";
import { isBbl, normalizeBin } from "./opendata";
import { fetchBuildingSummaryResult } from "./summary";
import type { BuildingSummary } from "./types";

export { searchAddresses } from "./geocode";
export { isBbl, normalizeBin } from "./opendata";
export type { AddressMatch, BuildingSummary } from "./types";

export const CACHE_TABLE = "building_cache";
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Building data for a tax lot, from the Supabase cache when it is under 24 hours old, otherwise
 * live from NYC Open Data. Returns null for an invalid BBL or when nothing could be loaded.
 *
 * The cache never breaks a lookup: with no database, or when a cache read or write fails, we just
 * use live data. Only complete summaries are cached, so a query that failed once isn't remembered
 * as zeros for a day. If the live fetch fails in part or entirely, an older cached copy wins.
 */
export async function getBuildingSummary(bbl: string, bin: string | null = null): Promise<BuildingSummary | null> {
  if (!isBbl(bbl)) return null;
  const wantBin = normalizeBin(bin);

  const cached = await readCache(bbl);
  // A lot can hold several buildings; a copy cached for a different BIN may name another agent.
  const usable = cached && (!wantBin || cached.summary.bin === wantBin) ? cached : null;
  if (usable && Date.now() - usable.fetchedAt < CACHE_TTL_MS) return usable.summary;

  const live = await fetchBuildingSummaryResult(bbl, wantBin);
  if (live?.complete) {
    await writeCache(live.summary);
    return live.summary;
  }
  // Partial or failed: an older complete copy beats showing zeros for the parts that failed.
  return usable?.summary ?? live?.summary ?? null;
}

async function readCache(bbl: string): Promise<{ summary: BuildingSummary; fetchedAt: number } | null> {
  if (!hasDatabase()) return null;
  try {
    const { data, error } = await db()
      .from(CACHE_TABLE)
      .select("data, fetched_at")
      .eq("bbl", bbl)
      .maybeSingle();
    if (error || !data) return null;
    const fetchedAt = Date.parse(String(data.fetched_at));
    if (Number.isNaN(fetchedAt) || !isBuildingSummary(data.data) || data.data.bbl !== bbl) return null;
    return { summary: data.data, fetchedAt };
  } catch {
    return null;
  }
}

async function writeCache(summary: BuildingSummary): Promise<void> {
  if (!hasDatabase()) return;
  try {
    const { error } = await db()
      .from(CACHE_TABLE)
      .upsert({ bbl: summary.bbl, data: summary, fetched_at: summary.fetchedAt }, { onConflict: "bbl" });
    if (error) console.warn("[building] cache write failed");
  } catch {
    console.warn("[building] cache write failed");
  }
}

/** Light shape check for cached JSON, so an old or hand-edited row is refetched instead of crashing a page. */
export function isBuildingSummary(value: unknown): value is BuildingSummary {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const ov = v.openViolations as Record<string, unknown> | undefined;
  const cs = v.complaintsThisSeason as Record<string, unknown> | undefined;
  return (
    typeof v.bbl === "string" &&
    (v.bin === null || typeof v.bin === "string") &&
    !!ov &&
    ["total", "classA", "classB", "classC"].every((k) => typeof ov[k] === "number") &&
    !!cs &&
    typeof cs.heat === "number" &&
    typeof cs.other === "number" &&
    typeof cs.since === "string" &&
    (v.managingAgent === null || typeof v.managingAgent === "object") &&
    (v.owner === null || typeof v.owner === "string") &&
    (v.medianDaysToClose === null || typeof v.medianDaysToClose === "number") &&
    typeof v.fetchedAt === "string"
  );
}
