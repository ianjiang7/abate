// Top buildings by 311 heat and hot water complaints, to choose buildings to flyer.
//
//   npx tsx --conditions react-server --env-file-if-exists=.env.local scripts/heat-buildings.ts
//   ... scripts/heat-buildings.ts --days 14 --borough Bronx
//   ... scripts/heat-buildings.ts --zip 10003,10009
//
// Options: --days N (default 7), --borough NAME, --zip LIST, --limit N (default 40).
// Reads public 311 data only. Set NYC_OPEN_DATA_APP_TOKEN in .env.local for a higher rate limit.

import { fetchHeatBuildings, formatHeatTable, heatSince, parseHeatArgs } from "../src/lib/building/heat";

async function main() {
  let opts;
  try {
    opts = parseHeatArgs(process.argv.slice(2));
  } catch (err) {
    console.error((err as Error).message);
    process.exit(2);
  }

  const area = [opts.borough, opts.zips.length ? `ZIP ${opts.zips.join(", ")}` : null].filter(Boolean).join(", ");
  console.log(
    `Top ${opts.limit} buildings by 311 HEAT/HOT WATER complaints since ${heatSince(opts.days)} (last ${opts.days} days)${area ? `, ${area}` : ""}\n`,
  );

  const rows = await fetchHeatBuildings(opts);
  if (rows.length === 0) {
    console.log("No complaints found.");
    return;
  }
  console.log(formatHeatTable(rows));
}

main().catch((err) => {
  console.error(`Failed: ${(err as Error).message}`);
  process.exit(1);
});
