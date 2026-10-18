import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

const control =
  "block w-full rounded-2xl border border-line bg-white px-4 text-ink placeholder:text-slate/70 shadow-[inset_0_1px_2px_rgb(8_1_78/0.04)] transition focus:border-ink focus:outline-none focus:ring-4 focus:ring-periwinkle/40 aria-[invalid=true]:border-bad aria-[invalid=true]:ring-bad/15";

export function Field({
  label,
  hint,
  error,
  htmlFor,
  optional,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  htmlFor?: string;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={htmlFor} className="flex items-baseline justify-between gap-2 text-[15px] font-semibold">
        <span>{label}</span>
        {optional ? <span className="text-xs font-medium text-slate">Optional</span> : null}
      </label>
      {children}
      {error ? (
        <p className="text-sm font-medium text-bad" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-slate">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cn(control, "h-13 min-h-[52px]", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-28 py-3 leading-relaxed", className)} {...rest} />;
}

export function MoneyInput({ className, ...rest }: ComponentProps<"input">) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-semibold text-slate">$</span>
      <input inputMode="decimal" className={cn(control, "min-h-[52px] pl-8", className)} {...rest} />
    </div>
  );
}
