// Date helpers. Calendar dates are ISO strings (YYYY-MM-DD) in New York time, because "today"
// for a tenant is New York's today, not the server's (Vercel runs in UTC).

const NY = "America/New_York";

export type IsoDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** The New York calendar date for an instant (defaults to now). */
export function nyDate(instant: Date | string = new Date()): IsoDate {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: NY,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts; // en-CA formats as YYYY-MM-DD
}

function toUtcMidnight(date: IsoDate): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMidnight(to) - toUtcMidnight(from)) / 86_400_000);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(toUtcMidnight(date) + days * 86_400_000).toISOString().slice(0, 10);
}

export function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b;
}

/** "Oct 18", or "Oct 18, 2025" when the year differs from `today`'s. */
export function formatShortDate(date: IsoDate, today: IsoDate = nyDate()): string {
  const d = new Date(`${date}T12:00:00Z`);
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return d.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** "Wednesday, October 21" for deadlines written into messages. */
export function formatLongDate(date: IsoDate): string {
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/** "October 21, 2026" for facts written into messages. */
export function formatFullDate(date: IsoDate): string {
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
