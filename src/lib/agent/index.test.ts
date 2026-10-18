import { afterEach, describe, expect, it, vi } from "vitest";
import { FALLBACK_SOURCE, readReply, readReplyWith } from "./index";
import type { ReadReplyInput, ReplyReading } from "./types";

const INPUT: ReadReplyInput = {
  replyText: "SECRET-TENANT-TEXT: the plumber will come tomorrow.",
  receivedOn: "2026-10-17",
  issue: "a plumbing problem",
  lastStepSent: "notice",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("readReply", () => {
  it("uses the stand-in when there is no API key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const reading = await readReply(INPUT);
    expect(reading.source).toBe("stand-in");
    expect(reading.category).toBe("scheduled");
    expect(reading.mentionedDate).toBe("2026-10-18");
  });
});

describe("readReplyWith", () => {
  it("returns the Claude reading when it succeeds", async () => {
    const claudeReading: ReplyReading = {
      category: "scheduled",
      summary: "Says the plumber will come tomorrow.",
      mentionedDate: "2026-10-18",
      replyReference: null,
      source: "claude-opus-5-5",
    };
    expect(await readReplyWith(INPUT, async () => claudeReading)).toBe(claudeReading);
  });

  it("falls back to the stand-in on any Claude error, without logging the reply", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const reading = await readReplyWith(INPUT, async () => {
      throw new Error(`boom ${INPUT.replyText}`);
    });
    expect(reading.source).toBe(FALLBACK_SOURCE);
    expect(reading.category).toBe("scheduled");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).not.toContain("SECRET-TENANT-TEXT");
  });
});
