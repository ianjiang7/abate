import "server-only";

// The case agent's reply reader. Uses Claude when ANTHROPIC_API_KEY is set, and the keyword
// stand-in otherwise or whenever the Claude call fails, so a reply is always read.
// Reply text is tenant data: never log it.

import Anthropic from "@anthropic-ai/sdk";
import { createClaudeReader, ReplyReaderError } from "./claude";
import { readReplyStandIn } from "./standin";
import type { ReadReplyInput, ReplyReading } from "./types";

export type { ReadReplyInput, ReplyReading } from "./types";

export const FALLBACK_SOURCE = "stand-in (fallback)";

type Reader = (input: ReadReplyInput) => Promise<ReplyReading>;

let claudeReader: Reader | null = null;

function getClaudeReader(): Reader {
  // Bounded so a tenant isn't left waiting: one retry, 20 seconds per attempt.
  claudeReader ??= createClaudeReader(new Anthropic({ timeout: 20_000, maxRetries: 1 }));
  return claudeReader;
}

/** A short, content-free description of what went wrong, for the server log. */
function describeFailure(error: unknown): string {
  if (error instanceof ReplyReaderError) return error.code;
  if (error instanceof Anthropic.APIError) return `API error ${error.status ?? "without status"}`;
  if (error instanceof Error) return error.name;
  return "unknown error";
}

/** Reads with `claude` when given one, falling back to the stand-in on any error. */
export async function readReplyWith(input: ReadReplyInput, claude: Reader | null): Promise<ReplyReading> {
  if (!claude) return readReplyStandIn(input);
  try {
    return await claude(input);
  } catch (error) {
    console.warn(`[case agent] Claude reader failed (${describeFailure(error)}); used the stand-in.`);
    return { ...readReplyStandIn(input), source: FALLBACK_SOURCE };
  }
}

export async function readReply(input: ReadReplyInput): Promise<ReplyReading> {
  // ABATE_AGENT=standin forces the deterministic stand-in (the end-to-end test sets it).
  const useClaude = Boolean(process.env.ANTHROPIC_API_KEY) && process.env.ABATE_AGENT !== "standin";
  return readReplyWith(input, useClaude ? getClaudeReader() : null);
}
