import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

type CardTone = "white" | "ink" | "lavender" | "good";

const cardSurface: Record<CardTone, string> = {
  white: "bg-white text-ink",
  ink: "bg-ink text-white",
  lavender: "bg-lavender text-ink",
  good: "bg-good-soft text-ink",
};

const cardRing: Record<CardTone, string> = {
  white: "ring-1 ring-line/70",
  ink: "ring-0",
  lavender: "ring-1 ring-periwinkle/60",
  good: "ring-1 ring-good/20",
};

/**
 * A rounded surface. Colors, ring and padding come from props, not className: Tailwind gives two
 * utilities for the same property no guaranteed order, so overrides like "bg-ink" can silently lose.
 */
export function Card({
  tone = "white",
  emphasis = false,
  padded = true,
  className,
  ...rest
}: ComponentProps<"section"> & { tone?: CardTone; emphasis?: boolean; padded?: boolean }) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-card)] shadow-[var(--shadow-card)]",
        cardSurface[tone],
        emphasis ? "ring-2 ring-ink" : cardRing[tone],
        padded && "p-5",
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({ icon, title, subtitle, action }: { icon?: ReactNode; title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      {icon ? <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-lavender text-ink">{icon}</div> : null}
      <div className="min-w-0 flex-1">
        <h2 className="text-[17px] font-semibold leading-snug tracking-tight">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-sm text-slate">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

type Tone = "neutral" | "good" | "warn" | "bad" | "brand";

const tones: Record<Tone, string> = {
  neutral: "bg-lavender text-ink",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  brand: "bg-ink text-white",
};

export function Badge({ tone = "neutral", className, ...rest }: ComponentProps<"span"> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", tones[tone], className)} {...rest} />;
}

export function Notice({ tone = "neutral", icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex gap-3 rounded-2xl p-4 text-sm leading-relaxed", tones[tone], className)} role={tone === "bad" ? "alert" : undefined}>
      {icon ? <div className="mt-0.5 shrink-0">{icon}</div> : null}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
