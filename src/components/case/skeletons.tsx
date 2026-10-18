function Bar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-full bg-periwinkle-soft/70 ${className}`} />;
}

export function CaseSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading your case">
      <div className="space-y-3 px-1 pt-2">
        <Bar className="h-4 w-32" />
        <Bar className="h-8 w-3/4" />
        <Bar className="h-4 w-1/2" />
      </div>
      <div className="h-80 animate-pulse rounded-[var(--radius-card)] bg-white ring-1 ring-line/70" />
      <div className="h-44 animate-pulse rounded-[var(--radius-card)] bg-ink/90" />
      <div className="h-56 animate-pulse rounded-[var(--radius-card)] bg-white ring-1 ring-line/70" />
    </div>
  );
}

export function CardSkeleton() {
  return <div className="h-48 animate-pulse rounded-[var(--radius-card)] bg-white ring-1 ring-line/70" aria-hidden="true" />;
}
