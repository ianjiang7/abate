import { HandCoins } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatDollars, type Estimate } from "@/lib/domain/estimate";

export function EstimateCard({ estimate, fixed, issueLabel, lowPct, highPct, ofSeveral = false, clockStarted = true, clockNote = "" }: {
  estimate: Estimate; fixed: boolean; issueLabel: string; lowPct: number; highPct: number;
  ofSeveral?: boolean; clockStarted?: boolean; clockNote?: string;
}) {
  const showAmount = clockStarted && estimate.displayable;
  return (
    <Card tone="ink">
      <div className="flex items-center gap-2 text-sm font-semibold text-periwinkle">
        <HandCoins className="size-4" aria-hidden="true" /> Estimated amount you may be owed
      </div>
      {showAmount ? <>
        <p className="mt-2 text-[40px] font-bold leading-none tracking-tight tabular-nums">{formatDollars(estimate.midpoint)}</p>
        <p className="mt-3 text-[15px] leading-relaxed text-periwinkle-soft">For {estimate.days} {estimate.days === 1 ? "day" : "days"} from when you told management{fixed ? " until the repair was fixed" : " through today"}.</p>
      </> : <>
        <p className="mt-3 text-2xl font-bold">{!clockStarted ? "Start with your first letter" : "Too early for our estimate"}</p>
        <p className="mt-3 text-[15px] leading-relaxed text-periwinkle-soft">
          {!clockStarted ? `We need a date management was told before showing an amount. ${clockNote}` : `Abate shows an estimate after ${estimate.minimumDays === 1 ? "1 day" : `${estimate.minimumDays} days`} from notice. ${fixed ? "This repair was fixed before that point." : "You can request repairs right away."}`}
        </p>
      </>}
      <p className="mt-4 text-xs leading-relaxed text-periwinkle-soft">An estimate, not legal advice or a guaranteed payment.</p>
      <details className="mt-4 border-t border-white/15 pt-4 text-sm text-periwinkle-soft">
        <summary className="cursor-pointer font-semibold text-white">How we estimate this</summary>
        <p className="mt-3 leading-relaxed">
          We average the low and high estimates based on your rent, days since management was told, and our {Math.round(lowPct * 100)}–{Math.round(highPct * 100)}% guideline for {issueLabel.toLowerCase()}.
          {ofSeveral ? " We use the most serious problem; percentages are not added together." : ""} These percentages are team assumptions, not legal standards. The midpoint is not a prediction of an award.
        </p>
        <p className="mt-3 leading-relaxed">Our display policy waits 7 days after notice, or 1 day for no heat or hot water. This is not a legal waiting period: eligibility depends on the circumstances. Once shown, the estimate includes the days from your original notice. You do not need to wait to report an urgent condition.</p>
        <a className="mt-3 inline-block underline underline-offset-4" href="https://ag.ny.gov/publications/residential-tenants-rights-guide" target="_blank" rel="noreferrer">New York tenants’ rights guide</a>
      </details>
    </Card>
  );
}
