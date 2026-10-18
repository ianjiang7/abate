// Address suggestions from NYC Planning's GeoSearch, which only knows NYC addresses (it is built on
// the city's Property Address Directory, PAD).
//
// Checked against the live API on Oct 18, 2026:
//   GET https://geosearch.planninglabs.nyc/v2/autocomplete?text=<partial address>
// returns a GeoJSON FeatureCollection. For each feature, `properties` has name ("120 BROADWAY"),
// housenumber, street, borough ("Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"),
// postalcode, label ("120 BROADWAY, New York, NY, USA") and addendum.pad.bbl / addendum.pad.bin.
// The same building often comes back several times under alias street names ("120 B'WAY",
// "2400 GD CONCOURSE"), so we merge results that share a building and house number and keep the
// spelling closest to what the tenant typed.

import { isBbl, normalizeBin, isZip } from "./opendata";
import type { AddressMatch } from "./types";

export const GEOSEARCH_AUTOCOMPLETE = "https://geosearch.planninglabs.nyc/v2/autocomplete";
export const GEOSEARCH_TIMEOUT_MS = 5_000;
export const MAX_MATCHES = 5;

const BOROUGHS = new Set(["Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"]);

type GeoSearchFeature = {
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

  try {
    const url = `${GEOSEARCH_AUTOCOMPLETE}?${new URLSearchParams({ text: query }).toString()}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(GEOSEARCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { features?: unknown };
    if (!Array.isArray(body.features)) return [];
    return toMatches(body.features as GeoSearchFeature[], query).slice(0, limit);
  } catch {
    return [];
  }
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

function tokens(value: string): string[] {
  return value.toLowerCase().split(/[\s,]+/).filter(Boolean);
}

/**
 * Ranks alias spellings of one address against what was typed: first by how many typed words
 * start a word of the candidate ("gra" counts for "GRAND"), then by fewer extra words ("THE GRAND
 * CONCOURSE" loses to "GRAND CONCOURSE"), then by the longer, unabbreviated spelling.
 */
function spellingScore(typed: string[], candidate: string): number {
  const words = tokens(candidate);
  const matched = typed.filter((t) => words.some((w) => w.startsWith(t))).length;
  const extra = words.filter((w) => !typed.some((t) => w.startsWith(t))).length;
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
