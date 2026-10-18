import { MapPin } from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { IssueIcon } from "@/components/issue-icon";
import { Badge, Notice } from "@/components/ui/card";
import { isCaseToken } from "@/lib/cases/ids";
import { getCaseBundle } from "@/lib/cases/repo";
import { getBuildingSummary } from "@/lib/building";
import { draftFor } from "@/lib/cases/service";
import { buildTimeline, ladderInputs, ladderProgress, messageTime } from "@/lib/cases/view";
import { hasDatabase } from "@/lib/db/client";
import { formatLongDate, formatShortDate, nyDate } from "@/lib/domain/dates";
import { estimateAbatement, formatDollars } from "@/lib/domain/estimate";
import { getIssueType } from "@/lib/domain/issues";
import { nextAction, TIMED_STEPS } from "@/lib/domain/ladder";
import { trackingAddress } from "@/lib/domain/mailto";
import { BuildingCard } from "./building-card";
import { EstimateCard } from "./estimate-card";
import { NextStepCard, type LatestReply } from "./next-step-card";
import { PhotosCard } from "./photos-card";
import { HelpCard, InviteCard, SaveLinkCard, TrackView } from "./share-cards";
import { CardSkeleton } from "./skeletons";
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

  const { record, messages, photos } = bundle;
  const today = nyDate();
  const issue = getIssueType(record.issueType);
  const { ladderCase, ladderMessages } = ladderInputs(record, messages);
  const action = nextAction(ladderCase, ladderMessages, today);
  const estimate = estimateAbatement({
    monthlyRent: record.monthlyRent,
    issueType: record.issueType,
    noticeOn: record.firstReportedOn,
    endOn: record.fixedOn ?? today,
  });

  // The formal notice cites the building's open violations; look the count up once and use the same
  // number for the draft and for judging later whether the tenant edited it.
  let openViolations: number | null = null;
  if (action.kind === "send" && action.step === "formal_notice" && record.bbl) {
    try {
      openViolations = (await getBuildingSummary(record.bbl, record.bin))?.openViolations.total ?? null;
    } catch {
      openViolations = null;
    }
  }
  const draft = action.kind === "send" ? await draftFor(record, messages, action.step, today, { openViolations }) : null;
  const stepIndex = action.kind === "send" ? TIMED_STEPS.findIndex((s) => s.step === action.step) : -1;

  // The latest reply, if we haven't answered it yet, so the tenant can see and correct how it was read.
  const sorted = [...messages].sort((a, b) => messageTime(a).localeCompare(messageTime(b)));
  const last = sorted[sorted.length - 1];
  const latestReply: LatestReply | null =
    last && last.direction === "incoming" ? { id: last.id, category: last.classification, summary: last.classificationSummary } : null;

  const fixedSummary =
    record.status === "fixed" && record.fixedOn
      ? `It took ${estimate.days === 1 ? "1 day" : `${estimate.days} days`} after you told management.` +
        (estimate.high > 0 ? ` For that stretch you may be owed ${formatDollars(estimate.low)}–${formatDollars(estimate.high)}.` : "")
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
            <IssueIcon type={record.issueType} className="size-6" />
          </span>
          {issue.label}
        </h1>
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

      <NextStepCard
        token={token}
        action={action}
        draft={draft}
        stepNumber={stepIndex >= 0 ? stepIndex + 1 : null}
        to={record.mgmtEmail}
        cc={trackingAddress(process.env.CC_EMAIL, record.code)}
        isDue={action.kind === "send" ? action.dueOn <= today : false}
        dueLabel={action.kind === "send" ? formatShortDate(action.dueOn, today) : null}
        scheduledLabel={record.repairScheduledFor ? formatLongDate(record.repairScheduledFor) : null}
        scheduledFor={record.repairScheduledFor}
        latestReply={latestReply}
        fixedSummary={fixedSummary}
        hasContact={Boolean(record.tenantContact)}
        draftedOn={today}
        openViolations={openViolations}
      />

      <EstimateCard estimate={estimate} fixed={record.status === "fixed"} issueLabel={issue.label} lowPct={issue.low} highPct={issue.high} />

      {record.status === "fixed" || action.kind === "all_sent" ? <HelpCard token={token} requested={Boolean(record.helpRequestedAt)} emphasize /> : null}

      <Suspense fallback={<CardSkeleton />}>
        <BuildingCard bbl={record.bbl} bin={record.bin} />
      </Suspense>

      <TimelineCard items={buildTimeline(record, messages)} progress={ladderProgress(messages, action.kind === "send" ? action.step : null)} today={today} />

      <PhotosCard photos={photos} />

      {record.status === "open" && record.bbl ? <InviteCard token={token} code={record.code} /> : null}

      {record.status === "open" && action.kind !== "all_sent" ? <HelpCard token={token} requested={Boolean(record.helpRequestedAt)} emphasize={false} /> : null}
    </div>
  );
}
