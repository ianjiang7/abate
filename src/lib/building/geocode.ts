// Address suggestions from NYC Planning's GeoSearch, which only knows NYC addresses (it is built on
// the city's Property Address Directory, PAD).
//
// Checked against the live API on Oct 18, 2026:
//   GET https://geosearch.planninglabs.nyc/v2/autocomplete?text=<partial address>&size=20
// returns a GeoJSON FeatureCollection. For each feature, `properties` has name ("120 BROADWAY"),
// housenumber, street, borough ("Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"),
// postalcode, label ("120 BROADWAY, New York, NY, USA") and addendum.pad.bbl / addendum.pad.bin.
// The same building often comes back several times under alias street names ("120 B'WAY",
// "2400 GD CONCOURSE"), so we merge results that share a building and house number and keep the
// spelling closest to what the tenant typed, preferring the full name over an abbreviation. Both
// endpoints return 10 features unless asked; we ask for 20 so merging still leaves 5 buildings.
//
// Autocomplete misses some real addresses that GET /v2/search (same parameters and response)
// returns first. "16 avenue a" autocompletes only to Brooklyn's "4114 16 AVENUE" and its
// neighbors, never to 16 Avenue A in Manhattan. So when no autocomplete result has the typed house
// number and every typed street word, we also ask /v2/search and put its results first.

import { isBbl, normalizeBin, isZip } from "./opendata";
import type { AddressMatch } from "./types";

export const GEOSEARCH_AUTOCOMPLETE = "https://geosearch.planninglabs.nyc/v2/autocomplete";
export const GEOSEARCH_SEARCH = "https://geosearch.planninglabs.nyc/v2/search";
/** One deadline for both requests, so a suggestion never takes longer than this. */
export const GEOSEARCH_TIMEOUT_MS = 5_000;
export const GEOSEARCH_SIZE = 20;
export const MAX_MATCHES = 5;

const BOROUGHS = new Set(["Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"]);

export type GeoSearchFeature = {
  properties?: {
    name?: string;
    housenumber?: string;
    street?: string;
    borough?: string;
    postalcode?: string;
    label?: string;
    addendum?: { pad?: { bbl?: string; bin?: string } };
  };
};

/**
 * Up to 5 NYC address suggestions for what the tenant has typed so far. Returns [] for fewer than
 * 3 characters, on a timeout, or on any error, so the caller can just show nothing.
 */
export async function searchAddresses(text: string, opts: { limit?: number } = {}): Promise<AddressMatch[]> {
  const query = (text ?? "").replace(/\s+/g, " ").trim();
  if (query.length < 3) return [];
  const limit = Math.min(Math.max(1, Math.trunc(opts.limit ?? MAX_MATCHES)), MAX_MATCHES);

  const signal = AbortSignal.timeout(GEOSEARCH_TIMEOUT_MS);
  const suggested = await fetchFeatures(GEOSEARCH_AUTOCOMPLETE, query, signal);
  if (!suggested) return [];
  let features = suggested;
  if (!hasTypedAddress(suggested, query)) {
    const searched = await fetchFeatures(GEOSEARCH_SEARCH, query, signal);
    if (searched) features = [...searched, ...suggested];
  }
  return toMatches(features, query).slice(0, limit);
}

/** Features from one GeoSearch endpoint, or null on an HTTP error, a timeout or a malformed body. */
async function fetchFeatures(endpoint: string, query: string, signal: AbortSignal): Promise<GeoSearchFeature[] | null> {
  try {
    const params = new URLSearchParams({ text: query, size: String(GEOSEARCH_SIZE) });
    const res = await fetch(`${endpoint}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { features?: unknown };
    return Array.isArray(body.features) ? (body.features as GeoSearchFeature[]) : null;
  } catch {
    return null;
  }
}

/**
 * True when some feature has the typed house number and every typed street word, so autocomplete
 * found the address. Also true when nothing can be checked yet: no house number first, or no
 * street word after it.
 */
export function hasTypedAddress(features: GeoSearchFeature[], query: string): boolean {
  const [house, ...street] = tokens(query);
  if (!house || !/^\d/.test(house) || street.length === 0) return true;
  return features.some((feature) => {
    const p = feature?.properties;
    if (!p?.housenumber || p.housenumber.toLowerCase() !== house) return false;
    return alignWords(street, tokens(p.street ?? p.name ?? "")).matched === street.length;
  });
}

/** Maps GeoSearch features to matches, dropping non-NYC results and merging alias spellings. */
export function toMatches(features: GeoSearchFeature[], query: string): AddressMatch[] {
  const queryTokens = tokens(query);
  const groups = new Map<string, { match: AddressMatch; score: number }>();

  for (const feature of features) {
    const p = feature?.properties;
    if (!p || !p.borough || !BOROUGHS.has(p.borough)) continue;
    const rawName = (p.name ?? [p.housenumber, p.street].filter(Boolean).join(" ")).trim();
    if (!rawName || !p.housenumber) continue; // a street or a neighborhood, not an address

    const bbl = isBbl(p.addendum?.pad?.bbl) ? p.addendum!.pad!.bbl! : null;
    const bin = normalizeBin(p.addendum?.pad?.bin);
    const street = titleCase(rawName);
    const rest = p.label?.includes(",") ? p.label.slice(p.label.indexOf(",")) : `, ${p.borough}, NY, USA`;
    const match: AddressMatch = {
      label: `${street}${rest}`,
      street,
      borough: p.borough,
      zip: isZip(p.postalcode) ? p.postalcode : null,
      bbl,
      bin,
    };

    const key = bin || bbl ? `${bin ?? bbl}|${p.housenumber.toUpperCase()}` : match.label.toUpperCase();
    const score = spellingScore(queryTokens, rawName);
    const existing = groups.get(key);
    if (!existing) groups.set(key, { match, score });
    else if (score > existing.score) groups.set(key, { match, score }); // Map keeps first-seen order
  }

  return [...groups.values()].map((g) => g.match);
}

/** Lowercase words, without apostrophes ("B'WAY" -> "bway"). */
function tokens(value: string): string[] {
  return value.toLowerCase().replace(/['’]/g, "").split(/[\s,]+/).filter(Boolean);
}

/**
 * Pairs each typed word with a different word of the candidate: an identical word if there is
 * one, otherwise the first unused word it starts ("gra" for "grand") or abbreviates ("bway" for
 * "broadway"). Returns how many typed words were paired and how many candidate words were left.
 * One word per typed word, so "a" in "16 avenue a" can't reuse "avenue" in "16 AVENUE B".
 */
export function alignWords(typed: string[], words: string[]): { matched: number; extra: number } {
  const used = new Set<number>();
  let matched = 0;
  for (const t of typed) {
    let i = words.findIndex((w, j) => !used.has(j) && w === t);
    if (i < 0) i = words.findIndex((w, j) => !used.has(j) && (w.startsWith(t) || abbreviates(t, w)));
    if (i < 0) continue;
    used.add(i);
    matched++;
  }
  return { matched, extra: words.length - used.size };
}

/** "bway" abbreviates "broadway" and "gd" "grand": same first letter, then its letters in order. */
function abbreviates(short: string, word: string): boolean {
  if (short.length < 2 || !/^[a-z]+$/.test(short) || short[0] !== word[0]) return false;
  let i = 0;
  for (const c of word) if (c === short[i]) i++;
  return i === short.length;
}

/**
 * Ranks alias spellings of one address against what was typed: first by how many typed words it
 * matches, then by fewer extra words ("THE GRAND CONCOURSE" loses to "GRAND CONCOURSE", and
 * "BWAY EAST" to "BROADWAY"), then by the longer, unabbreviated spelling ("BROADWAY" over "B'WAY").
 */
function spellingScore(typed: string[], candidate: string): number {
  const { matched, extra } = alignWords(typed, tokens(candidate));
  return matched * 1_000_000 - extra * 1_000 + Math.min(candidate.length, 999);
}

/**
 * "350 EAST 14 STREET" -> "350 East 14 Street". Words starting with a digit (house numbers like
 * "101A" or "30-50") are left alone, except ordinals ("1ST" -> "1st").
 */
export function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (/^\d+(ST|ND|RD|TH)$/i.test(word)) return word.toLowerCase();
      if (!/^[A-Za-z]/.test(word)) return word;
      return word.toLowerCase().replace(/(^|-)([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase());
    })
    .join(" ");
}
