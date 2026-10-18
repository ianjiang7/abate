import { afterEach, describe, expect, it, vi } from "vitest";
import { alignWords, hasTypedAddress, searchAddresses, titleCase } from "./geocode";

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

function collection(features: unknown[]) {
  return Response.json({ geocoding: { version: "0.2" }, type: "FeatureCollection", features });
}

/** Stubs both GeoSearch endpoints; `searched` is what /v2/search returns (a Response for errors). */
function stubGeoSearch(features: unknown[], searched: unknown[] | Response = []) {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) =>
    new URL(url).pathname === "/v2/search"
      ? searched instanceof Response
        ? searched
        : collection(searched)
      : collection(features),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// Autocomplete's miss for "16 avenue a", with made-up BBLs and BINs: the typed house number only
// appears inside a Brooklyn street name.
const AUTOCOMPLETE_MISS = [
  feature({ name: "4114 16 AVENUE", housenumber: "4114", street: "16 AVENUE", borough: "Brooklyn", postalcode: "11200", bbl: "3099990001", bin: "3999991" }),
  feature({ name: "3902 16 AVENUE", housenumber: "3902", street: "16 AVENUE", borough: "Brooklyn", postalcode: "11200", bbl: "3099990002", bin: "3999992" }),
];
// What /v2/search returns for the same text: the right building first, under two spellings.
const SEARCH_HIT = [
  feature({ name: "16 AVENUE A", housenumber: "16", street: "AVENUE A", borough: "Manhattan", locality: "New York", postalcode: "10099", bbl: "1009990007", bin: "1999994" }),
  feature({ name: "16 A AVENUE", housenumber: "16", street: "A AVENUE", borough: "Manhattan", locality: "New York", postalcode: "10099", bbl: "1009990007", bin: "1999994" }),
  feature({ name: "16 A SAMPLE OVAL", housenumber: "16", street: "A SAMPLE OVAL", borough: "Bronx", postalcode: "10400", bbl: "2099990003", bin: "2999995" }),
];

afterEach(() => vi.unstubAllGlobals());

describe("searchAddresses", () => {
  it("maps GeoSearch features to address matches", async () => {
    const fetchMock = stubGeoSearch(ALIASES);
    const matches = await searchAddresses("250 example concourse");

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe("https://geosearch.planninglabs.nyc/v2/autocomplete");
    expect(url.searchParams.get("text")).toBe("250 example concourse");
    // 20, not the default 10, so merging aliases still leaves 5 buildings.
    expect(url.searchParams.get("size")).toBe("20");
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    // Autocomplete found the typed address, so /v2/search isn't called.
    expect(fetchMock).toHaveBeenCalledOnce();

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

  it("prefers the full street name over abbreviations and aliases with extra words", async () => {
    // Shaped like the live aliases for "100 bway": B'WAY, BROADWAY and BWAY EAST for one building.
    const aliases = ["100 B'WAY", "100 BROADWAY", "100 BWAY EAST"].map((name) =>
      feature({ name, housenumber: "100", street: name.slice(4), borough: "Brooklyn", postalcode: "11200", bbl: "3099990010", bin: "3999910" }),
    );
    const fetchMock = stubGeoSearch(aliases);
    for (const typed of ["100 bway", "100 b'way", "100 broadway", "100 bro"]) {
      const matches = await searchAddresses(typed);
      expect(matches.map((m) => m.street)).toEqual(["100 Broadway"]);
    }
    expect(fetchMock).toHaveBeenCalledTimes(4); // every spelling counts as found: no /v2/search
  });

  it("asks /v2/search when autocomplete misses the typed address, and lists its results first", async () => {
    const fetchMock = stubGeoSearch(AUTOCOMPLETE_MISS, SEARCH_HIT);
    const matches = await searchAddresses("16 avenue a");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const search = new URL(fetchMock.mock.calls[1][0]);
    expect(search.origin + search.pathname).toBe("https://geosearch.planninglabs.nyc/v2/search");
    expect(search.searchParams.get("text")).toBe("16 avenue a");
    expect(search.searchParams.get("size")).toBe("20");
    // Both requests share one 5 second deadline.
    expect(fetchMock.mock.calls[1][1]?.signal).toBe(fetchMock.mock.calls[0][1]?.signal);

    expect(matches.map((m) => [m.label, m.bbl, m.bin])).toEqual([
      ["16 Avenue A, New York, NY, USA", "1009990007", "1999994"],
      ["16 A Sample Oval, Bronx, NY, USA", "2099990003", "2999995"],
      ["4114 16 Avenue, Brooklyn, NY, USA", "3099990001", "3999991"],
      ["3902 16 Avenue, Brooklyn, NY, USA", "3099990002", "3999992"],
    ]);
  });

  it("keeps the autocomplete results when /v2/search fails", async () => {
    stubGeoSearch(AUTOCOMPLETE_MISS, new Response("oops", { status: 502 }));
    expect((await searchAddresses("16 avenue a")).map((m) => m.street)).toEqual(["4114 16 Avenue", "3902 16 Avenue"]);
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

describe("matching what was typed", () => {
  it("pairs each typed word with its own candidate word", () => {
    expect(alignWords(["avenue", "a"], ["avenue", "a"])).toEqual({ matched: 2, extra: 0 });
    // "a" can't reuse "avenue", so "16 AVENUE B" doesn't match "16 avenue a".
    expect(alignWords(["avenue", "a"], ["avenue", "b"])).toEqual({ matched: 1, extra: 1 });
    expect(alignWords(["a", "avenue"], ["avenue", "a"])).toEqual({ matched: 2, extra: 0 });
    expect(alignWords(["gd", "con"], ["grand", "concourse"])).toEqual({ matched: 2, extra: 0 });
    expect(alignWords(["bway"], ["broadway", "east"])).toEqual({ matched: 1, extra: 1 });
    expect(alignWords(["bx"], ["broadway"])).toEqual({ matched: 0, extra: 1 });
  });

  it("checks for the typed house number and every typed street word", () => {
    expect(hasTypedAddress(AUTOCOMPLETE_MISS, "16 avenue a")).toBe(false);
    expect(hasTypedAddress(SEARCH_HIT, "16 avenue a")).toBe(true);
    expect(hasTypedAddress(SEARCH_HIT, "16 ave a")).toBe(true);
    expect(hasTypedAddress(SEARCH_HIT, "16 avenue b")).toBe(false);
    // Nothing to check yet: no house number first, or no street word after it.
    expect(hasTypedAddress([], "avenue a")).toBe(true);
    expect(hasTypedAddress([], "160")).toBe(true);
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
