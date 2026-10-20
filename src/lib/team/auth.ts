import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * The team page lives at /team/<TEAM_KEY>: a long secret in the URL, like a case link, so the
 * pilot needs no accounts. Returns false when TEAM_KEY is unset or too short to be safe.
 */
export function isTeamKey(key: unknown): key is string {
  const expected = process.env.TEAM_KEY ?? "";
  if (expected.length < 24 || typeof key !== "string" || key.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(key), Buffer.from(expected));
}
