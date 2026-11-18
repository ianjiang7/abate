import { MapPin } from "lucide-react";
import { notFound } from "next/navigation";
import { IssueIcon } from "@/components/issue-icon";
import { Badge, Card, Notice } from "@/components/ui/card";
import { canUseStep, hasFullPlan } from "@/lib/cases/access";
import { PlanCard } from "./plan-card";
import { RepliesCard } from "./reply-sheet";
import { isCaseToken } from "@/lib/cases/ids";
import { getCaseBundle } from "@/lib/cases/repo";
import { draftFor } from "@/lib/cases/service";
import { buildTimeline, caseEstimate, clockStartOn, ladderInputs, ladderProgress, liveMessages, messageTime } from "@/lib/cases/view";
import { hasDatabase } from "@/lib/db/client";
import { formatLongDate, formatShortDate, nyDate } from "@/lib/domain/dates";
import { formatDollars } from "@/lib/domain/estimate";
import { getIssueType, mostSeriousIssue } from "@/lib/domain/issues";
import { nextAction, TIMED_STEPS } from "@/lib/domain/ladder";
import { EstimateCard } from "./estimate-card";
import { MarkFixed, NextStepCard, type LatestReply } from "./next-step-card";
import { PhotosCard } from "./photos-card";
import { InviteCard, SaveLinkCard, TrackView } from "./share-cards";
import { TimelineCard } from "./timeline-card";

export async function CaseView({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await params;
  if (!isCaseToken(token)) notFound();
  if (!hasDatabase()) {
    return <Notice tone="warn">Abate isn&apos;t connected to its database yet, so cases can&apos;t be shown. Please try again soon.</Notice>;
  }

  const bundle = await getCaseBundle(token);
  if (!bundle) notFound();
  const isNew = (await searchParams).new === "1";

  const { record, photos } = bundle;
  // Approvals withdrawn before sending (pause, switch, or a new reply) don't count as messages.
  const messages = liveMessages(bundle.messages);
  const today = nyDate();
  // The most serious problem leads the page and sets the estimate; any others are listed under it.
  const issue = mostSeriousIssue(record.issueTypes);
  const otherIssues = record.issueTypes.filter((id) => id !== issue.id).map((id) => getIssueType(id).label);
  const { ladderCase, ladderMessages } = ladderInputs(record, messages);
  const action = nextAction(ladderCase, ladderMessages, today);
  const estimate = caseEstimate(record, messages, today);
  // Tenants who hadn't told management before: the clock starts when the first notice goes out.
  const clockStarted = clockStartOn(record, messages) !== null;
  const clockNote =
    action.kind === "send" && action.step === "notice"
      ? record.sendMode === "abate"
        ? "Approve the notice above so our team can send it."
        : "Send the notice above to start it."
      : action.kind === "awaiting_send"
        ? "Our team is sending your approved notice."
        : action.kind === "paused"
          ? "Abate is paused, so management hasn't been told yet."
          : "";

  const fullPlan = hasFullPlan(record);
  const showNext = fullPlan || action.kind === "done" || (action.kind === "send" && canUseStep(record, action.step));
  const draft = showNext && action.kind === "send" ? draftFor(record, messages, action.step, today) : null;
  const stepIndex = action.kind === "send" ? TIMED_STEPS.findIndex((s) => s.step === action.step) : -1;

  // The latest reply, if we haven't answered it yet, so the tenant can see and correct how it was read.
  const sorted = [...messages].sort((a, b) => messageTime(a).localeCompare(messageTime(b)));
  const last = sorted[sorted.length - 1];
  const latestReply: LatestReply | null =
    last && last.direction === "incoming" && last.classification && last.classification !== "unclear"
      ? { id: last.id, category: last.classification, summary: last.classificationSummary, classifiedBy: last.classifiedBy }
      : null;

  const fixedSummary =
    record.status === "fixed" && record.fixedOn && clockStarted
      ? `It took ${estimate.days === 1 ? "1 day" : `${estimate.days} days`} after you told management.` +
        (estimate.displayable ? ` The estimated amount you may be owed for that stretch is ${formatDollars(estimate.midpoint)}.` : "")
      : null;

  const reportedDays = estimate.days;

  return (
    <div className="space-y-4">
      <section className="animate-rise px-1 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={record.status === "fixed" ? "good" : "brand"}>{record.status === "fixed" ? "Fixed" : `Open · day ${reportedDays}`}</Badge>
          <span className="text-sm font-medium text-slate">Case {record.code}</span>
        </div>
        <h1 className="mt-3 flex items-center gap-3 text-[28px] font-bold leading-tight tracking-tight">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-ink shadow-[var(--shadow-card)] ring-1 ring-line">
            <IssueIcon type={issue.id} className="size-6" />
          </span>
          {issue.label}
        </h1>
        {otherIssues.length > 0 ? (
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm font-medium text-slate">
            <span>Also:</span>
            {otherIssues.map((label) => (
              <Badge key={label}>{label}</Badge>
            ))}
          </p>
        ) : null}
        <p className="mt-3 flex items-start gap-1.5 text-[15px] text-slate">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {record.address}
            {record.unit ? `, Apt ${record.unit}` : ""}
          </span>
        </p>
      </section>

      <TrackView token={token} next={action.kind === "send" ? action.step : action.kind} />
      {isNew ? <SaveLinkCard token={token} /> : null}

      <PlanCard token={token} full={fullPlan} priceArm={record.priceArm} />

      {showNext ? <NextStepCard
        token={token}
        action={action}
        draft={draft}
        stepNumber={fullPlan && stepIndex >= 0 ? stepIndex + 1 : null}
        to={record.mgmtEmail}
        cc={null}
        isDue={action.kind === "send" ? action.dueOn <= today : false}
        dueLabel={action.kind === "send" ? formatShortDate(action.dueOn, today) : null}
        scheduledLabel={record.repairScheduledFor ? formatLongDate(record.repairScheduledFor) : null}
        scheduledFor={record.repairScheduledFor}
        latestReply={latestReply}
        fixedSummary={fixedSummary}
        hasContact={Boolean(record.tenantContact || record.tenantEmail)}
        draftedOn={today}
        sendMode="self"
        tenantEmail={record.tenantEmail}
        severalProblems={record.issueTypes.length > 1}
        unreadReplyId={last && last.direction === "incoming" && (!last.classification || last.classification === "unclear") ? last.id : null}
      /> : <Notice><p>Your free first letter is saved. Unlock the full plan for the next drafts and reply tracking.</p><MarkFixed token={token} several={record.issueTypes.length > 1} /></Notice>}

      {!fullPlan ? messages.filter((m) => m.direction === "outgoing" && m.step === "notice" && m.sentAt).map((m) => (
        <Card key={m.id}>
          <h2 className="text-lg font-bold">Your first letter</h2>
          <details className="mt-3">
            <summary className="cursor-pointer font-semibold">Read your saved letter</summary>
            <p className="mt-3 text-sm font-semibold">{m.subject}</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{m.body}</p>
          </details>
        </Card>
      )) : null}

      <EstimateCard estimate={estimate} fixed={record.status === "fixed"} issueLabel={issue.label} lowPct={issue.low} highPct={issue.high} ofSeveral={otherIssues.length > 0}
        clockStarted={clockStarted}
        clockNote={clockNote}
      />

      {fullPlan ? <RepliesCard token={token} replies={messages.filter((m) => m.direction === "incoming")} /> : null}

      {fullPlan ? <TimelineCard items={buildTimeline(record, messages)} progress={ladderProgress(messages, action.kind === "send" ? action.step : null)} today={today} /> : null}

      <PhotosCard photos={photos} />

      {fullPlan && record.status === "open" && record.bbl ? <InviteCard token={token} code={record.code} /> : null}
    </div>
  );
}
