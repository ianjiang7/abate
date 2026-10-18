import { Building2, Clock, Flame, ShieldAlert, UserRound } from "lucide-react";
import { getBuildingSummary } from "@/lib/building";
import { Card, CardHeader } from "@/components/ui/card";

export async function BuildingCard({ bbl, bin }: { bbl: string | null; bin: string | null }) {
  if (!bbl) return null;
  let summary = null;
  try {
    summary = await getBuildingSummary(bbl, bin);
  } catch {
    summary = null;
  }
  if (!summary) return null;

  const v = summary.openViolations;
  const agent = summary.managingAgent?.company ?? summary.managingAgent?.name ?? null;

  return (
    <Card>
      <CardHeader icon={<Building2 className="size-5" />} title="Your building's record" subtitle="From NYC housing and 311 data" />
      <dl className="grid grid-cols-2 gap-2.5">
        <Stat icon={<ShieldAlert className="size-4" />} label="Open HPD violations" value={v.total.toLocaleString()} note={v.classC > 0 ? `${v.classC} immediately hazardous` : v.total > 0 ? "None immediately hazardous" : "None open"} warn={v.classC > 0} />
        <Stat icon={<Flame className="size-4" />} label="Heat complaints this season" value={summary.complaintsThisSeason.heat.toLocaleString()} note={`Plus ${summary.complaintsThisSeason.other.toLocaleString()} other housing complaints`} />
        {summary.medianDaysToClose !== null ? (
          <Stat icon={<Clock className="size-4" />} label="Typical time to close a complaint" value={`${Math.round(summary.medianDaysToClose)} days`} note="Over the last two years" className="col-span-2" />
        ) : null}
      </dl>
      {agent || summary.owner ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-mist p-4 text-sm">
          <UserRound className="mt-0.5 size-4 shrink-0 text-slate" aria-hidden="true" />
          <p className="leading-relaxed text-slate">
            {agent ? (
              <>
                Registered managing agent: <span className="font-semibold text-ink">{agent}</span>
                {summary.owner ? ". " : null}
              </>
            ) : null}
            {summary.owner ? (
              <>
                Owner on file: <span className="font-semibold text-ink">{summary.owner}</span>
              </>
            ) : null}
          </p>
        </div>
      ) : null}
      <p className="mt-4 text-xs leading-relaxed text-slate">
        {v.total > 0
          ? "Your formal notice will point to these open violations. They're public records management can't dismiss."
          : summary.complaintsThisSeason.heat + summary.complaintsThisSeason.other > 0
            ? "Neighbors have already complained to the city this season. You're not the only one."
            : "No open violations or recent complaints are on file yet. A 311 complaint starts a public record."}
      </p>
    </Card>
  );
}

function Stat({ icon, label, value, note, warn, className }: { icon: React.ReactNode; label: string; value: string; note?: string; warn?: boolean; className?: string }) {
  return (
    <div className={`rounded-2xl p-4 ${warn ? "bg-warn-soft" : "bg-mist"} ${className ?? ""}`}>
      <dt className="flex items-center gap-1.5 text-[13px] font-semibold text-slate">
        <span className={warn ? "text-warn" : "text-ink"}>{icon}</span>
        {label}
      </dt>
      <dd className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums">{value}</dd>
      {note ? <dd className={`mt-0.5 text-xs ${warn ? "font-semibold text-warn" : "text-slate"}`}>{note}</dd> : null}
    </div>
  );
}
