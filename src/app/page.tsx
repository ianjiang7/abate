import { Lock, Plus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { daysBetween } from "@/lib/domain/dates";
import { estimateAbatement } from "@/lib/domain/estimate";
import { buildMessage, type TemplateContext } from "@/lib/domain/templates";

// Layout, spacing and type scale follow Monzo's site (the team's pick, Oct 28): big plain headings,
// one pill button, soft tinted blocks, an accordion FAQ. Abate's own colors, font and words.

/** The one call to action. Same words in the header, the hero and at the bottom. */
const START = "Start my case";

const TEAM = ["Ilias", "Rayhan", "Ian", "Omar"];

export default function Home() {
  return (
    <div className="bg-white">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-5">
          <Logo />
          <div className="flex items-center gap-7">
            <nav aria-label="On this page" className="hidden items-center gap-7 text-[15px] font-medium text-slate md:flex">
              <a href="#how-it-works" className="hover:text-ink">
                How it works
              </a>
              <a href="#sample" className="hover:text-ink">
                Sample letter
              </a>
              <a href="#who-we-are" className="hover:text-ink">
                Who we are
              </a>
              <a href="#questions" className="hover:text-ink">
                Questions
              </a>
            </nav>
            <ButtonLink href="/start" size="sm">
              {START}
            </ButtonLink>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-5 pb-14 pt-12 sm:pt-16 md:pb-20 md:pt-24">
          <h1 className="max-w-4xl text-[44px] font-bold leading-[1.02] tracking-[-0.03em] text-balance sm:text-6xl md:text-[76px]">
            Repair still not fixed? We&apos;ll do the chasing.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate text-pretty sm:text-xl">
            Tell us what&apos;s broken. We&apos;ll send management written follow-ups on a schedule, and nothing goes out until
            you approve it. It&apos;s free for NYC renters while we pilot it.
          </p>
          <div className="mt-9">
            <ButtonLink href="/start" size="lg" block className="sm:w-auto">
              {START}
            </ButtonLink>
            <PrivacyPromise />
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-5xl scroll-mt-20 px-5">
          <div className="rounded-[2rem] bg-lavender px-6 py-10 sm:px-10 sm:py-12 md:px-14 md:py-16">
            <h2 className="text-[32px] font-bold leading-tight tracking-tight md:text-5xl">How it works</h2>
            <ol className="mt-8 grid gap-9 md:mt-12 md:grid-cols-3 md:gap-10">
              <Step n={1} title="Tell us what's broken">
                The problem, when it started and whether you&apos;ve told management. You&apos;ll see an estimate of the rent you
                may be owed. No account needed.
              </Step>
              <Step n={2} title="Approve each message">
                We draft a notice, a reminder and a formal notice, a few days apart. You approve each one, and our team sends
                it with you copied. Rather send them yourself? You can.
              </Step>
              <Step n={3} title="We read the replies">
                Our team reads what management says back and sets up the next step. Still not fixed after a week? We show you
                how to file a 311 complaint yourself.
              </Step>
            </ol>
          </div>
        </section>

        <section id="sample" className="scroll-mt-20 py-16 md:py-24">
          <div className="mx-auto grid max-w-5xl gap-8 px-5 md:grid-cols-[2fr_3fr] md:gap-14">
            <div>
              <h2 className="text-[32px] font-bold leading-tight tracking-tight md:text-5xl">What management receives</h2>
              <p className="mt-4 text-lg leading-relaxed text-slate">
                Every message sticks to the facts: what&apos;s broken, since when, and a request for a repair date. Here&apos;s a
                first notice our team would send, with made-up details.
              </p>
            </div>
            <SampleNotice />
          </div>
        </section>

        <section id="who-we-are" className="scroll-mt-20 bg-mist py-16 md:py-24">
          <div className="mx-auto grid max-w-5xl gap-12 px-5 md:grid-cols-2 md:gap-14">
            <div>
              <h2 className="text-[32px] font-bold leading-tight tracking-tight md:text-5xl">Who we are</h2>
              <p className="mt-4 text-lg leading-relaxed text-slate">
                We&apos;re Ilias, Rayhan, Ian and Omar, four students at NYU Stern. This fall we interviewed 13 NYC tenants
                about getting repairs done. Reporting the problem was rarely the hard part. Chasing it afterward was.
              </p>
              <p className="mt-4 text-lg leading-relaxed text-slate">
                So that&apos;s the part we take on. While we pilot Abate, one of us reads every reply and sends every message
                you approve.
              </p>
              <ul className="mt-8 flex flex-wrap gap-6">
                {TEAM.map((name) => (
                  <li key={name} className="flex flex-col items-center gap-2">
                    <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-ink text-xl font-bold text-white">
                      {name[0]}
                    </span>
                    <span className="text-sm font-semibold">{name}</span>
                  </li>
                ))}
              </ul>
            </div>
            <figure className="md:self-center">
              <blockquote className="border-l-4 border-periwinkle pl-5 text-2xl font-semibold leading-snug tracking-tight text-balance md:text-3xl">
                &ldquo;We had green water in our bathroom sink for a week before the landlord even responded to us.&rdquo;
              </blockquote>
              <figcaption className="mt-4 pl-6 text-[15px] text-slate">A tenant we interviewed</figcaption>
            </figure>
          </div>
        </section>

        <section id="questions" className="scroll-mt-20 py-16 md:py-24">
          <div className="mx-auto grid max-w-5xl gap-8 px-5 md:grid-cols-[2fr_3fr] md:gap-14">
            <h2 className="text-[32px] font-bold leading-tight tracking-tight md:text-5xl">Questions</h2>
            <div className="border-t border-line">
              <Question q="Is it free?">
                Yes. The follow-ups are free while we pilot Abate, and there&apos;s no card to enter.
              </Question>
              <Question q="Is this legal advice?">
                No. We&apos;re students, not lawyers, and Abate isn&apos;t a law firm. Our messages stick to the facts and ask for
                a repair date. Any dollar figure we show is an estimate of the rent you may be owed, not a promise.
              </Question>
              <Question q="Will management know it's me?">
                Yes. They need to know whose apartment needs the repair, so every message names you and your unit. When our
                team sends them, they come from Abate, say we&apos;re writing on your behalf, and copy you. Nothing goes out
                until you approve it, and you can pause anytime. If you&apos;d rather, you can send each one yourself from your
                own email.
              </Question>
              <Question q="What happens to my information?">
                Our four-person team reads your case, and management sees only the messages you approve or send yourself. We
                never sell or share your information, and we delete it when the pilot ends.{" "}
                <Link href="/privacy" className="font-semibold text-ink underline decoration-periwinkle underline-offset-4">
                  Our privacy page
                </Link>{" "}
                lists what we collect and who sees it, including the AI service that reads replies.
              </Question>
            </div>
          </div>
        </section>

        <section className="bg-ink text-white">
          <div className="mx-auto max-w-5xl px-5 py-16 md:py-24">
            <h2 className="max-w-2xl text-[32px] font-bold leading-tight tracking-tight text-balance md:text-5xl">
              Done chasing management yourself?
            </h2>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-periwinkle-soft">
              It takes a few minutes. You approve every message, and you can pause anytime.
            </p>
            <div className="mt-8">
              <ButtonLink href="/start" size="lg" variant="secondary" block className="sm:w-auto">
                {START}
              </ButtonLink>
              <PrivacyPromise onDark />
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-ink">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 border-t border-white/15 px-5 py-8 text-sm text-periwinkle sm:flex-row sm:justify-between">
          <p>Abate is a student project at NYU Stern, piloting with NYC tenants.</p>
          <p>
            Not a law firm. Nothing here is legal advice. ·{" "}
            <Link href="/privacy" className="underline underline-offset-4 hover:text-white">
              Privacy
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

/** Under every Start button. Only claims the privacy page already makes. */
function PrivacyPromise({ onDark = false }: { onDark?: boolean }) {
  return (
    <p className={cn("mt-4 flex gap-2 text-[15px] leading-snug", onDark ? "text-periwinkle-soft" : "text-slate")}>
      <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        Never sold or shared. Deleted when the pilot ends.{" "}
        <Link href="/privacy" className={cn("font-semibold underline decoration-periwinkle underline-offset-4", onDark ? "text-white" : "text-ink")}>
          How we keep it private
        </Link>
      </span>
    </p>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li>
      <p className="text-5xl font-bold leading-none tracking-tight">{n}</p>
      <h3 className="mt-4 text-xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 leading-relaxed text-slate">{children}</p>
    </li>
  );
}

function Question({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group border-b border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-lg font-semibold [&::-webkit-details-marker]:hidden">
        {q}
        <Plus className="size-5 shrink-0 transition-transform group-open:rotate-45" aria-hidden="true" />
      </summary>
      <p className="pb-6 pr-9 leading-relaxed text-slate">{children}</p>
    </details>
  );
}

// A first notice from the real template, with made-up details. Fixed dates, so the page never reads
// the clock while prerendering. No management name, channel or follow-up count, matching the
// shorter start form; no dollar figure, since only half of first notices carry one.
const SAMPLE_TOLD_ON = "2026-10-05";
const SAMPLE_SENT_ON = "2026-10-19";
const SAMPLE: TemplateContext = {
  today: SAMPLE_SENT_ON,
  tenantName: "Jordan Lee",
  address: "123 Example Street, Brooklyn",
  unit: "4B",
  mgmtName: null,
  issueTypes: ["heat"],
  startedOn: "2026-10-02",
  toldBefore: true,
  firstReportedOn: SAMPLE_TOLD_ON,
  firstReportedVia: "other",
  priorFollowups: 0,
  daysSinceReport: daysBetween(SAMPLE_TOLD_ON, SAMPLE_SENT_ON),
  estimate: estimateAbatement({ monthlyRent: 1850, issueTypes: ["heat"], noticeOn: SAMPLE_TOLD_ON, endOn: SAMPLE_SENT_ON }),
  sentOn: {},
  voice: "abate",
  estimateInNotice: false,
};

function SampleNotice() {
  const { subject, body } = buildMessage("notice", SAMPLE);
  return (
    <figure>
      <div className="overflow-hidden rounded-2xl bg-mist ring-1 ring-line">
        <div className="space-y-0.5 border-b border-line/80 bg-white/70 px-4 py-3 text-[13px] text-slate">
          <p>
            <span className="font-semibold text-ink">From:</span> the Abate team
          </p>
          <p>
            <span className="font-semibold text-ink">To:</span> management
          </p>
          <p>
            <span className="font-semibold text-ink">Cc:</span> {SAMPLE.tenantName}, the tenant
          </p>
        </div>
        <div className="px-4 py-4 sm:px-5">
          <p className="font-semibold">{subject}</p>
          <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-ink/90">{body}</p>
        </div>
      </div>
      <figcaption className="mt-3 text-sm text-slate">
        Sample with made-up details. Abate isn&apos;t a law firm, and our messages aren&apos;t legal advice.
      </figcaption>
    </figure>
  );
}
