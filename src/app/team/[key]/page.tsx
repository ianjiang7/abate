import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { CardSkeleton } from "@/components/case/skeletons";
import { TeamView } from "@/components/team/team-view";

export const metadata: Metadata = {
  title: "Team",
  robots: { index: false, follow: false },
};

// The team runs the concierge pilot from here: send approved messages, read replies, see results.
export default function TeamPage({ params, searchParams }: PageProps<"/team/[key]">) {
  return (
    <div className="mx-auto min-h-dvh max-w-3xl px-4 pb-16">
      <header className="flex items-center justify-between py-4">
        <Logo />
        <span className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white">Team only</span>
      </header>
      <Suspense
        fallback={
          <div className="space-y-4">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        }
      >
        <TeamView params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
