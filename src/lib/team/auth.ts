import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

const digest = (s: string) => createHash("sha256").update(s).digest();

/**
 * The team page lives at /team/<TEAM_KEY>: a long secret in the URL, like a case link, so the
 * pilot needs no accounts. Compares fixed-length hashes, so no guess can throw or reveal the key's
 * length. Returns false when TEAM_KEY is unset or too short to be safe.
 */
export function isTeamKey(key: unknown): key is string {
  const expected = process.env.TEAM_KEY ?? "";
  if (expected.length < 24 || typeof key !== "string" || key.length > 200) return false;
  return timingSafeEqual(digest(key), digest(expected));
}

/** The team Gmail address that "Open in Gmail" should send from. */
export function teamInbox(): string | null {
  const raw = (process.env.TEAM_GMAIL ?? process.env.CC_EMAIL ?? "").trim();
  return raw.includes("@") ? raw : null;
}
