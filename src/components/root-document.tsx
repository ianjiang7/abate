import type { Metadata, Viewport } from "next";
import { Work_Sans } from "next/font/google";
import { Suspense } from "react";
import { Analytics } from "@/components/analytics";
import "@/app/globals.css";

const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Abate: a clear next step for NYC renters",
    template: "%s · Abate",
  },
  description:
    "Repair still not fixed? Abate drafts and times every follow-up to your NYC landlord, keeps a dated record, and shows the rent you may be owed.",
  applicationName: "Abate",
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  themeColor: "#08014E",
};

export default function RootDocument({ children, publicPage = false }: { children: React.ReactNode; publicPage?: boolean }) {
  return (
    <html lang="en" className={`${workSans.variable} h-full`}>
      <body className="min-h-full bg-mist font-sans text-ink">
        {children}
        {/* PostHog, only when its key is set. Suspense: case and team URLs aren't known while prerendering. */}
        {publicPage && process.env.NEXT_PUBLIC_POSTHOG_KEY && process.env.NEXT_PUBLIC_POSTHOG_HOST ? (
          <Suspense fallback={null}>
            <Analytics />
          </Suspense>
        ) : null}
      </body>
    </html>
  );
}
