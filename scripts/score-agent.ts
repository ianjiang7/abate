// Scores the case agent's reply reader on the team's sample replies (data/sample-replies.json).
//
//   npx tsx --conditions react-server --env-file=.env.local scripts/score-agent.ts
//   npx tsx --conditions react-server scripts/score-agent.ts --standin
//
// (Node 20.18 rejects --env-file-if-exists; --env-file works there but needs the file to exist.)
// Without --standin it uses readReply, which calls Claude when ANTHROPIC_API_KEY is set (36 small
// API calls) and the stand-in otherwise. The samples are made up, so printing ids is fine.

import samples from "../data/sample-replies.json";
import { readReply } from "@/lib/agent";
import { readReplyStandIn } from "@/lib/agent/standin";
import type { ReadReplyInput, ReplyReading } from "@/lib/agent/types";
import { REPLY_CATEGORIES, type ReplyCategory } from "@/lib/domain/ladder";

type Sample = {
  id: string;
  receivedOn: string;
  issue: string;
  text: string;
  expectedCategory: ReplyCategory;
  expectedDate: string | null;
};

const CONCURRENCY = 4;
const useStandIn = process.argv.includes("--standin");

async function read(sample: Sample): Promise<ReplyReading> {
  const input: ReadReplyInput = {
    replyText: sample.text,
    receivedOn: sample.receivedOn,
    issue: sample.issue,
    lastStepSent: "notice",
  };
  return useStandIn ? readReplyStandIn(input) : readReply(input);
}

async function readAll(set: Sample[]): Promise<ReplyReading[]> {
  const results: ReplyReading[] = new Array(set.length);
  let next = 0;
  async function worker() {
    while (next < set.length) {
      const i = next++;
      results[i] = await read(set[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, set.length) }, worker));
  return results;
}

const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${((n / d) * 100).toFixed(0)}%`);

async function main() {
  const set = samples as Sample[];
  const mode = useStandIn ? "stand-in (forced)" : process.env.ANTHROPIC_API_KEY ? "readReply (Claude)" : "readReply (no API key, stand-in)";
  console.log(`Scoring ${set.length} sample replies with ${mode}\n`);

  const started = Date.now();
  const readings = await readAll(set);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  let categoryHits = 0;
  let dateHits = 0;
  const misses: string[] = [];
  const perCategory = new Map<ReplyCategory, { hits: number; total: number }>(
    REPLY_CATEGORIES.map((c) => [c.id, { hits: 0, total: 0 }]),
  );
  const sources = new Map<string, number>();

  set.forEach((sample, i) => {
    const r = readings[i];
    const bucket = perCategory.get(sample.expectedCategory)!;
    bucket.total++;
    sources.set(r.source, (sources.get(r.source) ?? 0) + 1);

    const categoryOk = r.category === sample.expectedCategory;
    const dateOk = r.mentionedDate === sample.expectedDate;
    if (categoryOk) {
      categoryHits++;
      bucket.hits++;
    }
    if (dateOk) dateHits++;
    if (!categoryOk || !dateOk) {
      const parts = [];
      if (!categoryOk) parts.push(`category expected ${sample.expectedCategory}, got ${r.category}`);
      if (!dateOk) parts.push(`date expected ${sample.expectedDate ?? "none"}, got ${r.mentionedDate ?? "none"}`);
      misses.push(`  ${sample.id}: ${parts.join("; ")}`);
    }
  });

  console.log(`Category accuracy: ${categoryHits}/${set.length} (${pct(categoryHits, set.length)})`);
  console.log(`Date accuracy:     ${dateHits}/${set.length} (${pct(dateHits, set.length)})\n`);
  console.log("By expected category:");
  for (const c of REPLY_CATEGORIES) {
    const { hits, total } = perCategory.get(c.id)!;
    console.log(`  ${c.id.padEnd(22)} ${hits}/${total} (${pct(hits, total)})`);
  }
  console.log(`\nSources: ${[...sources].map(([s, n]) => `${s} x${n}`).join(", ")}`);
  console.log(`Time: ${seconds}s\n`);
  console.log(misses.length ? `Misses (${misses.length}):\n${misses.join("\n")}` : "No misses.");
}

main()
  .catch((error) => {
    console.error("Scoring failed:", error instanceof Error ? error.message : error);
  })
  .finally(() => {
    process.exitCode = 0;
  });
