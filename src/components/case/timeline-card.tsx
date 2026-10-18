import { CalendarCheck, Check, CircleDot, Flag, Mail, MessageSquareText, Sparkles } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { formatShortDate, type IsoDate } from "@/lib/domain/dates";
import type { ProgressStep, TimelineItem } from "@/lib/cases/view";

const ICONS: Record<TimelineItem["kind"], React.ReactNode> = {
  started: <Flag className="size-3.5" />,
  reported: <MessageSquareText className="size-3.5" />,
  joined: <Sparkles className="size-3.5" />,
  sent: <Mail className="size-3.5" />,
  reply: <MessageSquareText className="size-3.5" />,
  scheduled: <CalendarCheck className="size-3.5" />,
  fixed: <Check className="size-3.5" />,
};

const DOT: Record<TimelineItem["tone"], string> = {
  brand: "bg-ink text-white",
  neutral: "bg-lavender text-ink",
  good: "bg-good text-white",
  warn: "bg-warn text-white",
};

export function TimelineCard({ items, progress, today }: { items: TimelineItem[]; progress: ProgressStep[]; today: IsoDate }) {
  return (
    <Card>
      <CardHeader icon={<CircleDot className="size-5" />} title="Your dated record" subtitle="Everything that's happened, in order" />

      <ol className="mb-6 grid grid-cols-4 gap-1.5" aria-label="Follow-up steps">
        {progress.map((p) => (
          <li key={p.step} className="text-center">
            <span
              className={cn(
                "block h-1.5 rounded-full",
                p.status === "done" ? "bg-ink" : p.status === "current" ? "bg-gradient-to-r from-ink to-periwinkle" : "bg-periwinkle-soft",
              )}
            />
            <span className={cn("mt-2 block text-[11px] font-semibold leading-tight", p.status === "upcoming" ? "text-slate" : "text-ink")}>{p.label}</span>
            {p.date ? <span className="block text-[11px] text-slate">{formatShortDate(p.date, today)}</span> : null}
          </li>
        ))}
      </ol>

      <ol className="relative">
        {items.map((it, i) => (
          <li key={it.id} className="relative flex gap-3.5 pb-5 last:pb-0">
            {i < items.length - 1 ? <span className="absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px bg-line" aria-hidden="true" /> : null}
            <span className={cn("relative mt-0.5 grid size-7 shrink-0 place-items-center rounded-full", DOT[it.tone])} aria-hidden="true">
              {ICONS[it.kind]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-semibold leading-snug">{it.title}</p>
                <time dateTime={it.date} className="shrink-0 text-sm tabular-nums text-slate">
                  {formatShortDate(it.date, today)}
                </time>
              </div>
              {it.detail ? <p className="mt-0.5 text-sm leading-relaxed text-slate">{it.detail}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
