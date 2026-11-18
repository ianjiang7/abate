import { describe, expect, it } from "vitest";
import { estimateAbatement } from "./estimate";
import { buildMessage, type TemplateContext } from "./templates";

describe("estimate display policy", () => {
  const input = { monthlyRent: 2000, issueTypes: ["mold"] as const, noticeOn: "2026-11-01" };
  it("withholds an amount before day 7 but preserves every day in the calculation", () => {
    expect(estimateAbatement({ ...input, endOn: "2026-11-07" }).displayable).toBe(false);
    const estimate = estimateAbatement({ ...input, endOn: "2026-11-08" });
    expect(estimate).toMatchObject({ days: 7, displayable: true, minimumDays: 7 });
    expect(estimate.midpoint).toBe((estimate.low + estimate.high) / 2);
    expect(estimate.midpoint).toBeGreaterThan(0);
  });
  it("uses day 1 for heat, including multiple issues, and handles same-day and invalid rent", () => {
    expect(estimateAbatement({ ...input, issueTypes: ["heat", "mold"], endOn: "2026-11-02" }).displayable).toBe(true);
    expect(estimateAbatement({ ...input, issueTypes: ["heat"], endOn: input.noticeOn }).displayable).toBe(false);
    expect(estimateAbatement({ ...input, monthlyRent: NaN, endOn: "2026-11-20" }).displayable).toBe(false);
  });
  it("never leaks a withheld estimate into a notice or formal notice", () => {
    const estimate = estimateAbatement({ ...input, endOn: "2026-11-06" });
    const ctx: TemplateContext = { today: "2026-11-06", tenantName: "Test Tenant", address: "123 Example Street", unit: "2", mgmtName: null,
      issueTypes: ["mold"], startedOn: "2026-11-01", toldBefore: true, firstReportedOn: "2026-11-01", firstReportedVia: "email",
      priorFollowups: 0, daysSinceReport: 5, estimate, sentOn: {}, voice: "tenant", estimateInNotice: true };
    for (const step of ["notice", "formal_notice"] as const) expect(buildMessage(step, ctx).body).not.toMatch(/\$\d/);
  });
});
