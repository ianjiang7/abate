import { HandCoins, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatDollars, type Estimate } from "@/lib/domain/estimate";

export function EstimateCard({ estimate, fixed, issueLabel, lowPct, highPct }: { estimate: Estimate; fixed: boolean; issueLabel: string; lowPct: number; highPct: number }) {
  const hasRange = estimate.high > 0;
  const perDayLow = Math.round(estimate.perDayLow);
  const perDayHigh = Math.max(1, Math.round(estimate.perDayHigh));
  const growth = perDayLow > 0 ? `about $${perDayLow}–$${perDayHigh}` : `by up to $${perDayHigh}`;

  return (
    <Card tone="ink">
      <div className="flex items-center gap-2 text-sm font-semibold text-periwinkle">
        <HandCoins className="size-4" aria-hidden="true" />
        {fixed ? "Estimated amount you may be owed" : "Estimated amount you may be owed so far"}
      </div>
      {hasRange ? (
        <p className="mt-2 text-[40px] font-bold leading-none tracking-tight tabular-nums">
          {estimate.low > 0 ? (
            <>
              {formatDollars(estimate.low)} <span className="text-periwinkle">–</span> {formatDollars(estimate.high)}
            </>
          ) : (
            <>
              <span className="text-2xl text-periwinkle">Up to </span>
              {formatDollars(estimate.high)}
            </>
          )}
        </p>
      ) : (
        <p className="mt-2 text-2xl font-bold tracking-tight">Building up</p>
      )}
      <p className="mt-3 text-[15px] leading-relaxed text-periwinkle-soft">
        {estimate.days === 1 ? "1 day" : `${estimate.days} days`} since you told management
        {fixed ? ", until it was fixed." : "."}
      </p>
      {!fixed && estimate.perDayHigh > 0 ? (
        <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold">
          <TrendingUp className="size-4" aria-hidden="true" /> Grows {growth} a day while unfixed
        </p>
      ) : null}
      <p className="mt-4 text-xs text-periwinkle-soft">An estimate, not legal advice.</p>
      <details className="group mt-4 border-t border-white/15 pt-4 text-sm text-periwinkle-soft">
        <summary className="cursor-pointer list-none font-semibold text-white marker:hidden">
          <span className="underline decoration-periwinkle/60 underline-offset-4">How we estimate this</span>
        </summary>
        <p className="mt-3 leading-relaxed">
          New York&apos;s warranty of habitability lets tenants ask for part of their rent back while a serious problem goes unfixed. We multiply your daily rent by the days
          since management was told, then by {Math.round(lowPct * 100)}–{Math.round(highPct * 100)}% for {issueLabel.toLowerCase()}. These percentages are our own rough
          guide, not a legal standard. It&apos;s an estimate, not legal advice.
        </p>
      </details>
    </Card>
  );
}
