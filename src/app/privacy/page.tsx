import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Abate collects, who sees it, and when we delete it.",
};

export default function PrivacyPage() {
  const teamEmail = (process.env.TEAM_GMAIL ?? process.env.CC_EMAIL ?? "").trim();
  return (
    <div className="mx-auto max-w-2xl px-5 py-6">
      <header className="flex items-center justify-between">
        <Logo />
        <Link href="/start" className="rounded-full px-4 py-2 text-sm font-semibold text-ink hover:bg-lavender">
          Start a case
        </Link>
      </header>

      <main className="mt-8 pb-14">
        <h1 className="text-3xl font-bold tracking-tight">Privacy</h1>
        <p className="mt-3 leading-relaxed text-slate">
          Abate is a student pilot at NYU Stern. Here is what we collect, who sees it, and when we delete it, in plain
          language.
        </p>

        <Section title="What we collect">
          Only what your follow-ups need: your address and unit, what needs fixing and when it started, a photo if you add one,
          when and how you told management, management&apos;s name and email, your name, your monthly rent (to estimate what you may
          be owed), your email if our team sends for you, an optional phone or email for reminders, and the replies you or
          management send.
        </Section>

        <Section title="Who sees it">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-ink">Our four-person team</strong> reads your case to send approved messages and read replies.
            </li>
            <li>
              <strong className="text-ink">Your management</strong> sees only the messages you approve (or send yourself).
            </li>
            <li>
              <strong className="text-ink">An AI service (Anthropic&apos;s Claude)</strong> reads management&apos;s replies, along with the
              type of problem, so we can compare its reading with our team&apos;s. It doesn&apos;t get your name, rent or photos, and it
              never writes to your landlord.
            </li>
            <li>
              <strong className="text-ink">NYC&apos;s public address lookup</strong> (GeoSearch) gets your street address to find your
              building&apos;s city record. Your unit, name and case aren&apos;t sent.
            </li>
          </ul>
        </Section>

        <Section title="Where it's kept">
          Cases are stored in our database (Supabase) and photos in a private storage bucket. Your case page lives at a private
          link with no login, so keep the link to yourself. We never sell or share your information, and we don&apos;t use ads or
          tracking.
        </Section>

        <Section title="When we delete it">
          We delete tester data when the pilot ends. To delete your case sooner, or to ask what we hold,{" "}
          {teamEmail ? (
            <>
              email{" "}
              <a href={`mailto:${teamEmail}`} className="font-semibold underline decoration-periwinkle underline-offset-4">
                {teamEmail}
              </a>{" "}
              or reply to any message from our team.
            </>
          ) : (
            <>reply to any message from our team.</>
          )}
        </Section>

        <p className="mt-10 text-sm text-slate">Abate isn&apos;t a law firm, and nothing here is legal advice.</p>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-2 leading-relaxed text-slate">{children}</div>
    </section>
  );
}
