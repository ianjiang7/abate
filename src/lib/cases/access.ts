import type { CaseRecord } from "./types";
import type { StepId } from "@/lib/domain/ladder";

export function hasFullPlan(record: Pick<CaseRecord, "planTier">): boolean {
  return record.planTier === "full";
}

export function canUseStep(record: Pick<CaseRecord, "planTier">, step: StepId): boolean {
  return step === "notice" || hasFullPlan(record);
}
