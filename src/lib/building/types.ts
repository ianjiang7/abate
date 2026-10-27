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
