import { afterEach, describe, expect, it, vi } from "vitest";
import { searchAddresses, titleCase } from "./geocode";

// Synthetic GeoSearch features, shaped like the live /v2/autocomplete response (Oct 2026): made-up
// streets, valid-format BBLs and BINs.
function feature(p: {
  name: string;
  housenumber: string;
  street: string;
  borough: string;
  postalcode?: string;
  locality?: string;
  bbl?: string;
  bin?: string;
}) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [-73.9, 40.8] },
    properties: {
      id: "1",
      gid: "nycpad:venue:1",
      layer: "venue",
      source: "nycpad",
      name: p.name,
      housenumber: p.housenumber,
      street: p.street,
      postalcode: p.postalcode,
      borough: p.borough,
      label: `${p.name}, ${p.locality ?? p.borough}, NY, USA`,
      addendum: p.bbl ? { pad: { bbl: p.bbl, bin: p.bin, version: "26c" } } : undefined,
    },
  };
}

const ALIASES = [
  // The same building under three spellings, like "2400 GD CONCOURSE" / "GRAND" / "THE GRAND".
  feature({ name: "250 EX CONCOURSE", housenumber: "250", street: "EX CONCOURSE", borough: "Bronx", postalcode: "10400", bbl: "2012340056", bin: "2099991" }),
  feature({ name: "250 EXAMPLE CONCOURSE", housenumber: "250", street: "EXAMPLE CONCOURSE", borough: "Bronx", postalcode: "10400", bbl: "2012340056", bin: "2099991" }),
  feature({ name: "250 THE EXAMPLE CONCOURSE", housenumber: "250", street: "THE EXAMPLE CONCOURSE", borough: "Bronx", postalcode: "10400", bbl: "2012340056", bin: "2099991" }),
  // A different building with the same house number.
  feature({ name: "250 EAST EXAMPLE STREET", housenumber: "250", street: "EAST EXAMPLE STREET", borough: "Manhattan", locality: "New York", postalcode: "10099", bbl: "1005550012", bin: "1099992" }),
  // No BIN assigned (placeholder) and a bad ZIP.
  feature({ name: "250 EXAMPLE PLACE", housenumber: "250", street: "EXAMPLE PLACE", borough: "Brooklyn", postalcode: "N/A", bbl: "3007770001", bin: "3000000" }),
  // A street result with no house number, and a result outside NYC: both dropped.
  feature({ name: "EXAMPLE AVENUE", housenumber: "", street: "EXAMPLE AVENUE", borough: "Queens" }),
  feature({ name: "250 EXAMPLE ROAD", housenumber: "250", street: "EXAMPLE ROAD", borough: "Nassau", bbl: "1005550099", bin: "1099993" }),
];

function stubGeoSearch(features: unknown[]) {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
    Response.json({ geocoding: { version: "0.2" }, type: "FeatureCollection", features }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("searchAddresses", () => {
  it("maps GeoSearch features to address matches", async () => {
    const fetchMock = stubGeoSearch(ALIASES);
    const matches = await searchAddresses("250 example concourse");

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe("https://geosearch.planninglabs.nyc/v2/autocomplete");
    expect(url.searchParams.get("text")).toBe("250 example concourse");
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);

    expect(matches).toEqual([
      {
        label: "250 Example Concourse, Bronx, NY, USA",
        street: "250 Example Concourse",
        borough: "Bronx",
        zip: "10400",
        bbl: "2012340056",
        bin: "2099991",
      },
      {
        label: "250 East Example Street, New York, NY, USA",
        street: "250 East Example Street",
        borough: "Manhattan",
        zip: "10099",
        bbl: "1005550012",
        bin: "1099992",
      },
      {
        label: "250 Example Place, Brooklyn, NY, USA",
        street: "250 Example Place",
        borough: "Brooklyn",
        zip: null,
        bbl: "3007770001",
        bin: null,
      },
    ]);
  });

  it("merges alias spellings, keeping the one closest to what was typed", async () => {
    stubGeoSearch(ALIASES.slice(0, 3));
    expect((await searchAddresses("250 ex"))[0].street).toBe("250 Example Concourse");
    expect((await searchAddresses("250 the example"))[0].street).toBe("250 The Example Concourse");
  });

  it("returns at most 5 matches", async () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      feature({ name: `${i + 1} EXAMPLE STREET`, housenumber: String(i + 1), street: "EXAMPLE STREET", borough: "Queens", postalcode: "11300", bbl: `400100000${i + 1}`, bin: `410000${i + 1}` }),
    );
    stubGeoSearch(many);
    expect(await searchAddresses("example street")).toHaveLength(5);
    expect(await searchAddresses("example street", { limit: 2 })).toHaveLength(2);
  });

  it("returns [] without calling the API for empty or short input", async () => {
    const fetchMock = stubGeoSearch(ALIASES);
    expect(await searchAddresses("")).toEqual([]);
    expect(await searchAddresses("  25  ")).toEqual([]);
    expect(await searchAddresses(undefined as unknown as string)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns [] on an HTTP error, a network error, a timeout or a malformed body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("oops", { status: 502 })));
    expect(await searchAddresses("250 example")).toEqual([]);

    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await searchAddresses("250 example")).toEqual([]);

    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("The operation timed out.", "TimeoutError"); }));
    expect(await searchAddresses("250 example")).toEqual([]);

    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ features: "nope" })));
    expect(await searchAddresses("250 example")).toEqual([]);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200 })));
    expect(await searchAddresses("250 example")).toEqual([]);
  });
});

describe("titleCase", () => {
  it("title-cases street words and leaves house numbers alone", () => {
    expect(titleCase("350 EAST 14 STREET")).toBe("350 East 14 Street");
    expect(titleCase("101A FOURTH AVENUE")).toBe("101A Fourth Avenue");
    expect(titleCase("30-50 WHITESTONE EXPRESSWAY")).toBe("30-50 Whitestone Expressway");
    expect(titleCase("12 1ST AVENUE")).toBe("12 1st Avenue");
    expect(titleCase("120 B'WAY")).toBe("120 B'way");
    expect(titleCase("5 WILKES-BARRE  ROAD")).toBe("5 Wilkes-Barre Road");
  });
});
