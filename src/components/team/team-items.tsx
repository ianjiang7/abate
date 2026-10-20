"use client";

import { Check, ClipboardCopy, ExternalLink, Link2, Send } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { classifyAction, logReplyAction, markSentAction, type TeamActionState } from "@/app/team/[key]/actions";
import { REPLY_PLAIN } from "@/components/case/reply-labels";
import { Button, buttonClasses } from "@/components/ui/button";
import { Notice } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToday } from "@/lib/client/use-today";
import { REPLY_CATEGORIES, type ReplyCategory } from "@/lib/domain/ladder";

/** Opens a Gmail compose window in whichever Google account is signed in (use the team inbox). */
function gmailComposeUrl({ to, cc, subject, body }: { to: string | null; cc: string | null; subject: string; body: string }) {
  const q = new URLSearchParams({ view: "cm", fs: "1", su: subject, body });
  if (to) q.set("to", to);
  if (cc) q.set("cc", cc);
  return `https://mail.google.com/mail/?${q.toString()}`;
}

export function SendItem({
  teamKey,
  messageId,
  to,
  cc,
  subject,
  body,
}: {
  teamKey: string;
  messageId: string;
  to: string | null;
  cc: string | null;
  subject: string;
  body: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<TeamActionState>({});

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="font-semibold">To</dt>
        <dd className="break-all text-slate">{to ?? <span className="text-warn">No management email on file. Ask the tenant.</span>}</dd>
        <dt className="font-semibold">Cc</dt>
        <dd className="break-all text-slate">{cc ?? "No tenant email"}</dd>
        <dt className="font-semibold">Subject</dt>
        <dd>{subject}</dd>
      </dl>
      <div className={cn("whitespace-pre-wrap rounded-2xl bg-mist p-4 text-sm leading-relaxed", !open && "max-h-40 overflow-hidden")}>{body}</div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="min-h-11 text-sm font-semibold underline decoration-periwinkle underline-offset-4">
        {open ? "Show less" : "Show the whole message"}
      </button>
      {result.message ? <Notice tone="bad">{result.message}</Notice> : null}
      <div className="flex flex-wrap gap-2">
        <a href={gmailComposeUrl({ to, cc, subject, body })} target="_blank" rel="noreferrer" className={buttonClasses({ variant: "secondary", size: "md" })}>
          <ExternalLink className="size-4" aria-hidden="true" /> Open in Gmail
        </a>
        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          icon={copied ? <Check className="size-4" aria-hidden="true" /> : <ClipboardCopy className="size-4" aria-hidden="true" />}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button
          type="button"
          loading={pending}
          onClick={() => startTransition(async () => setResult(await markSentAction(teamKey, messageId)))}
          icon={<Send className="size-4" aria-hidden="true" />}
        >
          Mark sent
        </Button>
      </div>
    </div>
  );
}

function CategoryFields({ idPrefix, errors }: { idPrefix: string; errors?: Record<string, string> }) {
  const [choice, setChoice] = useState<ReplyCategory | null>(null);
  return (
    <>
      <fieldset className="space-y-2" aria-describedby={errors?.category ? `${idPrefix}-cat-error` : undefined}>
        <legend className="mb-2 text-[15px] font-semibold">What did the reply say?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {REPLY_CATEGORIES.map((c) => (
            <label
              key={c.id}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl bg-white px-4 py-2.5 text-[15px] ring-1 transition",
                choice === c.id ? "ring-2 ring-ink" : "ring-line hover:ring-periwinkle",
              )}
            >
              <input type="radio" name="category" value={c.id} checked={choice === c.id} onChange={() => setChoice(c.id)} className="size-4 accent-[#08014E]" />
              {REPLY_PLAIN[c.id]}
            </label>
          ))}
        </div>
        {errors?.category ? (
          <p id={`${idPrefix}-cat-error`} role="alert" className="text-sm font-medium text-bad">
            {errors.category}
          </p>
        ) : null}
      </fieldset>
      {choice === "scheduled" ? (
        <Field label="Repair date" htmlFor={`${idPrefix}-date`} error={errors?.scheduledFor}>
          <Input id={`${idPrefix}-date`} name="scheduledFor" type="date" required />
        </Field>
      ) : null}
    </>
  );
}

/** Our team's reading of a reply a tenant pasted in. */
export function ClassifyForm({ teamKey, messageId }: { teamKey: string; messageId: string }) {
  const [state, formAction, pending] = useActionState<TeamActionState, FormData>(classifyAction.bind(null, teamKey), {});
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="messageId" value={messageId} />
      <CategoryFields idPrefix={`c-${messageId}`} errors={state.errors} />
      {state.message ? <Notice tone="bad">{state.message}</Notice> : null}
      <Button type="submit" loading={pending}>
        Set the next step
      </Button>
    </form>
  );
}

/** A reply that came into the team inbox. */
export function LogReplyForm({ teamKey, cases }: { teamKey: string; cases: Array<{ code: string; label: string }> }) {
  const [state, formAction, pending] = useActionState<TeamActionState, FormData>(logReplyAction.bind(null, teamKey), {});
  const today = useToday();
  return (
    <form action={formAction} className="space-y-4" key={state.ok ? "done" : "form"}>
      {state.ok ? <Notice tone="good">Logged. The tenant&apos;s next step is ready for them to approve.</Notice> : null}
      <Field label="Case" htmlFor="log-code">
        <select id="log-code" name="code" required className="block min-h-[52px] w-full rounded-2xl border border-line bg-white px-4">
          {cases.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Their reply" htmlFor="log-text" error={state.errors?.text}>
        <Textarea id="log-text" name="text" rows={5} required maxLength={8000} />
      </Field>
      <Field label="Received" htmlFor="log-date" error={state.errors?.receivedOn}>
        <Input id="log-date" name="receivedOn" type="date" defaultValue={today} key={today} max={today || undefined} />
      </Field>
      <CategoryFields idPrefix="log" errors={state.errors} />
      {state.message ? <Notice tone="bad">{state.message}</Notice> : null}
      <Button type="submit" loading={pending}>
        Log the reply
      </Button>
    </form>
  );
}

export function CopyCaseLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(`${window.location.origin}/case/${token}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold hover:bg-lavender"
    >
      {copied ? <Check className="size-4" aria-hidden="true" /> : <Link2 className="size-4" aria-hidden="true" />}
      {copied ? "Copied" : "Copy case link"}
    </button>
  );
}
