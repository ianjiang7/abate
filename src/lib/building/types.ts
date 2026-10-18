import type { IsoDate } from "@/lib/domain/dates";

/** One address suggestion from the NYC geocoder. */
export type AddressMatch = {
  /** Display label, e.g. "123 Example Street, Bronx, NY, USA". */
  label: string;
  /** Street address without city, e.g. "123 Example Street". */
  street: string;
  borough: string;
  zip: string | null;
  /** Borough-block-lot, 10 digits. */
  bbl: string | null;
  /** Building identification number. */
  bin: string | null;
};

export type BuildingSummary = {
  bbl: string;
  bin: string | null;
  openViolations: { total: number; classA: number; classB: number; classC: number };
  /** Heat/hot water and other housing complaints since the current heat season began (Oct 1). */
  complaintsThisSeason: { heat: number; other: number; since: IsoDate };
  /** Registered managing agent from HPD registration, when listed. */
  managingAgent: { name: string | null; company: string | null } | null;
  /** Registered owner (corporate name or person), when listed. */
  owner: string | null;
  /** Median days housing complaints at this building took to close, over the last two years. */
  medianDaysToClose: number | null;
  /** ISO timestamp the data was fetched from NYC Open Data. */
  fetchedAt: string;
};
