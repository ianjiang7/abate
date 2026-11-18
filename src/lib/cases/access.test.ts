import { beforeEach, describe, expect, it, vi } from "vitest";
import { canUseStep } from "./access";
import type { CaseRecord } from "./types";

vi.mock("./repo", () => ({
  findCaseByToken: vi.fn(), updateCase: vi.fn(), logEvent: vi.fn(), listMessages: vi.fn().mockResolvedValue([]), insertMessage: vi.fn(),
}));
vi.mock("next/server", () => ({ after: vi.fn() }));
import { findCaseByToken, updateCase, logEvent, insertMessage } from "./repo";
import { draftFor, logReply, recordStep, teamClaim, teamMarkSent, upgradePlan } from "./service";

const free = { id: "test-case", planTier: "free", status: "open", sendMode: "self", priceChoice: "free", priceArm: "p29" } as CaseRecord;
beforeEach(() => { vi.clearAllMocks(); vi.mocked(findCaseByToken).mockResolvedValue(free); });

describe("plan access enforced on the server", () => {
  it("allows only the initial letter for Free, and all steps for Full", () => {
    expect(canUseStep(free, "notice")).toBe(true);
    for (const step of ["reminder", "formal_notice", "guide_311", "ask_date"] as const) {
      expect(canUseStep(free, step)).toBe(false);
      expect(canUseStep({ planTier: "full" }, step)).toBe(true);
    }
  });
  it("rejects forged follow-up and reply actions without saving anything", async () => {
    expect((await recordStep("token", "reminder", "subject", "body", null)).ok).toBe(false);
    expect((await logReply("token", "We will repair it", "2026-11-17")).ok).toBe(false);
    expect(() => draftFor(free, [], "formal_notice", "2026-11-17")).toThrow("Full plan required");
    expect(insertMessage).not.toHaveBeenCalled();
    expect(updateCase).not.toHaveBeenCalled();
  });
  it("persists an upgrade separately from the original price choice and is idempotent", async () => {
    expect((await upgradePlan("token")).ok).toBe(true);
    expect(updateCase).toHaveBeenCalledWith(free.id, expect.objectContaining({ plan_tier: "full", upgraded_at: expect.any(String) }));
    expect(vi.mocked(updateCase).mock.calls.some((call) => "price_choice" in call[1])).toBe(false);
    expect(logEvent).toHaveBeenCalledWith(free.id, "plan_upgraded", { price_arm: "p29" });
    vi.mocked(findCaseByToken).mockResolvedValue({ ...free, planTier: "full" });
    vi.clearAllMocks();
    expect((await upgradePlan("token")).ok).toBe(true);
    expect(updateCase).not.toHaveBeenCalled();
  });
  it("rejects stale team sending actions", async () => {
    expect((await teamClaim("message", true)).ok).toBe(false);
    expect((await teamMarkSent("message")).ok).toBe(false);
    expect(updateCase).not.toHaveBeenCalled();
  });
});
