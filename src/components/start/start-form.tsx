"use client";

import { ArrowLeft, ArrowRight, Building2, Camera, Check, Minus, Plus, Users, X } from "lucide-react";
import Link from "next/link";
import { unstable_isUnrecognizedActionError, unstable_rethrow } from "next/navigation";
import { startTransition, useActionState, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createCaseAction, type StartState } from "@/app/start/actions";
import { Logo } from "@/components/brand/logo";
import { IssueIcon } from "@/components/issue-icon";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Field, Input, MoneyInput, Textarea } from "@/components/ui/field";
import type { AddressMatch } from "@/lib/building/types";
import { resizeImage } from "@/lib/client/resize-image";
import { useToday } from "@/lib/client/use-today";
import { ISSUE_TYPES, REPORT_CHANNELS, type IssueTypeId, type ReportChannelId } from "@/lib/domain/issues";

type Fields = {
  address: string;
  unit: string;
  borough: string;
  bbl: string;
  bin: string;
  issueType: IssueTypeId | "";
  issueDescription: string;
  startedOn: string;
  firstReportedOn: string;
  firstReportedVia: ReportChannelId | "";
  priorFollowups: number;
  mgmtName: string;
  mgmtEmail: string;
  tenantName: string;
  monthlyRent: string;
  tenantContact: string;
  sendMode: "abate" | "self" | "";
  tenantEmail: string;
  sendAuthorized: boolean;
  aiConsent: boolean;
  invite: string;
};

const EMPTY: Fields = {
  address: "",
  unit: "",
  borough: "",
  bbl: "",
  bin: "",
  issueType: "",
  issueDescription: "",
  startedOn: "",
  firstReportedOn: "",
  firstReportedVia: "",
  priorFollowups: 0,
  mgmtName: "",
  mgmtEmail: "",
  tenantName: "",
  monthlyRent: "",
  tenantContact: "",
  sendMode: "",
  tenantEmail: "",
  sendAuthorized: false,
  aiConsent: false,
  invite: "",
};

type Photo = { id: string; file: File; url: string };

const STEPS = [
  { title: "Where do you live?", subtitle: "We'll look up your building's record with the city.", fields: ["address", "unit"] },
  { title: "What needs fixing?", subtitle: "Pick the closest match. Add a photo so there's a record.", fields: ["issueType", "issueDescription", "startedOn", "photos"] },
  { title: "Who have you told?", subtitle: "The clock for what you may be owed starts when management was told.", fields: ["firstReportedOn", "firstReportedVia", "priorFollowups", "mgmtName", "mgmtEmail"] },
  { title: "Who should send the follow-ups?", subtitle: "Either way, Abate writes every message and times each step.", fields: ["sendMode", "tenantEmail", "sendAuthorized"] },
  { title: "Last few details", subtitle: "We use these to sign your messages and estimate what you may be owed.", fields: ["tenantName", "monthlyRent", "tenantContact", "aiConsent"] },
] as const;

const MAX_PHOTOS = 4;
// The whole submission must stay under the 4MB server action limit (Vercel caps bodies at 4.5MB).
const MAX_TOTAL_PHOTO_BYTES = 3_400_000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateStep(step: number, f: Fields, photos: Photo[], today: string): Record<string, string> {
  const e: Record<string, string> = {};
  if (step === 0) {
    if (f.address.trim().length < 5) e.address = "Enter your street address.";
  }
  if (step === 1) {
    if (!f.issueType) e.issueType = "Choose what needs fixing.";
    if (!f.startedOn) e.startedOn = "Pick the date it started (a guess is fine).";
    else if (today && f.startedOn > today) e.startedOn = "That date is in the future.";
    if (photos.length === 0) e.photos = "Add at least one photo of the problem.";
  }
  if (step === 2) {
    if (!f.firstReportedOn) e.firstReportedOn = "Pick the date you first told them.";
    else if (today && f.firstReportedOn > today) e.firstReportedOn = "That date is in the future.";
    else if (f.startedOn && f.firstReportedOn < f.startedOn) e.firstReportedOn = "This is before the problem started.";
    if (!f.firstReportedVia) e.firstReportedVia = "Choose how you told them.";
    if (f.mgmtEmail.trim() && !EMAIL.test(f.mgmtEmail.trim())) e.mgmtEmail = "That email doesn't look right.";
  }
  if (step === 3) {
    if (!f.sendMode) e.sendMode = "Choose who sends the follow-ups.";
    if (f.sendMode === "abate") {
      if (!EMAIL.test(f.tenantEmail.trim())) e.tenantEmail = "Add your email so we can copy you on every message.";
      if (!f.sendAuthorized) e.sendAuthorized = "Please confirm we can email management for you.";
    }
  }
  if (step === 4) {
    if (f.tenantName.trim().length < 2) e.tenantName = "Enter the name you sign messages with.";
    const rent = Number(f.monthlyRent.replace(/[$,\s]/g, ""));
    if (!rent || rent <= 0) e.monthlyRent = "Enter your monthly rent.";
    if (!f.aiConsent) e.aiConsent = "Please agree so we can set up your case.";
  }
  return e;
}

function stepOfField(field: string): number {
  const i = STEPS.findIndex((s) => (s.fields as readonly string[]).includes(field));
  return i === -1 ? 0 : i;
}

export function StartForm() {
  const submittedRef = useRef(false);
  const [step, setStep] = useState(0);
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const today = useToday();
  const [state, formAction, pending] = useActionState<StartState, FormData>(async (prev, fd) => {
    let result: StartState;
    try {
      result = await createCaseAction(prev, fd);
    } catch (err) {
      // Let the success redirect through; anything else (a dropped connection, a body the server
      // rejected, a deploy that replaced this page's actions) must not wipe four steps of answers.
      unstable_rethrow(err);
      submittedRef.current = false;
      return {
        message: unstable_isUnrecognizedActionError(err)
          ? "Abate was just updated. Your answers are still here: reload the page, then tap Create my case again."
          : "We couldn't reach Abate. Your answers are still here. Check your connection and tap Create my case again.",
      };
    }
    // Server-side validation errors: jump back to the first step that has one.
    if (result.errors) {
      const errs = result.errors;
      submittedRef.current = false;
      startTransition(() => {
        setErrors(errs);
        const first = Math.min(...Object.keys(errs).map(stepOfField));
        setStep(Number.isFinite(first) ? first : 0);
      });
    } else if (result.message) {
      submittedRef.current = false;
    }
    return result;
  }, {});
  const [inviteBuilding, setInviteBuilding] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Neighbor invites: /start?invite=CODE prefills the building.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("invite")?.toUpperCase();
    if (!code) return;
    const controller = new AbortController();
    fetch(`/api/invite?code=${encodeURIComponent(code)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: { building: { address: string; borough: string | null; bbl: string | null; bin: string | null } | null }) => {
        if (!data.building) return;
        setInviteBuilding(data.building.address);
        setFields((f) =>
          f.address
            ? f
            : { ...f, invite: code, address: data.building!.address, borough: data.building!.borough ?? "", bbl: data.building!.bbl ?? "", bin: data.building!.bin ?? "" },
        );
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // Next keeps visited pages mounted but hidden; clear the form once a case was created.
  useLayoutEffect(() => {
    return () => {
      if (!submittedRef.current) return;
      submittedRef.current = false;
      setFields(EMPTY);
      setPhotos([]);
      setStep(0);
      setErrors({});
    };
  }, []);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [step]);

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => {
    setFields((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      if (!e[key as string]) return e;
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  };

  const next = () => {
    const e = validateStep(step, fields, photos, today);
    setErrors(e);
    if (Object.keys(e).length > 0) {
      // Move focus to the first problem (on a phone it's often below the fold) so it's seen and read out.
      requestAnimationFrame(() => {
        const target = document.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"] input, [data-invalid="true"] button');
        target?.focus({ preventScroll: true });
        (target ?? document.querySelector('[role="alert"]'))?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }
    if (step < STEPS.length - 1) setStep(step + 1);
    else submit();
  };

  const submit = () => {
    const fd = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if ((key === "tenantEmail" || key === "sendAuthorized") && fields.sendMode !== "abate") continue;
      if (key === "aiConsent" || key === "sendAuthorized") {
        if (value) fd.append(key, "on");
      } else if (key === "monthlyRent") {
        fd.append(key, String(value).replace(/[$,\s]/g, ""));
      } else {
        fd.append(key, String(value));
      }
    }
    for (const p of photos) fd.append("photos", p.file);
    submittedRef.current = true;
    startTransition(() => formAction(fd));
  };

  const current = STEPS[step];

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="sticky top-0 z-20 bg-mist/90 px-5 pb-3 pt-4 backdrop-blur">
        <div className="flex items-center justify-between">
          {step === 0 ? (
            <Link href="/" aria-label="Abate home" className="-ml-1 rounded-xl p-1">
              <Logo />
            </Link>
          ) : (
            <button type="button" onClick={() => setStep(step - 1)} className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold hover:bg-lavender">
              <ArrowLeft className="size-4" aria-hidden="true" /> Back
            </button>
          )}
          <span className="text-sm font-semibold text-slate">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>
        <div className="mt-3 flex gap-1.5" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-300", i <= step ? "bg-ink" : "bg-periwinkle-soft")} />
          ))}
        </div>
      </header>

      <main className="flex-1 px-5 pb-32 pt-4">
        <div key={step} className="animate-rise">
          <h1 ref={headingRef} tabIndex={-1} className="text-[28px] font-bold leading-tight tracking-tight outline-none">
            {current.title}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-slate">{current.subtitle}</p>

          {state.message && !pending && (!state.errors || Object.values(errors).some(Boolean)) ? (
            <Notice tone="bad" className="mt-5">
              {state.message}
            </Notice>
          ) : null}

          <div className="mt-7 space-y-6">
            {step === 0 ? (
              <>
                {inviteBuilding ? (
                  <Notice icon={<Users className="size-5" />}>
                    A neighbor invited you, so we filled in your building. Add your apartment number below.
                  </Notice>
                ) : null}
                <AddressField
                  value={fields.address}
                  selected={Boolean(fields.bbl)}
                  error={errors.address}
                  onType={(address) => setFields((f) => ({ ...f, address, borough: "", bbl: "", bin: "" }))}
                  onPick={(m) => {
                    setFields((f) => ({ ...f, address: `${m.street}, ${m.borough}, NY${m.zip ? ` ${m.zip}` : ""}`, borough: m.borough, bbl: m.bbl ?? "", bin: m.bin ?? "" }));
                    setErrors((e) => ({ ...e, address: "" }));
                  }}
                />
                <Field label="Apartment" htmlFor="unit" optional hint="So your landlord knows exactly which unit.">
                  <Input id="unit" value={fields.unit} onChange={(e) => set("unit", e.target.value)} placeholder="e.g. 4B" autoComplete="address-line2" maxLength={20} />
                </Field>
              </>
            ) : null}

            {step === 1 ? (
              <>
                <fieldset data-invalid={errors.issueType ? "true" : undefined} aria-describedby={errors.issueType ? "issueType-error" : undefined}>
                  <legend className="text-[15px] font-semibold">What&apos;s wrong?</legend>
                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    {ISSUE_TYPES.map((t) => {
                      const active = fields.issueType === t.id;
                      return (
                        <label
                          key={t.id}
                          className={cn(
                            "flex min-h-[88px] cursor-pointer flex-col items-start justify-between gap-2 rounded-2xl bg-white p-3.5 text-left text-[14px] font-semibold leading-snug ring-1 transition",
                            "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink",
                            active ? "ring-2 ring-ink shadow-[var(--shadow-card)]" : "ring-line hover:ring-periwinkle",
                          )}
                        >
                          <input type="radio" name="issueType" value={t.id} checked={active} onChange={() => set("issueType", t.id)} className="sr-only" />
                          <span className={cn("grid size-9 place-items-center rounded-xl", active ? "bg-ink text-white" : "bg-lavender text-ink")}>
                            <IssueIcon type={t.id} />
                          </span>
                          {t.label}
                        </label>
                      );
                    })}
                  </div>
                  {errors.issueType ? (
                    <p id="issueType-error" role="alert" className="mt-2 text-sm font-medium text-bad">
                      {errors.issueType}
                    </p>
                  ) : null}
                </fieldset>

                <Field label="Describe it in a sentence" htmlFor="issueDescription" optional hint="This goes into your messages, so keep it factual.">
                  <Textarea
                    id="issueDescription"
                    value={fields.issueDescription}
                    onChange={(e) => set("issueDescription", e.target.value)}
                    placeholder="e.g. Radiators are cold and there's no hot water in the bathroom."
                    maxLength={500}
                    rows={3}
                  />
                </Field>

                <Field label="When did it start?" htmlFor="startedOn" error={errors.startedOn} hint="Your best guess is fine.">
                  <Input id="startedOn" type="date" value={fields.startedOn} max={today || undefined} onChange={(e) => set("startedOn", e.target.value)} aria-invalid={Boolean(errors.startedOn)} />
                </Field>

                <PhotoPicker photos={photos} setPhotos={setPhotos} error={errors.photos} clearError={() => setErrors((e) => ({ ...e, photos: "" }))} />
              </>
            ) : null}

            {step === 2 ? (
              <>
                <Field label="When did you first tell management?" htmlFor="firstReportedOn" error={errors.firstReportedOn}>
                  <Input
                    id="firstReportedOn"
                    type="date"
                    value={fields.firstReportedOn}
                    min={fields.startedOn || undefined}
                    max={today || undefined}
                    onChange={(e) => set("firstReportedOn", e.target.value)}
                    aria-invalid={Boolean(errors.firstReportedOn)}
                  />
                </Field>

                <fieldset data-invalid={errors.firstReportedVia ? "true" : undefined} aria-describedby={errors.firstReportedVia ? "firstReportedVia-error" : undefined}>
                  <legend className="text-[15px] font-semibold">How did you tell them?</legend>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {REPORT_CHANNELS.map((c) => {
                      const active = fields.firstReportedVia === c.id;
                      return (
                        <label
                          key={c.id}
                          className={cn(
                            "inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold ring-1 transition",
                            "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink",
                            active ? "bg-ink text-white ring-ink" : "bg-white ring-line hover:ring-periwinkle",
                          )}
                        >
                          <input type="radio" name="firstReportedVia" value={c.id} checked={active} onChange={() => set("firstReportedVia", c.id)} className="sr-only" />
                          {active ? <Check className="size-4" aria-hidden="true" /> : null}
                          {c.label}
                        </label>
                      );
                    })}
                  </div>
                  {errors.firstReportedVia ? (
                    <p id="firstReportedVia-error" role="alert" className="mt-2 text-sm font-medium text-bad">
                      {errors.firstReportedVia}
                    </p>
                  ) : null}
                </fieldset>

                <div className="space-y-2">
                  <p className="text-[15px] font-semibold" id="followups-label">
                    How many times have you followed up since?
                  </p>
                  <div className="flex items-center gap-4" role="group" aria-labelledby="followups-label">
                    <button type="button" aria-label="One fewer" onClick={() => set("priorFollowups", Math.max(0, fields.priorFollowups - 1))} className="grid size-12 place-items-center rounded-full bg-white ring-1 ring-line hover:bg-lavender">
                      <Minus className="size-5" />
                    </button>
                    <span className="min-w-12 text-center text-2xl font-bold tabular-nums" aria-live="polite">
                      {fields.priorFollowups}
                    </span>
                    <button type="button" aria-label="One more" onClick={() => set("priorFollowups", Math.min(99, fields.priorFollowups + 1))} className="grid size-12 place-items-center rounded-full bg-white ring-1 ring-line hover:bg-lavender">
                      <Plus className="size-5" />
                    </button>
                  </div>
                  <p className="text-sm text-slate">Texts, calls, emails, knocking on the super&apos;s door: it all counts.</p>
                </div>

                <Field label="Management company or landlord" htmlFor="mgmtName" optional>
                  <Input id="mgmtName" value={fields.mgmtName} onChange={(e) => set("mgmtName", e.target.value)} placeholder="e.g. Acme Property Management" autoComplete="off" maxLength={120} />
                </Field>
                <Field label="Their email" htmlFor="mgmtEmail" optional error={errors.mgmtEmail} hint="Every follow-up goes to this address. If you don't have it, leave it blank and we'll help you find it.">
                  <Input id="mgmtEmail" type="email" inputMode="email" value={fields.mgmtEmail} onChange={(e) => set("mgmtEmail", e.target.value)} placeholder="repairs@example.com" autoComplete="off" maxLength={200} aria-invalid={Boolean(errors.mgmtEmail)} />
                </Field>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <fieldset data-invalid={errors.sendMode ? "true" : undefined} aria-describedby={errors.sendMode ? "sendMode-error" : undefined} className="space-y-3">
                  <legend className="sr-only">Who sends the follow-ups</legend>
                  {(
                    [
                      {
                        id: "abate",
                        title: "Abate's team sends them for me",
                        body: "You approve every message first. We email management from our team address, copy you on everything, and keep the record. You can pause anytime.",
                      },
                      {
                        id: "self",
                        title: "I'll send them myself",
                        body: "We draft each message and tell you when it's time. You send it from your own email.",
                      },
                    ] as const
                  ).map((o) => {
                    const active = fields.sendMode === o.id;
                    return (
                      <label
                        key={o.id}
                        className={cn(
                          "flex cursor-pointer gap-3 rounded-2xl bg-white p-4 ring-1 transition",
                          "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink",
                          active ? "ring-2 ring-ink shadow-[var(--shadow-card)]" : "ring-line hover:ring-periwinkle",
                        )}
                      >
                        <input
                      type="radio"
                      name="sendMode"
                      value={o.id}
                      checked={active}
                      onChange={() =>
                        // Switching to self-send drops the Abate-only answers, so they can't block submitting.
                        o.id === "self" ? setFields((f) => ({ ...f, sendMode: "self", tenantEmail: "", sendAuthorized: false })) : set("sendMode", o.id)
                      }
                      className="mt-1 size-5 shrink-0 accent-[#08014E]"
                    />
                        <span>
                          <span className="block font-semibold">{o.title}</span>
                          <span className="mt-1 block text-[14px] leading-relaxed text-slate">{o.body}</span>
                        </span>
                      </label>
                    );
                  })}
                  {errors.sendMode ? (
                    <p id="sendMode-error" role="alert" className="text-sm font-medium text-bad">
                      {errors.sendMode}
                    </p>
                  ) : null}
                </fieldset>

                {fields.sendMode === "abate" ? (
                  <>
                    <Field label="Your email" htmlFor="tenantEmail" error={errors.tenantEmail} hint="We copy you on every message we send, so you see exactly what management gets.">
                      <Input id="tenantEmail" type="email" inputMode="email" value={fields.tenantEmail} onChange={(e) => set("tenantEmail", e.target.value)} autoComplete="email" maxLength={200} aria-invalid={Boolean(errors.tenantEmail)} />
                    </Field>
                    <label className={cn("flex gap-3 rounded-2xl bg-white p-4 ring-1", errors.sendAuthorized ? "ring-bad" : "ring-line")}>
                      <input
                        type="checkbox"
                        checked={fields.sendAuthorized}
                        onChange={(e) => set("sendAuthorized", e.target.checked)}
                        aria-invalid={Boolean(errors.sendAuthorized)}
                        aria-describedby={errors.sendAuthorized ? "sendAuthorized-error" : undefined}
                        className="mt-0.5 size-5 shrink-0 accent-[#08014E]"
                      />
                      <span className="text-[14px] leading-relaxed text-slate">
                        <span className="font-semibold text-ink">I authorize Abate</span> to email {fields.mgmtName.trim() || "my building's management"} about this repair on my behalf.
                        I&apos;ll approve each message before it&apos;s sent.
                      </span>
                    </label>
                    {errors.sendAuthorized ? (
                      <p id="sendAuthorized-error" role="alert" className="-mt-3 text-sm font-medium text-bad">
                        {errors.sendAuthorized}
                      </p>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}

            {step === 4 ? (
              <>
                <Field label="Your name" htmlFor="tenantName" error={errors.tenantName} hint="Messages are signed with it.">
                  <Input id="tenantName" value={fields.tenantName} onChange={(e) => set("tenantName", e.target.value)} autoComplete="name" maxLength={120} aria-invalid={Boolean(errors.tenantName)} />
                </Field>
                <Field label="Monthly rent" htmlFor="monthlyRent" error={errors.monthlyRent} hint="Only used to estimate what you may be owed. It never goes in a message unless you add it.">
                  <MoneyInput id="monthlyRent" value={fields.monthlyRent} onChange={(e) => set("monthlyRent", e.target.value)} placeholder="1,850" aria-invalid={Boolean(errors.monthlyRent)} />
                </Field>
                <Field label="Phone or email for reminders" htmlFor="tenantContact" optional hint="Our team will remind you when your next step is ready. We never share it.">
                  <Input id="tenantContact" value={fields.tenantContact} onChange={(e) => set("tenantContact", e.target.value)} autoComplete="tel" maxLength={120} />
                </Field>
                <label className={cn("flex gap-3 rounded-2xl bg-white p-4 ring-1", errors.aiConsent ? "ring-bad" : "ring-line")}>
                  <input
                    type="checkbox"
                    checked={fields.aiConsent}
                    onChange={(e) => set("aiConsent", e.target.checked)}
                    aria-invalid={Boolean(errors.aiConsent)}
                    aria-describedby={errors.aiConsent ? "aiConsent-error" : undefined}
                    className="mt-0.5 size-5 shrink-0 accent-[#08014E]"
                  />
                  <span className="text-[14px] leading-relaxed text-slate">
                    <span className="font-semibold text-ink">I agree.</span> Abate can use what I share to draft my messages. Our team reads every reply from
                    management, and an outside AI service (Anthropic&apos;s Claude) also reads each reply so we can compare it with our team. Abate isn&apos;t a law
                    firm, and estimates aren&apos;t legal advice.
                  </span>
                </label>
                {errors.aiConsent ? (
                  <p id="aiConsent-error" role="alert" className="-mt-3 text-sm font-medium text-bad">
                    {errors.aiConsent}
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line/70 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-md px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button type="button" size="lg" block onClick={next} loading={pending}>
            {step < STEPS.length - 1 ? (
              <>
                Continue <ArrowRight className="size-5" aria-hidden="true" />
              </>
            ) : pending ? (
              "Creating your case…"
            ) : (
              "Create my case"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AddressField({
  value,
  selected,
  error,
  onType,
  onPick,
}: {
  value: string;
  selected: boolean;
  error?: string;
  onType: (v: string) => void;
  onPick: (m: AddressMatch) => void;
}) {
  const [matches, setMatches] = useState<AddressMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [lookup, setLookup] = useState<"idle" | "results" | "empty" | "error">("idle");
  const typedRef = useRef(false);

  useEffect(() => {
    if (!typedRef.current) return;
    const q = value.trim();
    if (q.length < 3 || selected) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/address?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((data: { matches: AddressMatch[] }) => {
          const found = data.matches ?? [];
          setMatches(found);
          setActive(-1);
          setOpen(true);
          setLookup(found.length > 0 ? "results" : "empty");
        })
        .catch((err: unknown) => {
          if (!(err instanceof DOMException && err.name === "AbortError")) setLookup("error");
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, selected]);

  const searching = value.trim().length >= 3 && !selected;
  const visible = searching ? matches : [];
  const listShown = open && visible.length > 0;
  const lookupNote =
    !searching || loading
      ? ""
      : lookup === "empty"
        ? "No match found. Check the spelling, or continue with what you typed."
        : lookup === "error"
          ? "Address lookup isn't working right now. You can continue with what you typed."
          : "";

  const pick = (m: AddressMatch) => {
    onPick(m);
    setOpen(false);
    setMatches([]);
  };

  return (
    <Field
      label="Street address"
      htmlFor="address"
      error={error || null}
      hint={selected ? undefined : "Start typing and pick your building from the list."}
    >
      <div className="relative">
        <Input
          id="address"
          role="combobox"
          aria-expanded={listShown}
          aria-controls={listShown ? "address-options" : undefined}
          aria-describedby={error || !selected ? "address-desc" : undefined}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `address-option-${active}` : undefined}
          aria-invalid={Boolean(error)}
          value={value}
          placeholder="e.g. 245 East 7th Street"
          autoComplete="address-line1"
          onChange={(e) => {
            typedRef.current = true;
            onType(e.target.value);
          }}
          onFocus={() => visible.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!open && e.key === "ArrowDown" && visible.length > 0) {
              e.preventDefault();
              setOpen(true);
              return;
            }
            if (!open || visible.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(visible.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter" && active >= 0) {
              e.preventDefault();
              pick(visible[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          className="pr-10"
        />
        {loading ? <span className="absolute right-4 top-1/2 size-4 -translate-y-1/2 animate-spin rounded-full border-2 border-periwinkle border-t-ink" aria-hidden="true" /> : null}
        {listShown ? (
          <ul id="address-options" role="listbox" className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl bg-white shadow-[var(--shadow-lift)] ring-1 ring-line">
            {visible.map((m, i) => (
              <li
                key={`${m.label}-${i}`}
                id={`address-option-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(m);
                }}
                className={cn("flex cursor-pointer items-start gap-3 px-4 py-3 text-[15px]", i === active ? "bg-lavender" : "hover:bg-mist")}
              >
                <Building2 className="mt-0.5 size-4 shrink-0 text-slate" aria-hidden="true" />
                <span>
                  <span className="font-semibold">{m.street}</span>
                  <span className="block text-sm text-slate">
                    {m.borough}
                    {m.zip ? `, ${m.zip}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <p role="status" aria-live="polite" className={lookupNote ? "text-sm font-medium text-warn" : "sr-only"}>
        {lookupNote || (listShown ? `${visible.length} ${visible.length === 1 ? "building" : "buildings"} found. Use the arrow keys to choose.` : "")}
      </p>
      {selected ? (
        <p className="flex items-center gap-1.5 text-sm font-medium text-good">
          <Check className="size-4" aria-hidden="true" /> Found your building in NYC records
        </p>
      ) : null}
    </Field>
  );
}

function PhotoPicker({
  photos,
  setPhotos,
  error,
  clearError,
}: {
  photos: Photo[];
  setPhotos: (fn: (p: Photo[]) => Photo[]) => void;
  error?: string;
  clearError: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const add = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setProblem(null);
    const room = MAX_PHOTOS - photos.length;
    let total = photos.reduce((sum, p) => sum + p.file.size, 0);
    const picked = Array.from(files).slice(0, room);
    for (const file of picked) {
      try {
        const small = await resizeImage(file);
        if (total + small.size > MAX_TOTAL_PHOTO_BYTES) {
          setProblem("That photo is too large to add. Try a different one, or remove one first.");
          continue;
        }
        total += small.size;
        const photo = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file: small, url: URL.createObjectURL(small) };
        setPhotos((p) => [...p, photo]);
        clearError();
      } catch (err) {
        setProblem(err instanceof Error ? err.message : "We couldn't add that photo.");
      }
    }
    if (files.length > room) setProblem(`You can add up to ${MAX_PHOTOS} photos.`);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const remove = (id: string) =>
    setPhotos((p) => {
      const gone = p.find((x) => x.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return p.filter((x) => x.id !== id);
    });

  return (
    <div className="space-y-2" data-invalid={error ? "true" : undefined}>
      <p className="text-[15px] font-semibold">Photos</p>
      <div className="grid grid-cols-3 gap-2.5">
        {photos.map((p) => (
          <div key={p.id} className="relative aspect-square overflow-hidden rounded-2xl bg-lavender ring-1 ring-line">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
            <img src={p.url} alt="Photo of the problem" className="size-full object-cover" />
            {/* 44px tap target around a small visible circle */}
            <button type="button" onClick={() => remove(p.id)} aria-label="Remove photo" className="absolute right-0 top-0 grid size-11 place-items-center">
              <span className="grid size-7 place-items-center rounded-full bg-ink/80 text-white">
                <X className="size-4" />
              </span>
            </button>
          </div>
        ))}
        {photos.length < MAX_PHOTOS ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className={cn(
              "flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed bg-white text-sm font-semibold transition hover:bg-lavender",
              error ? "border-bad text-bad" : "border-periwinkle text-ink",
            )}
          >
            {busy ? <span className="size-5 animate-spin rounded-full border-2 border-periwinkle border-t-ink" /> : <Camera className="size-6" aria-hidden="true" />}
            {photos.length === 0 ? "Add photo" : "Add more"}
          </button>
        ) : null}
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} onChange={(e) => add(e.target.files)} aria-label="Choose photos" />
      {error ? (
        <p role="alert" className="text-sm font-medium text-bad">
          {error}
        </p>
      ) : problem ? <p className="text-sm font-medium text-warn">{problem}</p> : <p className="text-sm text-slate">Up to {MAX_PHOTOS}. They stay private to your case.</p>}
    </div>
  );
}
