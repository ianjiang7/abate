import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
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
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-16">
      <header className="flex items-center justify-between py-4">
        <Link href="/" aria-label="Abate home" className="rounded-xl">
          <Logo />
        </Link>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate ring-1 ring-line">Private case</span>
      </header>
      <Suspense fallback={<CaseSkeleton />}>
        <CaseView params={params} searchParams={searchParams} />
      </Suspense>
      <footer className="mt-10 space-y-1 px-1 text-center text-xs leading-relaxed text-slate">
        <p>Anyone with this link can see this case, so share it carefully.</p>
        <p>Abate is an NYU Stern student pilot. Not a law firm; nothing here is legal advice.</p>
      </footer>
    </div>
  );
}
