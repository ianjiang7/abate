import type { Metadata } from "next";
import { Suspense } from "react";
import { CaseView } from "@/components/case/case-view";
import { CaseSkeleton } from "@/components/case/skeletons";

export const metadata: Metadata = {
  title: "Your case",
  robots: { index: false, follow: false },
};

// Reading a pasted reply calls the Claude API; give the server actions on this page room to finish.
export const maxDuration = 60;

export default function CasePage({ params, searchParams }: PageProps<"/case/[token]">) {
  return (
    <Suspense fallback={<CaseSkeleton />}>
      <CaseView params={params} searchParams={searchParams} />
    </Suspense>
  );
}
