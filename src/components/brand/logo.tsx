import { cn } from "@/components/ui/cn";

/** Abate mark: a house outline with a rising check, in the deck's indigo. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#08014E" />
      <path d="M8 15.5 16 9l8 6.5V24a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-8.5Z" fill="none" stroke="#AEB4DF" strokeWidth="2" strokeLinejoin="round" />
      <path d="m12.5 18.5 2.6 2.6 5-5.6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-[19px] font-bold tracking-tight">Abate</span>
    </span>
  );
}
