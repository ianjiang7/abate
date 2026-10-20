// Message templates for each ladder step. Legal wording lives only here, reviewed by the team.
// Two voices: "tenant" (the tenant sends it from their own email, first person) and "abate" (the
// Abate team sends it on the tenant's behalf, with the tenant copied). A `replyReference` (one
// factual sentence about management's last reply) may be inserted; nothing else is generated.

import { addDays, formatFullDate, formatLongDate, type IsoDate } from "./dates";
import { formatDollars, type Estimate } from "./estimate";
import { getIssueType, reportChannelPhrase, type IssueTypeId, type ReportChannelId } from "./issues";
import type { StepId } from "./ladder";

export type TemplateContext = {
  today: IsoDate;
  tenantName: string;
  address: string;
  unit?: string | null;
  mgmtName?: string | null;
  issueType: IssueTypeId;
  issueDescription?: string | null;
  startedOn: IsoDate;
  firstReportedOn: IsoDate;
  firstReportedVia: ReportChannelId;
  priorFollowups: number;
  /** Days since management was first told. */
  daysSinceReport: number;
  estimate: Estimate;
  /** Dates we sent earlier steps, if any. */
  sentOn: Partial<Record<StepId, IsoDate>>;
  /** Open HPD violations at the building, when building data is available. */
  openViolations?: number | null;
  /** From the case agent: one factual sentence about management's latest reply. */
  replyReference?: string | null;
  repairScheduledFor?: IsoDate | null;
  /** Why a missed_repair message is being sent: management said it was fixed, or an appointment passed. */
  missedBecause?: "says_fixed" | "appointment" | null;
  /** Who sends it: the tenant (first person) or the Abate team on their behalf. Defaults to the tenant. */
  voice?: "tenant" | "abate";
  /** Hypothesis 1 split: include the dollar estimate in the first notice. */
  estimateInNotice?: boolean;
};

export type DraftMessage = { subject: string; body: string };

/** How many days management gets to reply to each message. */
export const REPLY_WINDOW_DAYS = 3;

/** "4B" from "Apt 4B", "apt. 4B", "Unit 4B" or "#4B", so letters never say "Apt Apt 4B". */
export function bareUnit(unit: string | null | undefined): string | null {
  const u = unit?.trim().replace(/^(apt|apartment|unit|ste|suite|#)\.?\s*#?\s*/i, "").trim();
  return u ? u : null;
}

function place(ctx: TemplateContext): string {
  const unit = bareUnit(ctx.unit);
  return unit ? `${ctx.address}, Apt ${unit}` : ctx.address;
}

const byAbate = (ctx: TemplateContext) => ctx.voice === "abate";

function firstName(ctx: TemplateContext): string {
  return ctx.tenantName.trim().split(/\s+/)[0] || ctx.tenantName;
}

/** Who reported the problem: "I", or the tenant's first name when Abate writes. */
function who(ctx: TemplateContext): string {
  return byAbate(ctx) ? firstName(ctx) : "I";
}

/** "me" or "us", for "let me know". */
function us(ctx: TemplateContext): string {
  return byAbate(ctx) ? "us" : "me";
}

function greeting(ctx: TemplateContext): string {
  return ctx.mgmtName ? `Hello ${ctx.mgmtName},` : "Hello,";
}

function signature(ctx: TemplateContext): string {
  return byAbate(ctx)
    ? `Thank you,\nThe Abate team, on behalf of ${ctx.tenantName}\n${place(ctx)}`
    : `Thank you,\n${ctx.tenantName}\n${place(ctx)}`;
}

function problem(ctx: TemplateContext): string {
  const issue = getIssueType(ctx.issueType);
  const detail = ctx.issueDescription?.trim();
  return detail ? `${issue.short} (${detail.replace(/\.$/, "")})` : issue.short;
}

function replyBy(ctx: TemplateContext): string {
  return formatLongDate(addDays(ctx.today, REPLY_WINDOW_DAYS));
}

function days(n: number): string {
  return n === 1 ? "1 day" : `${n} days`;
}

/** "It has been 12 days since I first reported it on October 6, 2026" (or a same-day version). */
function sinceReport(ctx: TemplateContext, withDate: boolean): string {
  if (ctx.daysSinceReport <= 0) return withDate ? `${who(ctx)} reported it to you today` : `${who(ctx)} reported it today`;
  const on = withDate ? ` on ${formatFullDate(ctx.firstReportedOn)}` : "";
  return `It has been ${days(ctx.daysSinceReport)} since ${who(ctx)} first reported it${on}`;
}

function followupsPhrase(n: number): string {
  if (n <= 0) return "";
  return n === 1 ? ", and followed up once since" : `, and followed up ${n} times since`;
}

function recordLine(ctx: TemplateContext): string {
  return byAbate(ctx)
    ? `We're keeping a dated record of this request and any replies. ${firstName(ctx)} is copied on this email.`
    : "I'm keeping a dated record of this request and any replies.";
}

/** The warranty-of-habitability sentence with the dollar estimate (formal notice, and the "$" first notice). */
function estimateParagraph(ctx: TemplateContext): string {
  const est = ctx.estimate;
  if (est.high <= 0) return "";
  const range = est.low > 0 ? `between ${formatDollars(est.low)} and ${formatDollars(est.high)}` : `up to ${formatDollars(est.high)}`;
  const basis = byAbate(ctx)
    ? `Based on ${firstName(ctx)}'s rent and how long this has gone on, we estimate that reduction may be ${range} so far`
    : `Based on my rent and how long this has gone on, I estimate that reduction may be ${range} so far`;
  return `Under New York's warranty of habitability, tenants may be entitled to a reduction in rent for the period a condition like this goes unrepaired. ${basis}, and it grows each day the problem continues.`;
}

function referenceLine(ctx: TemplateContext): string {
  const ref = ctx.replyReference?.trim();
  return ref ? `${ref}\n\n` : "";
}

export function buildMessage(step: StepId, ctx: TemplateContext): DraftMessage {
  const where = place(ctx);
  const firstReported = formatFullDate(ctx.firstReportedOn);
  const started = formatFullDate(ctx.startedOn);

  switch (step) {
    case "notice":
      return {
        subject: `Repair needed at ${where}`,
        body: [
          greeting(ctx),
          byAbate(ctx)
            ? `We're writing on behalf of ${ctx.tenantName}, your tenant at ${where}, about a repair that is needed: ${problem(ctx)}.`
            : `I'm writing about a repair needed in my apartment at ${where}: ${problem(ctx)}.`,
          `The problem started on ${started}. ${who(ctx)} first reported it to you on ${firstReported} ${reportChannelPhrase(ctx.firstReportedVia)}${followupsPhrase(ctx.priorFollowups)}. ${ctx.daysSinceReport > 0 ? `It has now been ${days(ctx.daysSinceReport)} since it was first reported, and it` : "It"} is still not fixed.`,
          ...(ctx.estimateInNotice && estimateParagraph(ctx) ? [estimateParagraph(ctx)] : []),
          `Please reply by ${replyBy(ctx)} with the date the repair will be made.`,
          recordLine(ctx),
          signature(ctx),
        ].join("\n\n"),
      };

    case "reminder": {
      const noticeOn = ctx.sentOn.notice;
      return {
        subject: `Following up: repair at ${where}`,
        body: [
          greeting(ctx),
          byAbate(ctx)
            ? `We're following up, on behalf of ${ctx.tenantName}, on our ${noticeOn ? `message of ${formatFullDate(noticeOn)}` : "earlier message"} about ${problem(ctx)} at ${where}. We haven't received a repair date yet.`
            : `I'm following up on my ${noticeOn ? `message of ${formatFullDate(noticeOn)}` : "earlier message"} about ${problem(ctx)} at ${where}. I haven't received a repair date yet.`,
          `${referenceLine(ctx)}The problem started on ${started}. ${sinceReport(ctx, true)}.`,
          `Please reply by ${replyBy(ctx)} with the date the repair will be made.`,
          signature(ctx),
        ].join("\n\n"),
      };
    }

    case "formal_notice": {
      const lines = [
        `- ${formatFullDate(ctx.startedOn)}: the problem started`,
        `- ${firstReported}: first reported to you ${reportChannelPhrase(ctx.firstReportedVia)}`,
      ];
      if (ctx.sentOn.notice) lines.push(`- ${formatFullDate(ctx.sentOn.notice)}: written notice sent`);
      if (ctx.sentOn.reminder) lines.push(`- ${formatFullDate(ctx.sentOn.reminder)}: written follow-up sent`);
      lines.push(`- ${formatFullDate(ctx.today)}: still not repaired${ctx.daysSinceReport > 0 ? `, ${days(ctx.daysSinceReport)} after it was first reported` : ""}`);

      const violations =
        ctx.openViolations && ctx.openViolations > 0
          ? `\n\nNYC HPD records currently list ${ctx.openViolations} open ${ctx.openViolations === 1 ? "violation" : "violations"} at this building.`
          : "";

      const warranty =
        estimateParagraph(ctx) ||
        "Under New York's warranty of habitability, tenants may be entitled to a reduction in rent for the period a condition like this goes unrepaired.";

      return {
        subject: `Formal notice: unresolved repair at ${where}`,
        body: [
          greeting(ctx),
          `This is a formal notice${byAbate(ctx) ? `, sent on behalf of ${ctx.tenantName},` : ""} about ${problem(ctx)} at ${where}, which remains unrepaired.`,
          `Timeline:\n${lines.join("\n")}`,
          `${referenceLine(ctx)}${warranty}${violations}`,
          `Please make the repair and confirm the repair date in writing by ${replyBy(ctx)}.`,
          recordLine(ctx),
          signature(ctx),
        ].join("\n\n"),
      };
    }

    case "guide_311":
      return {
        subject: `311 complaint filed: ${where}`,
        body: [
          greeting(ctx),
          byAbate(ctx)
            ? `Because ${problem(ctx)} at ${where} is still not repaired, ${ctx.tenantName} has filed a complaint with NYC 311. The complaint number is [add your 311 number].`
            : `Because ${problem(ctx)} at ${where} is still not repaired, I have filed a complaint with NYC 311. My complaint number is [add your 311 number].`,
          `${who(ctx)} first reported this problem to you on ${firstReported}. Please make the repair and let ${us(ctx)} know the repair date in writing.`,
          signature(ctx),
        ].join("\n\n"),
      };

    case "ask_date":
      return {
        subject: `Re: repair at ${where}`,
        body: [
          greeting(ctx),
          `Thank you for your reply about ${problem(ctx)} at ${where}.`,
          `${referenceLine(ctx)}Could you please confirm the specific date the repair will be made? ${sinceReport(ctx, true)}.`,
          `Please reply by ${replyBy(ctx)}.`,
          signature(ctx),
        ].join("\n\n"),
      };

    case "confirm_schedule": {
      const when = ctx.repairScheduledFor ? formatLongDate(ctx.repairScheduledFor) : "[add the repair date]";
      return {
        subject: `Re: repair at ${where}`,
        body: [
          greeting(ctx),
          `Thank you for scheduling the repair of ${problem(ctx)} at ${where} for ${when}.`,
          `Please let ${us(ctx)} know right away if that date changes.`,
          signature(ctx),
        ].join("\n\n"),
      };
    }

    case "offer_access":
      return {
        subject: `Re: access for repair at ${where}`,
        body: [
          greeting(ctx),
          `Thank you for your reply about ${problem(ctx)} at ${where}.`,
          `${referenceLine(ctx)}${who(ctx)} can provide access at these times: [add days and times that work for you]. Please confirm which works and the date the repair will be made.`,
          signature(ctx),
        ].join("\n\n"),
      };

    case "missed_repair": {
      const appointmentPassed =
        ctx.missedBecause !== "says_fixed" && Boolean(ctx.repairScheduledFor) && ctx.repairScheduledFor! < ctx.today;
      const opening = appointmentPassed
        ? `The repair of ${problem(ctx)} at ${where} that was scheduled for ${formatFullDate(ctx.repairScheduledFor!)} did not happen or did not fix the problem. It is still not fixed.`
        : ctx.missedBecause === "says_fixed"
          ? `${byAbate(ctx) ? "We were" : "I was"} told the repair of ${problem(ctx)} at ${where} was complete, but the problem is still not fixed.`
          : `The problem with ${problem(ctx)} at ${where} is still not fixed.`;
      return {
        subject: appointmentPassed ? `Repair did not fix the problem: ${where}` : `Still not fixed: ${where}`,
        body: [
          greeting(ctx),
          opening,
          `${sinceReport(ctx, true)}. Please reply by ${replyBy(ctx)} with a new repair date.`,
          recordLine(ctx),
          signature(ctx),
        ].join("\n\n"),
      };
    }
  }
}

/** Placeholders the tenant must fill in before sending. */
export function unfilledPlaceholders(body: string): string[] {
  return body.match(/\[add [^\]]+\]/g) ?? [];
}
