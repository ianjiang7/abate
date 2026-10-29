import type { Metadata, Viewport } from "next";
import { Work_Sans } from "next/font/google";
import { Suspense } from "react";
import { Analytics } from "@/components/analytics";
import "./globals.css";

const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Abate: we chase your landlord so you don't have to",
    template: "%s · Abate",
  },
  description:
    "Repair still not fixed? Abate drafts and times every follow-up to your NYC landlord, keeps a dated record, and shows the rent you may be owed.",
  applicationName: "Abate",
};

export const viewport: Viewport = {
  themeColor: "#08014E",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${workSans.variable} h-full`}>
      <body className="min-h-full bg-mist font-sans text-ink">
        {children}
        {/* PostHog, only when its key is set. Suspense: case and team URLs aren't known while prerendering. */}
        {process.env.NEXT_PUBLIC_POSTHOG_KEY && process.env.NEXT_PUBLIC_POSTHOG_HOST ? (
          <Suspense fallback={null}>
            <Analytics />
          </Suspense>
        ) : null}
      </body>
    </html>
  );
}
