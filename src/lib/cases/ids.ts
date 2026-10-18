import { randomBytes, randomInt } from "node:crypto";

/** The secret in a private case link: 32 URL-safe characters (192 bits). */
export function newCaseToken(): string {
  return randomBytes(24).toString("base64url");
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L

/** A short, readable case code for the CC plus-address and neighbor invites, e.g. "K7QM4X". */
export function newCaseCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function isCaseToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{32}$/.test(value);
}

export function isCaseCode(value: unknown): value is string {
  return typeof value === "string" && new RegExp(`^[${CODE_ALPHABET}]{6}$`).test(value);
}
