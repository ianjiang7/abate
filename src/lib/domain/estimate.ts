import { daysBetween, type IsoDate } from "./dates";
import { mostSeriousIssue, type IssueTypeId } from "./issues";

export type EstimateInput = {
  monthlyRent: number;
  /** Every problem the tenant picked. Only the most serious one's percentages are used. */
  issueTypes: readonly IssueTypeId[];
  /** When management was first told. The clock starts here, not when the problem started. */
  noticeOn: IsoDate;
  /** The fix date, or today if it's still unfixed. */
  endOn: IsoDate;
};

export type Estimate = {
  days: number;
  /** Display policy only, not a legal eligibility period. */
  minimumDays: number;
  displayable: boolean;
  midpoint: number;
  dailyRent: number;
  low: number;
  high: number;
  /** How much the range grows per extra day while unfixed. */
  perDayLow: number;
  perDayHigh: number;
};

const roundTo10 = (n: number) => Math.round(n / 10) * 10;

export function estimateAbatement({ monthlyRent, issueTypes, noticeOn, endOn }: EstimateInput): Estimate {
  const rent = Number.isFinite(monthlyRent) && monthlyRent > 0 ? monthlyRent : 0;
  const days = Math.max(0, daysBetween(noticeOn, endOn));
  const dailyRent = (rent * 12) / 365;
  // Several problems don't add up: the percentages describe how unlivable the apartment is overall,
  // so the most serious problem sets the range. Adding them would overstate what may be owed.
  const { low, high } = mostSeriousIssue(issueTypes);
  const minimumDays = issueTypes.includes("heat") ? 1 : 7;
  const roundedLow = roundTo10(dailyRent * days * low);
  const roundedHigh = roundTo10(dailyRent * days * high);
  return {
    days,
    minimumDays,
    displayable: days >= minimumDays && rent > 0,
    midpoint: (roundedLow + roundedHigh) / 2,
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
