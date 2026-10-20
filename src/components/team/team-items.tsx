"use client";

import { AlertTriangle, Check, ClipboardCopy, ExternalLink, Link2, PenLine, Send } from "lucide-react";
import { startTransition, useActionState, useId, useState, useTransition, type FormEvent } from "react";
import { claimAction, classifyAction, logReplyAction, markSentAction, mgmtEmailAction, type TeamActionState } from "@/app/team/[key]/actions";
import { REPLY_PLAIN } from "@/components/case/reply-labels";
import { Button } from "@/components/ui/button";
import { Badge, Notice } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToday } from "@/lib/client/use-today";
import { REPLY_CATEGORIES, type ReplyCategory } from "@/lib/domain/ladder";

/** A Gmail compose window in the team inbox (authuser picks the account when several are signed in). */
function gmailComposeUrl({ inbox, to, cc, subject, body }: { inbox: string | null; to: string | null; cc: string | null; subject: string; body: string }) {
  const q = new URLSearchParams({ view: "cm", fs: "1", su: subject, body });
  if (inbox) q.set("authuser", inbox);
  if (to) q.set("to", to);
  if (cc) q.set("cc", cc);
  return `https://mail.google.com/mail/?${q.toString()}`;
}

/** Submit a form without React's automatic reset, so a server error keeps what was typed. */
function submitWithoutReset(dispatch: (fd: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
}

export function SendItem({
  teamKey,
  messageId,
  code,
  inbox,
  to,
  cc,
  subject,
  body,
  edited,
  draftBody,
  replyAfterApproval,
  needsLegalReview,
}: {
  teamKey: string;
  messageId: string;
  code: string;
  inbox: string | null;
  to: string | null;
  cc: string | null;
  subject: string;
  body: string;
  edited: boolean;
  draftBody: string | null;
  replyAfterApproval: boolean;
  needsLegalReview: boolean;
}) {
  const [open, setOpen] = useState(edited);
  const [showOriginal, setShowOriginal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, startSending] = useTransition();
  const [result, setResult] = useState<TeamActionState>({});

  // Claim the message (re-checks pause, withdrawal and other teammates) before it can be sent.
  const claimThen = (force: boolean, then: () => Promise<void> | void, onRefused?: () => void) =>
    startSending(async () => {
      const r = await claimAction(teamKey, messageId, force);
      setResult(r);
      if (r.ok) await then();
      else onRefused?.();
    });

  const openGmail = (force: boolean) => {
    // Open the window during the click so pop-up blockers allow it, then point it at Gmail once claimed.
    const w = window.open("", "_blank");
    if (w) w.opener = null;
    claimThen(
      force,
      () => {
        const url = gmailComposeUrl({ inbox, to, cc, subject, body });
        if (w) w.location.href = url;
        else window.open(url, "_blank", "noreferrer");
      },
      () => w?.close(),
    );
  };

  const copy = (force: boolean) =>
    claimThen(force, async () => {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });

  return (
    <div className="space-y-3">
      {needsLegalReview ? (
        <Notice tone="warn" icon={<AlertTriangle className="size-4" />}>
          Formal notice under Abate&apos;s name: it cites the warranty of habitability and a dollar estimate. Only send it once your legal check is done.
        </Notice>
      ) : null}
      {replyAfterApproval ? (
        <Notice tone="warn" icon={<AlertTriangle className="size-4" />}>
          Management replied after the tenant approved this. Read the reply before sending; the letter may be out of date.
        </Notice>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="font-semibold">From</dt>
        <dd className="break-all text-slate">{inbox ?? <span className="text-warn">Set TEAM_GMAIL so Gmail opens the team inbox. Check the From line before sending.</span>}</dd>
        <dt className="font-semibold">To</dt>
        <dd className="break-all text-slate">{to ?? <span className="text-warn">No management email yet. Add it below.</span>}</dd>
        <dt className="font-semibold">Cc</dt>
        <dd className="break-all text-slate">{cc ?? "No tenant email"}</dd>
        <dt className="font-semibold">Subject</dt>
        <dd>{subject}</dd>
      </dl>
      {edited ? (
        <Badge tone="warn">
          <PenLine className="size-3.5" aria-hidden="true" /> Edited by the tenant: read every line before sending
        </Badge>
      ) : null}
      <div className={cn("whitespace-pre-wrap rounded-2xl bg-mist p-4 text-sm leading-relaxed", !open && "max-h-40 overflow-hidden")}>{body}</div>
      <div className="flex flex-wrap gap-x-4">
        <button type="button" onClick={() => setOpen((o) => !o)} className="min-h-11 text-sm font-semibold underline decoration-periwinkle underline-offset-4">
          {open ? "Show less" : "Show the whole message"}
        </button>
        {edited && draftBody ? (
          <button type="button" onClick={() => setShowOriginal((o) => !o)} className="min-h-11 text-sm font-semibold underline decoration-periwinkle underline-offset-4">
            {showOriginal ? "Hide our original draft" : "Compare with our original draft"}
          </button>
        ) : null}
      </div>
      {showOriginal && draftBody ? <div className="whitespace-pre-wrap rounded-2xl bg-white p-4 text-sm leading-relaxed ring-1 ring-line">{draftBody}</div> : null}

      {!to ? <MgmtEmailForm teamKey={teamKey} code={code} /> : null}

      {result.message ? <Notice tone="bad">{result.message}</Notice> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" loading={pending} disabled={!to} onClick={() => openGmail(result.claimed === "recently")} icon={<ExternalLink className="size-4" aria-hidden="true" />}>
          {result.claimed === "recently" ? "Open anyway" : "Open in Gmail"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => copy(result.claimed === "recently")}
          icon={copied ? <Check className="size-4" aria-hidden="true" /> : <ClipboardCopy className="size-4" aria-hidden="true" />}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button
          type="button"
          loading={pending}
          onClick={() => startSending(async () => setResult(await markSentAction(teamKey, messageId)))}
          icon={<Send className="size-4" aria-hidden="true" />}
        >
          Mark sent
        </Button>
      </div>
    </div>
  );
}

function MgmtEmailForm({ teamKey, code }: { teamKey: string; code: string }) {
  const id = useId();
  const [state, formAction, pending] = useActionState<TeamActionState, FormData>(mgmtEmailAction.bind(null, teamKey, code), {});
  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex flex-wrap items-end gap-2">
      <Field label="Management's email" htmlFor={`${id}-email`} error={state.errors?.email} className="min-w-60 flex-1">
        <Input id={`${id}-email`} name="email" type="email" required maxLength={200} defaultValue={state.values?.email} />
      </Field>
      <Button type="submit" variant="secondary" loading={pending}>
        Save
      </Button>
    </form>
  );
}

function CategoryFields({ errors }: { errors?: Record<string, string> }) {
  const id = useId();
  const [choice, setChoice] = useState<ReplyCategory | null>(null);
  return (
    <>
      <fieldset className="space-y-2" aria-describedby={errors?.category ? `${id}-cat-error` : undefined}>
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
              <input type="radio" name="category" value={c.id} required onChange={() => setChoice(c.id)} className="size-4 accent-[#08014E]" />
              {REPLY_PLAIN[c.id]}
            </label>
          ))}
        </div>
        {errors?.category ? (
          <p id={`${id}-cat-error`} role="alert" className="text-sm font-medium text-bad">
            {errors.category}
          </p>
        ) : null}
      </fieldset>
      {choice === "scheduled" ? (
        <Field label="Repair date" htmlFor={`${id}-repair-date`} error={errors?.scheduledFor}>
          <Input id={`${id}-repair-date`} name="scheduledFor" type="date" required />
        </Field>
      ) : null}
    </>
  );
}

/** Our team's reading of a reply a tenant pasted in (or one someone marked "not sure"). */
export function ClassifyForm({ teamKey, messageId }: { teamKey: string; messageId: string }) {
  const [state, formAction, pending] = useActionState<TeamActionState, FormData>(classifyAction.bind(null, teamKey), {});
  return (
    <form onSubmit={submitWithoutReset(formAction)} className="space-y-3">
      <input type="hidden" name="messageId" value={messageId} />
      <CategoryFields errors={state.errors} />
      {state.message ? <Notice tone="bad">{state.message}</Notice> : null}
      <Button type="submit" loading={pending}>
        Set the next step
      </Button>
    </form>
  );
}

/** A reply that came into the team inbox. */
export function LogReplyForm({ teamKey, cases }: { teamKey: string; cases: Array<{ code: string; label: string }> }) {
  const id = useId();
  const today = useToday();
  const [formKey, setFormKey] = useState(0);
  const [state, formAction, pending] = useActionState<TeamActionState, FormData>(async (prev, fd) => {
    const result = await logReplyAction(teamKey, prev, fd);
    if (result.ok) startTransition(() => setFormKey((k) => k + 1)); // start fresh only after a success
    return result;
  }, {});
  const v = state.ok ? undefined : state.values;

  return (
    <form key={formKey} onSubmit={submitWithoutReset(formAction)} className="space-y-4">
      {state.ok ? <Notice tone="good">Logged. The tenant&apos;s case page now shows the next step.</Notice> : null}
      <Field label="Case" htmlFor={`${id}-code`} error={state.errors?.code}>
        <select id={`${id}-code`} name="code" required defaultValue={v?.code ?? ""} className="block min-h-[52px] w-full rounded-2xl border border-line bg-white px-4">
          <option value="" disabled>
            Choose a case
          </option>
          {cases.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Their reply" htmlFor={`${id}-text`} error={state.errors?.text}>
        <Textarea id={`${id}-text`} name="text" rows={5} required maxLength={8000} defaultValue={v?.text} />
      </Field>
      <Field label="Received" htmlFor={`${id}-received`} error={state.errors?.receivedOn}>
        <Input id={`${id}-received`} name="receivedOn" type="date" defaultValue={v?.receivedOn || today} key={today} max={today || undefined} />
      </Field>
      <CategoryFields errors={state.errors} />
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
