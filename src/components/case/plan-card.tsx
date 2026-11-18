"use client";

import { useActionState } from "react";
import { upgradeAction, type CaseActionState } from "@/app/case/[token]/actions";
import { Button } from "@/components/ui/button";
import { Card, Notice } from "@/components/ui/card";
import { priceArmById } from "@/lib/domain/pricing";

export function PlanCard({ token, full, priceArm }: { token: string; full: boolean; priceArm: string | null }) {
  const [state, action, pending] = useActionState<CaseActionState, FormData>(upgradeAction.bind(null, token), {});
  const arm = priceArmById(priceArm);
  if (full) return <Notice>{state.ok ? state.message : "Full plan · You send every letter from your own email. Nothing is charged during the pilot."}</Notice>;
  return <Card>
    <h2 className="text-lg font-bold">Your free plan</h2>
    <p className="mt-2 text-sm text-slate">Your abatement estimate and first letter are included.</p>
    <details className="mt-4 border-t border-line pt-4" open>
      <summary className="cursor-pointer font-semibold">Want help with what comes next?</summary>
      <p className="mt-3 text-sm leading-relaxed text-slate">The full plan adds timed follow-up drafts, management reply tracking and team review, a dated case history, and a 311 guide. You send each letter yourself.</p>
      <p className="mt-3 font-semibold">{arm?.line ?? "Full follow-up plan"}</p>
      <form action={action} className="mt-3">
        <Button type="submit" block loading={pending}>{pending ? "Unlocking…" : "Buy the full plan"}</Button>
      </form>
      {state.message && !state.ok ? <p role="alert" className="mt-3 text-sm text-bad">{state.message}</p> : null}
    </details>
  </Card>;
}
