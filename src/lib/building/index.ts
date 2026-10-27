import "server-only";

// NYC GeoSearch address lookup for the start form (it also gives the building ID neighbor invites
// use). The HPD and Open Data building lookup was cut on Oct 27, 2026; see docs/decisions.md.
export { searchAddresses } from "./geocode";
export type { AddressMatch } from "./types";
