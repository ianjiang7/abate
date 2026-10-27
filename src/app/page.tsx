import { ArrowRight, BellRing, CheckCircle2, FileText, Lock, Scale, Send, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="relative overflow-hidden">
      {/* Soft brand glow behind the hero */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(174,180,223,0.55),transparent)]" />

      <header className="relative mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <Logo />
        <Link href="/start" className="rounded-full px-4 py-2 text-sm font-semibold text-ink hover:bg-lavender">
          Start a case
        </Link>
      </header>

      <main className="relative">
        <section className="mx-auto grid max-w-5xl items-center gap-10 px-5 pb-14 pt-6 md:grid-cols-[1.1fr_0.9fr] md:pt-12">
          <div className="animate-rise">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-[13px] font-semibold text-slate ring-1 ring-line">
              <span className="size-1.5 rounded-full bg-good" /> For NYC renters · Free while we pilot
            </p>
            <h1 className="mt-5 text-[40px] font-bold leading-[1.05] tracking-tight text-balance sm:text-5xl md:text-[56px]">
              Repair still not fixed? <span className="text-slate">We&apos;ll do the chasing.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate text-pretty">
              Abate&apos;s team follows up with your landlord for you: timed, written messages you approve, a dated record of
              everything they say, and an estimate of the rent you may be owed back.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <ButtonLink href="/start" size="lg" icon={null}>
                Start your case <ArrowRight className="size-5" aria-hidden="true" />
              </ButtonLink>
              <p className="text-sm text-slate">About 5 minutes · No account · You approve every message</p>
            </div>
          </div>

          <PhonePreview />
        </section>

        <section className="border-y border-line/70 bg-white/70">
          <div className="mx-auto max-w-5xl px-5 py-14">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">How it works</h2>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              <Step n={1} icon={<FileText className="size-5" />} title="Tell us what's broken">
                The problem, when it started, whether you&apos;ve told management yet, and a photo if you have one.
              </Step>
              <Step n={2} icon={<Send className="size-5" />} title="We send every follow-up">
                A written notice, a reminder and a formal notice, each on schedule. You approve each one, and our team sends
                it and copies you. If it still isn&apos;t fixed, we show you how to file with 311 yourself. Rather send them
                yourself? You can.
              </Step>
              <Step n={3} icon={<BellRing className="size-5" />} title="We read their replies">
                When management answers, our team reads it and sets up the right next step, while your estimate of what you
                may be owed grows each day.
              </Step>
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-14">
          <figure className="rounded-[var(--radius-card)] bg-ink p-7 text-white shadow-[var(--shadow-lift)] sm:p-10">
            <blockquote className="text-xl font-medium leading-relaxed text-balance sm:text-2xl">
              &ldquo;We had green water in our bathroom sink for a week before the landlord even responded to us.&rdquo;
            </blockquote>
            <figcaption className="mt-4 text-sm text-periwinkle">An NYC tenant we interviewed</figcaption>
          </figure>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <Trust icon={<ShieldCheck className="size-5" />} title="You stay in control">
              Nothing reaches your landlord until you approve it, and you can pause anytime.
            </Trust>
            <Trust icon={<Lock className="size-5" />} title="Private by default">
              Your case lives at a private link. No account, no password. We never sell your information.{" "}
              <Link href="/privacy" className="font-semibold text-ink underline decoration-periwinkle underline-offset-4">
                How we handle your data
              </Link>
            </Trust>
            <Trust icon={<CheckCircle2 className="size-5" />} title="Facts, not threats">
              Every message sticks to what happened and when. It&apos;s calm, clear and hard to ignore.
            </Trust>
            <Trust icon={<Scale className="size-5" />} title="Not a law firm">
              Estimates use your rent and how long the problem has lasted. They&apos;re not legal advice.
            </Trust>
          </div>

          <div className="mt-12 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-lg font-semibold">Ready when you are.</p>
            <ButtonLink href="/start" size="lg">
              Start your case <ArrowRight className="size-5" aria-hidden="true" />
            </ButtonLink>
          </div>
        </section>
      </main>

      <footer className="border-t border-line/70">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-5 py-8 text-sm text-slate sm:flex-row sm:justify-between">
          <p>Abate is a student project at NYU Stern, piloting with NYC tenants.</p>
          <p>
            Not a law firm. Nothing here is legal advice. ·{" "}
            <Link href="/privacy" className="underline underline-offset-4">
              Privacy
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

function Step({ n, icon, title, children }: { n: number; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] ring-1 ring-line/70">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-lavender text-ink">{icon}</span>
        <span className="text-sm font-semibold text-slate">Step {n}</span>
      </div>
      <h3 className="mt-4 text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 leading-relaxed text-slate">{children}</p>
    </li>
  );
}

function Trust({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 rounded-2xl bg-white p-5 ring-1 ring-line/70">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lavender text-ink">{icon}</span>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-[15px] leading-relaxed text-slate">{children}</p>
      </div>
    </div>
  );
}

/** A static illustration of a case in progress. All details are made up. */
function PhonePreview() {
  const items = [
    { day: "Day 0", title: "Written notice sent", note: "Asked for a repair date", done: true },
    { day: "Day 2", title: "Management replied", note: "“We'll look into it.” Abate asked for a date.", done: true },
    { day: "Day 5", title: "Formal notice", note: "Timeline, building record and estimate included", done: true },
    { day: "Day 6", title: "Repair scheduled", note: "Plumber coming Thursday", done: false },
  ];
  return (
    <div className="animate-rise mx-auto w-full max-w-sm [animation-delay:120ms]" aria-hidden="true">
      <div className="rounded-[2.2rem] bg-ink p-2.5 shadow-[var(--shadow-lift)]">
        <div className="overflow-hidden rounded-[1.8rem] bg-mist">
          <div className="bg-white px-5 pb-4 pt-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate">Your case · Apt 4B</p>
            <p className="mt-1 text-lg font-semibold">No heat or hot water</p>
            <div className="mt-4 rounded-2xl bg-lavender p-4">
              <p className="text-xs font-semibold text-slate">You may be owed so far</p>
              <p className="mt-1 text-[28px] font-bold tracking-tight">$240 – $600</p>
              <p className="text-xs text-slate">Growing about $10–$25 a day</p>
            </div>
          </div>
          <ol className="space-y-0 px-5 py-4">
            {items.map((it, i) => (
              <li key={it.title} className="relative flex gap-3 pb-4 last:pb-0">
                {i < items.length - 1 ? <span className="absolute left-[11px] top-6 h-full w-px bg-line" /> : null}
                <span className={`relative mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${it.done ? "bg-ink text-white" : "bg-white text-ink ring-2 ring-periwinkle"}`}>
                  {it.done ? <CheckCircle2 className="size-4" /> : <span className="size-1.5 rounded-full bg-ink" />}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold">
                    {it.title} <span className="font-medium text-slate">· {it.day}</span>
                  </p>
                  <p className="text-xs leading-snug text-slate">{it.note}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
