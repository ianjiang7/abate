"use client";

import { BellRing, CalendarCheck, CalendarClock, Check, ClipboardCopy, Hourglass, Landmark, Mail, PartyPopper, PauseCircle, PenLine, PlayCircle, Send, Sparkles } from "lucide-react";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { contactAction, fixedAction, notFixedAction, pauseAction, resumeAction, sendAction, trackAction, type CaseActionState } from "@/app/case/[token]/actions";
import { Button } from "@/components/ui/button";
import { Badge, Card, Notice } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToday } from "@/lib/client/use-today";
import { buildMailto } from "@/lib/domain/mailto";
import { replyCategoryLabel, STEP_LABELS, type NextAction, type ReplyCategory, type StepId } from "@/lib/domain/ladder";
import { unfilledPlaceholders } from "@/lib/domain/templates";
import { CorrectReply } from "./correct-reply";
import { ReplyButton } from "./reply-sheet";

export type LatestReply = {
  id: string;
  category: ReplyCategory | null;
  summary: string | null;
  classifiedBy: "agent" | "team" | "tenant" | null;
};

export type NextStepProps = {
  token: string;
  action: NextAction;
  draft: { subject: string; body: string } | null;
  stepNumber: number | null;
  to: string | null;
  cc: string | null;
  isDue: boolean;
  dueLabel: string | null;
  scheduledLabel: string | null;
  scheduledFor: string | null;
  latestReply: LatestReply | null;
  fixedSummary: string | null;
  /** Whether teammates have a phone or email to send reminders to. */
  hasContact: boolean;
  /** The New York date the draft was built for, for fair edit tracking. */
  draftedOn: string;
  /** "abate": the team sends approved messages from the team inbox. "self": the tenant sends them. */
  sendMode: "abate" | "self";
  tenantEmail: string | null;
  /** The latest reply no one has read yet, if any. */
  unreadReplyId: string | null;
  /** The tenant listed several problems, so "fixed" means all of them. */
  severalProblems: boolean;
};

/** In Abate mode the tenant approves, and our team sends. */
const ABATE_STEP_TITLES: Record<StepId, string> = {
  notice: "Approve your written notice",
  reminder: "Approve a reminder",
  formal_notice: "Approve the formal notice",
  guide_311: "File with 311, then approve the update",
  ask_date: "Approve: ask them for a repair date",
  confirm_schedule: "Approve: confirm the repair date",
  offer_access: "Approve: offer times they can come in",
  missed_repair: "Approve: ask for a new repair date",
};

const STEP_TITLES: Record<StepId, string> = {
  notice: "Send your written notice",
  reminder: "Send a reminder",
  formal_notice: "Send the formal notice",
  guide_311: "File with 311, then tell management",
  ask_date: "Ask them for a repair date",
  confirm_schedule: "Confirm the repair date",
  offer_access: "Offer times they can come in",
  missed_repair: "Ask for a new repair date",
};

// Count each draft as shown once per page session, even when Next re-shows a hidden page.
const shownDrafts = new Set<string>();

export function NextStepCard(props: NextStepProps) {
  const { action, token } = props;
  const stepKey = action.kind === "send" ? `send:${action.step}` : action.kind;
  const lastKey = useRef(stepKey);

  // After an action re-renders the card with a new step, move focus to its heading so screen
  // readers announce what's next (the button that had focus is gone).
  useEffect(() => {
    if (lastKey.current === stepKey) return;
    lastKey.current = stepKey;
    document.getElementById("next-step-title")?.focus({ preventScroll: false });
  }, [stepKey]);

  const canMarkFixed = action.kind === "send" || action.kind === "team_review" || action.kind === "all_sent" || action.kind === "awaiting_send" || action.kind === "paused";
  const canPause = props.sendMode === "abate" && action.kind !== "done" && action.kind !== "paused";

  return (
    <Card padded={false} className="relative overflow-hidden" aria-labelledby="next-step-title">
      <div className="h-1.5 bg-gradient-to-r from-ink via-[#3b3591] to-periwinkle" aria-hidden="true" />
      <div className="p-5">
        {props.latestReply && action.kind !== "done" ? <ReplyReading token={token} reply={props.latestReply} /> : null}
        {action.kind === "send" ? <SendStep key={action.step} {...props} action={action} /> : null}
        {action.kind === "confirm_fixed" ? (
          <FixedQuestion
            token={token}
            several={props.severalProblems}
            title={props.severalProblems ? "They say it's fixed. Is everything fixed?" : "They say it's fixed. Is it?"}
            body={
              props.severalProblems
                ? "Check every problem you reported. If something is still broken, we'll ask them again and you can say what."
                : "Check that the repair actually worked before you mark it done."
            }
            defaultDate={null}
          />
        ) : null}
        {action.kind === "checkin" ? (
          <FixedQuestion
            token={token}
            several={props.severalProblems}
            title={`Was ${props.severalProblems ? "everything" : "it"} fixed on ${props.scheduledLabel ?? "the scheduled day"}?`}
            body="Let us know so we can close the case or ask for a new date."
            defaultDate={props.scheduledFor}
          />
        ) : null}
        {action.kind === "waiting_for_repair" ? <WaitingForRepair {...props} /> : null}
        {action.kind === "team_review" ? <TeamReview {...props} /> : null}
        {action.kind === "all_sent" ? <AllSent token={token} /> : null}
        {action.kind === "awaiting_send" ? <AwaitingSend {...props} action={action} /> : null}
        {action.kind === "paused" ? <Paused token={token} /> : null}
        {action.kind === "done" ? <Done summary={props.fixedSummary} /> : null}
        {canMarkFixed || canPause ? (
          <div className="mt-5 flex flex-wrap justify-center gap-x-4 border-t border-line/80 pt-2">
            {canMarkFixed ? <MarkFixed token={token} several={props.severalProblems} /> : null}
            {canPause ? <PauseControl token={token} /> : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[13px] font-semibold uppercase tracking-wider text-slate">{children}</p>;
}

function SendStep(props: NextStepProps & { action: Extract<NextAction, { kind: "send" }> }) {
  const { token, action, draft, stepNumber, isDue, dueLabel } = props;
  const [showEarly, setShowEarly] = useState(false);

  if (!draft) return null;
  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <Eyebrow>{stepNumber ? `Step ${stepNumber} of 4 · ${STEP_LABELS[action.step]}` : STEP_LABELS[action.step]}</Eyebrow>
      {isDue ? <Badge tone="good">Ready now</Badge> : <Badge>Ready {dueLabel}</Badge>}
    </div>
  );

  if (!isDue && !showEarly) {
    return (
      <div>
        {header}
        <h2 id="next-step-title" tabIndex={-1} className="outline-none mt-3 text-[22px] font-bold leading-tight tracking-tight">
          Next up: {STEP_LABELS[action.step].toLowerCase()} on {dueLabel}
        </h2>
        <p className="mt-2 leading-relaxed text-slate">
          {action.reason} Give them a little time to answer first.{" "}
          {props.hasContact ? "We'll remind you when it's ready." : `Come back to this link on ${dueLabel}.`}
        </p>
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-mist p-4 text-sm text-slate">
          <Hourglass className="size-5 shrink-0 text-ink" aria-hidden="true" />
          If management replies before then, paste it in and our team will set up the next step.
        </div>
        {!props.hasContact ? <ContactForm token={token} /> : null}
        <div className="mt-5 grid gap-2.5">
          <ReplyButton token={token} variant="primary" />
          <Button type="button" variant="ghost" block onClick={() => setShowEarly(true)}>
            Send it now anyway
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {header}
      <h2 id="next-step-title" tabIndex={-1} className="outline-none mt-3 text-[22px] font-bold leading-tight tracking-tight">
        {(props.sendMode === "abate" ? ABATE_STEP_TITLES : STEP_TITLES)[action.step]}
      </h2>
      <p className="mt-2 leading-relaxed text-slate">{action.reason}</p>
      {action.step === "guide_311" ? <Guide311 byAbate={props.sendMode === "abate"} /> : null}
      <Composer key={`${action.step}:${draft.subject}:${draft.body.length}`} {...props} step={action.step} draft={draft} />
    </div>
  );
}

function Composer({ token, to, cc, step, draft, draftedOn, sendMode, tenantEmail }: NextStepProps & { step: StepId; draft: { subject: string; body: string } }) {
  const byAbate = sendMode === "abate";
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [opened, setOpened] = useState(false);
  const [copied, setCopied] = useState(false);
  const [state, formAction, pending] = useActionState<CaseActionState, FormData>(sendAction.bind(null, token), {});
  const editedRef = useRef(false);
  const placeholders = unfilledPlaceholders(body);

  useEffect(() => {
    const key = `${token}:${step}`;
    if (shownDrafts.has(key)) return;
    shownDrafts.add(key);
    void trackAction(token, "draft_shown", { step });
  }, [token, step]);

  const markEdited = () => {
    if (editedRef.current) return;
    editedRef.current = true;
    void trackAction(token, "draft_edited", { step });
  };

  const openEmail = () => {
    void trackAction(token, "send_clicked", { step });
    setOpened(true);
    window.location.href = buildMailto({ to, cc, subject, body });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setCopied(true);
      setOpened(true);
      void trackAction(token, "copy_clicked", { step });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setEditing(true);
    }
  };

  return (
    <div className="mt-5">
      <div className="overflow-hidden rounded-2xl bg-mist ring-1 ring-line">
        <div className="flex items-center justify-between gap-3 border-b border-line/80 bg-white/70 px-4 py-2.5">
          <div className="min-w-0 text-[13px] text-slate">
            {byAbate ? (
              <p className="truncate">
                <span className="font-semibold text-ink">From:</span> the Abate team
              </p>
            ) : null}
            <p className="truncate">
              <span className="font-semibold text-ink">To:</span> {to ?? (byAbate ? "management (we'll find their email)" : "your landlord's email")}
            </p>
            {byAbate ? (
              <p className="truncate">
                <span className="font-semibold text-ink">Cc:</span> you{tenantEmail ? ` (${tenantEmail})` : ""}
              </p>
            ) : cc ? (
              <p className="truncate">
                <span className="font-semibold text-ink">Cc:</span> {cc}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold hover:bg-lavender"
            aria-pressed={editing}
          >
            {editing ? <Check className="size-4" aria-hidden="true" /> : <PenLine className="size-4" aria-hidden="true" />}
            {editing ? "Done" : "Edit"}
          </button>
        </div>
        {editing ? (
          <div className="space-y-3 p-4">
            <Field label="Subject" htmlFor="draft-subject">
              <Input id="draft-subject" value={subject} onChange={(e) => (setSubject(e.target.value), markEdited())} />
            </Field>
            <Field label="Message" htmlFor="draft-body">
              <Textarea id="draft-body" value={body} onChange={(e) => (setBody(e.target.value), markEdited())} rows={14} />
            </Field>
          </div>
        ) : (
          <div className="relative px-4 py-4">
            <p className="text-[15px] font-semibold">{subject}</p>
            <div className={cn("mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-ink/90", !expanded && "max-h-56 overflow-hidden")}>
              <Highlighted text={body} />
            </div>
            {!expanded ? (
              <div className="absolute inset-x-0 bottom-0 flex h-20 items-end justify-center bg-gradient-to-t from-mist via-mist/90 to-transparent pb-3">
                <button type="button" onClick={() => setExpanded(true)} className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold shadow-[var(--shadow-card)] ring-1 ring-line">
                  Read the full message
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {placeholders.length > 0 ? (
        <div id={`placeholders-${step}`}>
          <Notice tone="warn" className="mt-3">
            Fill in the highlighted part{placeholders.length > 1 ? "s" : ""} in brackets before you {byAbate ? "approve" : "send"}. Tap <strong>Edit</strong>.
          </Notice>
        </div>
      ) : null}

      {state.message ? (
        <Notice tone="bad" className="mt-3">
          {state.message}
        </Notice>
      ) : null}

      {byAbate ? (
        <form action={formAction} className="mt-5 grid gap-2.5">
          <input type="hidden" name="step" value={step} />
          <input type="hidden" name="draftedOn" value={draftedOn} />
          <input type="hidden" name="subject" value={subject} />
          <input type="hidden" name="body" value={body} />
          {/* Stays focusable (aria-disabled) so screen-reader users hear why it can't be used yet. */}
          <Button
            type="submit"
            size="lg"
            block
            loading={pending}
            aria-disabled={placeholders.length > 0 || undefined}
            aria-describedby={placeholders.length > 0 ? `placeholders-${step}` : undefined}
            className="aria-disabled:opacity-50"
            onClick={(e) => {
              if (placeholders.length > 0) {
                e.preventDefault();
                setEditing(true);
              }
            }}
            icon={<Send className="size-5" aria-hidden="true" />}
          >
            Approve and send
          </Button>
          <p className="text-center text-sm text-slate">Our team sends it within a day and copies you.</p>
        </form>
      ) : !opened ? (
        <div className="mt-5 grid gap-2.5">
          <Button type="button" size="lg" block onClick={openEmail} icon={<Mail className="size-5" aria-hidden="true" />}>
            Open in my email app
          </Button>
          <Button type="button" variant="secondary" block onClick={copy} icon={<ClipboardCopy className="size-5" aria-hidden="true" />}>
            {copied ? "Copied" : "Copy the message instead"}
          </Button>
        </div>
      ) : (
        <form action={formAction} className="mt-5 rounded-2xl bg-lavender/70 p-4">
          <input type="hidden" name="step" value={step} />
          <input type="hidden" name="draftedOn" value={draftedOn} />
          <input type="hidden" name="subject" value={subject} />
          <input type="hidden" name="body" value={body} />
          <p className="font-semibold">Did you send it?</p>
          <p className="mt-1 text-sm text-slate">Tap yes once it&apos;s on its way, so we can start the clock for the next step.</p>
          <div className="mt-4 grid gap-2.5">
            <Button type="submit" size="lg" block loading={pending} icon={<Check className="size-5" aria-hidden="true" />}>
              Yes, I sent it
            </Button>
            <div className="grid grid-cols-2 gap-2.5">
              <Button type="button" variant="secondary" onClick={openEmail}>
                Open email again
              </Button>
              <Button type="button" variant="secondary" onClick={copy}>
                {copied ? "Copied" : "Copy text"}
              </Button>
            </div>
          </div>
        </form>
      )}

      <p className="mt-4 text-xs leading-relaxed text-slate">
        {byAbate
          ? "Our team sends it from Abate's email and copies you, so you see exactly what management gets. "
          : `It goes from your own email, so replies come straight to you${cc ? ". The Cc lets Abate keep a dated copy" : ""}. `}
        Messages stick to facts. Abate isn&apos;t a law firm, and nothing here is legal advice.
      </p>
    </div>
  );
}

function Highlighted({ text }: { text: string }) {
  const parts = text.split(/(\[add [^\]]+\])/g);
  return (
    <>
      {parts.map((part, i) =>
        /^\[add [^\]]+\]$/.test(part) ? (
          <mark key={i} className="rounded bg-warn-soft px-1 font-semibold text-warn">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function Guide311({ byAbate }: { byAbate: boolean }) {
  return (
    <ol className="mt-5 space-y-3 rounded-2xl bg-mist p-4 text-[15px] leading-relaxed">
      <li className="flex gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-white">1</span>
        <span>
          Call <strong>311</strong>, use the NYC311 app, or go to{" "}
          <a href="https://portal.311.nyc.gov/" target="_blank" rel="noreferrer" className="font-semibold underline decoration-periwinkle underline-offset-4">
            portal.311.nyc.gov
          </a>
          . Ask to report a problem in your apartment.
        </span>
      </li>
      <li className="flex gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-white">2</span>
        <span>Describe the problem and when it started. HPD may send an inspector, and a violation goes on the building&apos;s public record.</span>
      </li>
      <li className="flex gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-white">3</span>
        <span>
          Write down your complaint number and add it to the message below{byAbate ? ". Approve it and our team will send it to management." : ", then send it to management."}
        </span>
      </li>
      <li className="flex items-center gap-2 pt-1 text-sm text-slate">
        <Landmark className="size-4" aria-hidden="true" /> We never file for you. You stay in charge of what the city hears.
      </li>
    </ol>
  );
}

function ReplyReading({ token, reply }: { token: string; reply: LatestReply }) {
  const [correcting, setCorrecting] = useState(false);
  return (
    <div className="mb-5 rounded-2xl bg-lavender/70 p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-ink">
          <Sparkles className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate">
            {reply.classifiedBy === "tenant" ? "You told us their latest reply said" : reply.classifiedBy === "team" ? "Our team read their latest reply as" : "Abate read their latest reply as"}
          </p>
          <p className="font-semibold">{reply.category ? replyCategoryLabel(reply.category) : "Not sure yet"}</p>
          {reply.summary ? <p className="mt-1 text-sm leading-relaxed text-slate">{reply.summary}</p> : null}
          {!correcting ? (
            <button type="button" onClick={() => setCorrecting(true)} className="-ml-1 mt-1 min-h-11 px-1 text-sm font-semibold underline decoration-periwinkle underline-offset-4">
              Not right? Tell us what they said
            </button>
          ) : null}
        </div>
      </div>
      {correcting ? (
        <div className="mt-4">
          <CorrectReply token={token} messageId={reply.id} current={reply.category} onDone={() => setCorrecting(false)} />
          <button type="button" onClick={() => setCorrecting(false)} className="mt-2 w-full py-2 text-sm font-semibold text-slate">
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FixedQuestion({ token, title, body, defaultDate, several }: { token: string; title: string; body: string; defaultDate: string | null; several: boolean }) {
  const [fixedState, fixedFormAction, fixedPending] = useActionState<CaseActionState, FormData>(fixedAction.bind(null, token), {});
  const [notState, notFormAction, notPending] = useActionState<CaseActionState, FormData>(notFixedAction.bind(null, token), {});
  const today = useToday();
  const message = fixedState.message ?? notState.message;

  return (
    <div>
      <Eyebrow>Quick check</Eyebrow>
      <h2 id="next-step-title" tabIndex={-1} className="outline-none mt-3 text-[22px] font-bold leading-tight tracking-tight">
        {title}
      </h2>
      <p className="mt-2 leading-relaxed text-slate">{body}</p>
      {message ? (
        <Notice tone="bad" className="mt-4">
          {message}
        </Notice>
      ) : null}
      <form action={fixedFormAction} className="mt-5 space-y-3">
        <Field label="Date it was fixed" htmlFor="fixedOn" error={fixedState.errors?.fixedOn}>
          <Input id="fixedOn" name="fixedOn" type="date" key={`${defaultDate}-${today}`} defaultValue={defaultDate && today && defaultDate <= today ? defaultDate : today} max={today || undefined} />
        </Field>
        <Button type="submit" size="lg" block loading={fixedPending} icon={<CalendarCheck className="size-5" aria-hidden="true" />}>
          {several ? "Yes, everything's fixed" : "Yes, it's fixed"}
        </Button>
      </form>
      <form action={notFormAction} className="mt-2.5">
        <Button type="submit" variant="secondary" block loading={notPending}>
          {several ? "No, something's still broken" : "No, it's still broken"}
        </Button>
      </form>
    </div>
  );
}

function WaitingForRepair(props: NextStepProps) {
  return (
    <div>
      <Eyebrow>Repair scheduled</Eyebrow>
      <h2 id="next-step-title" tabIndex={-1} className="outline-none mt-3 text-[22px] font-bold leading-tight tracking-tight">
        They&apos;re coming {props.scheduledLabel}
      </h2>
      <p className="mt-2 leading-relaxed text-slate">We&apos;ll check in the day after. If the date changes or they don&apos;t show, tell us and we&apos;ll draft the follow-up.</p>
      <div className="mt-5 flex items-center gap-3 rounded-2xl bg-good-soft p-4 text-sm font-medium text-good">
        <CalendarClock className="size-5 shrink-0" aria-hidden="true" /> Progress. A written date is exactly what we were after.
      </div>
      <div className="mt-5 grid gap-2.5">
        <FixedEarly token={props.token} />
        <ReplyButton token={props.token} />
      </div>
    </div>
  );
}

function FixedEarly({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<CaseActionState, FormData>(fixedAction.bind(null, token), {});
  return (
    <form action={formAction}>
      {state.message ? <Notice tone="bad" className="mb-2">{state.message}</Notice> : null}
      <Button type="submit" block loading={pending} icon={<Check className="size-5" aria-hidden="true" />}>
        It&apos;s fixed already
      </Button>
    </form>
  );
}

function TeamReview(props: NextStepProps) {
  const [knows, setKnows] = useState(false);
  return (
    <div>
      <Eyebrow>We&apos;re on it</Eyebrow>
      <h2 id="next-step-title" tabIndex={-1} className="mt-3 text-[22px] font-bold leading-tight tracking-tight outline-none">
        Our team is reading their reply
      </h2>
      <p className="mt-2 leading-relaxed text-slate">
        We&apos;ll set up your next step within a day{props.hasContact ? " and let you know" : ". Check back here tomorrow"}.
      </p>
      {props.unreadReplyId ? (
        knows ? (
          <div className="mt-5">
            <CorrectReply token={props.token} messageId={props.unreadReplyId} current={null} onDone={() => setKnows(false)} />
            <button type="button" onClick={() => setKnows(false)} className="mt-2 min-h-11 w-full text-sm font-semibold text-slate">
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setKnows(true)} className="mt-3 min-h-11 text-sm font-semibold underline decoration-periwinkle underline-offset-4">
            I already know what they meant
          </button>
        )
      ) : null}
      {!props.hasContact ? <ContactForm token={props.token} /> : null}
      <div className="mt-5">
        <ReplyButton token={props.token} label="They sent another reply" />
      </div>
    </div>
  );
}

function AllSent({ token }: { token: string }) {
  return (
    <div>
      <Eyebrow>Every step sent</Eyebrow>
      <h2 id="next-step-title" tabIndex={-1} className="outline-none mt-3 text-[22px] font-bold leading-tight tracking-tight">
        You&apos;ve done everything on the list
      </h2>
      <p className="mt-2 leading-relaxed text-slate">
        You now have a dated record of every request. If it&apos;s still not fixed, our team can take it from here. See the offer below. If management replies, paste it in.
      </p>
      <div className="mt-5 grid gap-2.5">
        <ReplyButton token={token} variant="primary" />
      </div>
    </div>
  );
}

function Done({ summary }: { summary: string | null }) {
  return (
    <div className="text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-good-soft text-good">
        <PartyPopper className="size-7" aria-hidden="true" />
      </span>
      <h2 id="next-step-title" tabIndex={-1} className="outline-none mt-4 text-2xl font-bold tracking-tight">
        Fixed. Nice work.
      </h2>
      {summary ? <p className="mx-auto mt-2 max-w-xs leading-relaxed text-slate">{summary}</p> : null}
    </div>
  );
}

/** "Already fixed?" for any open state: the super often just shows up without writing back. */
function MarkFixed({ token, several }: { token: string; several: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<CaseActionState, FormData>(fixedAction.bind(null, token), {});
  const today = useToday();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="min-h-11 px-2 text-sm font-semibold text-slate underline decoration-periwinkle underline-offset-4">
        {several ? "Everything fixed? Mark it done" : "Already fixed? Mark it done"}
      </button>
    );
  }
  return (
    <form action={formAction} className="mt-3 w-full space-y-3">
      <p className="font-semibold">{several ? "Mark everything fixed" : "Mark the repair fixed"}</p>
      <Field label="Date it was fixed" htmlFor="mark-fixed-on" error={state.errors?.fixedOn}>
        <Input id="mark-fixed-on" name="fixedOn" type="date" key={today} defaultValue={today} max={today || undefined} required autoFocus />
      </Field>
      {state.message ? <Notice tone="bad">{state.message}</Notice> : null}
      <p className="text-sm text-slate">
        {several ? "This closes your case and stops the follow-ups for every problem you listed." : "This closes your case and stops the follow-ups."}
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" loading={pending} icon={<Check className="size-4" aria-hidden="true" />}>
          It&apos;s fixed
        </Button>
      </div>
    </form>
  );
}

/** For tenants who skipped the reminder field: a phone or email so teammates can nudge them. */
function ContactForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<CaseActionState, FormData>(contactAction.bind(null, token), {});
  if (state.ok) return null;
  return (
    <form action={formAction} className="mt-5 space-y-3 rounded-2xl bg-lavender/70 p-4">
      <p className="flex items-center gap-2 font-semibold">
        <BellRing className="size-4" aria-hidden="true" /> Want a reminder?
      </p>
      <Field label="Phone or email" htmlFor="reminder-contact" error={state.errors?.contact} hint="Our team will remind you when your next step is ready. We never share it.">
        <Input id="reminder-contact" name="contact" autoComplete="tel" maxLength={120} required />
      </Field>
      {state.message ? <Notice tone="bad">{state.message}</Notice> : null}
      <Button type="submit" variant="secondary" block loading={pending}>
        Remind me
      </Button>
    </form>
  );
}

function AwaitingSend(props: NextStepProps & { action: Extract<NextAction, { kind: "awaiting_send" }> }) {
  return (
    <div>
      <Eyebrow>Approved</Eyebrow>
      <h2 id="next-step-title" tabIndex={-1} className="mt-3 text-[22px] font-bold leading-tight tracking-tight outline-none">
        Our team is sending your {STEP_LABELS[props.action.step].toLowerCase()}
      </h2>
      <p className="mt-2 leading-relaxed text-slate">
        It goes out from Abate&apos;s email within a day, and you&apos;ll get a copy{props.tenantEmail ? ` at ${props.tenantEmail}` : ""}. We&apos;ll start the clock for the next
        step once it&apos;s sent.
      </p>
      <div className="mt-5 flex items-center gap-3 rounded-2xl bg-mist p-4 text-sm text-slate">
        <Hourglass className="size-5 shrink-0 text-ink" aria-hidden="true" />
        If management writes to you directly, paste it in and our team will take it from there.
      </div>
      <div className="mt-5">
        <ReplyButton token={props.token} label="Management replied to me" />
      </div>
    </div>
  );
}

function Paused({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<CaseActionState, FormData>(async () => resumeAction(token), {});
  return (
    <div>
      <Eyebrow>Paused</Eyebrow>
      <h2 id="next-step-title" tabIndex={-1} className="mt-3 text-[22px] font-bold leading-tight tracking-tight outline-none">
        Abate is paused
      </h2>
      <p className="mt-2 leading-relaxed text-slate">We won&apos;t contact management until you resume. Your record and estimate are still here.</p>
      {state.message ? (
        <Notice tone="bad" className="mt-4">
          {state.message}
        </Notice>
      ) : null}
      <form action={formAction} className="mt-5">
        <Button type="submit" size="lg" block loading={pending} icon={<PlayCircle className="size-5" aria-hidden="true" />}>
          Resume Abate
        </Button>
      </form>
      <div className="mt-2.5">
        <ReplyButton token={token} label="Management replied to me" />
      </div>
    </div>
  );
}

const PAUSE_REASONS = [
  { id: "worried", label: "I'm worried about how my landlord will react" },
  { id: "send_myself", label: "I'd rather send the messages myself" },
  { id: "other", label: "Something else" },
] as const;

/** Lets a tenant stop Abate contacting management (hypothesis 2 counts how often this happens, and why). */
function PauseControl({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<CaseActionState, FormData>(pauseAction.bind(null, token), {});
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-semibold text-slate underline decoration-periwinkle underline-offset-4">
        <PauseCircle className="size-4" aria-hidden="true" /> Pause Abate
      </button>
    );
  }
  return (
    <form action={formAction} className="mt-3 w-full space-y-3">
      <fieldset className="space-y-2">
        <legend className="mb-2 font-semibold">Why do you want to pause?</legend>
        {PAUSE_REASONS.map((r) => (
          <label key={r.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl bg-mist px-4 py-2.5 text-[15px]">
            <input type="radio" name="reason" value={r.id} required autoFocus={r.id === PAUSE_REASONS[0].id} className="size-4 accent-[#08014E]" />
            {r.label}
          </label>
        ))}
      </fieldset>
      {state.errors?.reason ? <p role="alert" className="text-sm font-medium text-bad">{state.errors.reason}</p> : null}
      {state.message ? <Notice tone="bad">{state.message}</Notice> : null}
      <p className="text-sm text-slate">Choosing to send them yourself keeps your case going; otherwise we stop contacting management until you resume.</p>
      <div className="grid grid-cols-2 gap-2.5">
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" loading={pending}>
          Pause
        </Button>
      </div>
    </form>
  );
}
