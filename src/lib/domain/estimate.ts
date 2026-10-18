import { daysBetween, type IsoDate } from "./dates";
import { getIssueType, type IssueTypeId } from "./issues";

export type EstimateInput = {
  monthlyRent: number;
  issueType: IssueTypeId;
  /** When management was first told. The clock starts here, not when the problem started. */
  noticeOn: IsoDate;
  /** The fix date, or today if it's still unfixed. */
  endOn: IsoDate;
};

export type Estimate = {
  days: number;
  dailyRent: number;
  low: number;
  high: number;
  /** How much the range grows per extra day while unfixed. */
  perDayLow: number;
  perDayHigh: number;
};

const roundTo10 = (n: number) => Math.round(n / 10) * 10;

export function estimateAbatement({ monthlyRent, issueType, noticeOn, endOn }: EstimateInput): Estimate {
  const rent = Number.isFinite(monthlyRent) && monthlyRent > 0 ? monthlyRent : 0;
  const days = Math.max(0, daysBetween(noticeOn, endOn));
  const dailyRent = (rent * 12) / 365;
  const { low, high } = getIssueType(issueType);
  return {
    days,
    dailyRent,
    low: roundTo10(dailyRent * days * low),
    high: roundTo10(dailyRent * days * high),
    perDayLow: dailyRent * low,
    perDayHigh: dailyRent * high,
  };
}

export function formatDollars(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
