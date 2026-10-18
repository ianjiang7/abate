// Top buildings by 311 heat and hot water complaints, to choose buildings to flyer.
//
//   npx tsx scripts/heat-buildings.ts
//   npx tsx scripts/heat-buildings.ts --days 14 --borough Bronx
//   npx tsx scripts/heat-buildings.ts --zip 10003,10009
//
// Options: --days N (default 7: today and the 6 days before), --borough NAME, --zip LIST,
// --limit N (default 40).
//
// Reads public 311 data only, so it needs no .env.local. An app token only raises the rate limit:
// `NYC_OPEN_DATA_APP_TOKEN=<token> npx tsx scripts/heat-buildings.ts`, or add
// `--env-file=.env.local` after `tsx` where that file exists. (Node 20.18 has no
// --env-file-if-exists; it arrived in Node 20.19 and 22.9.)

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
    `Top ${opts.limit} buildings by 311 HEAT/HOT WATER complaints since ${heatSince(opts.days)} (${opts.days} ${opts.days === 1 ? "day" : "days"}, through today)${area ? `, ${area}` : ""}\n`,
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
