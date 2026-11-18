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
          Start my case
        </Link>
      </header>

      <main className="mt-8 pb-14">
        <h1 className="text-3xl font-bold tracking-tight">Privacy</h1>
        <p className="mt-3 leading-relaxed text-slate">
          Abate is a student pilot at NYU Stern. Here is what we collect, who sees it, and when we delete it, in plain
          language.
        </p>

        <Section title="What we collect">
          <p>
            Only what your follow-ups need: your address and unit, what needs fixing and when it started, a photo if you add
            one, when you first told management, management&apos;s email, your name, your monthly rent (to estimate what you may
            be owed), an optional phone or email for reminders, and the management replies you paste into your case. On the home page, the start form and this page, we also see which screens you reach (PostHog,
            below).
          </p>
          <p className="mt-3">
            The start form also shows a price for a paid plan. It&apos;s a test: paid plans aren&apos;t open, and nothing is ever
            charged. We save which price you saw, and whether you tapped it or the free option, and whether you later unlocked the full plan. While a price is being tested, your browser remembers which one you saw, so it usually stays the
            same if you reload.
          </p>
        </Section>

        <Section title="Who sees it">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-ink">Our four-person team</strong> reads your case and the replies you save. You send every letter yourself.
            </li>
            <li>
              <strong className="text-ink">Your management</strong> sees only the messages you send yourself.
            </li>
            <li>
              <strong className="text-ink">An AI service (Anthropic&apos;s Claude)</strong> reads management&apos;s replies, along with the
              type of problem, so we can compare its reading with our team&apos;s. It doesn&apos;t get your name, rent or photos, and it
              never writes to your landlord.
            </li>
            <li>
              <strong className="text-ink">NYC&apos;s public address lookup</strong> (GeoSearch) gets the street address you type, to
              suggest matching addresses and find your building&apos;s ID, which neighbor invites use. Your unit, name and case
              aren&apos;t sent.
            </li>
            <li>
              <strong className="text-ink">PostHog, our analytics service</strong>, shows us which screens people reach on the home
              page, the start form and this page, so we can see where people stop. It records taps and scrolling on those screens,
              but what you type and your estimate are hidden in recordings. On the price step it learns which price you saw and
              whether you tapped it. If one of our ads or a partner&apos;s link brought you, it learns which one from a tag in the
              link (like utm_source=google). Your browser keeps that tag until you close the tab, and PostHog&apos;s cookie
              remembers the first one you arrived with for up to a year. When you create a case, it learns only who sends your follow-ups and how many
              problems you picked. It never runs on your case page.
            </li>
          </ul>
        </Section>

        <Section title="Where it's kept">
          Cases are stored in our database (Supabase) and photos in a private storage bucket. Your case page lives at a private
          link with no login, so keep the link to yourself. We never sell your information. We advertise on Google and Meta
          (Instagram and Facebook). Those companies know you tapped an ad, as with any ad, but our site runs no ad pixels or
          tracking code from them. The only analytics is PostHog, described above.
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
