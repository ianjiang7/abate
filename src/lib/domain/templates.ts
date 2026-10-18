// Message templates for each ladder step. Legal wording lives only here, reviewed by the team.
// The case agent may supply `replyReference` (a factual sentence about management's last reply)
// and dates it read from the reply; it never writes any other part of a message.

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
};

export type DraftMessage = { subject: string; body: string };

/** How many days management gets to reply to each message. */
export const REPLY_WINDOW_DAYS = 3;

function place(ctx: TemplateContext): string {
  return ctx.unit ? `${ctx.address}, Apt ${ctx.unit}` : ctx.address;
}

function greeting(ctx: TemplateContext): string {
  return ctx.mgmtName ? `Hello ${ctx.mgmtName},` : "Hello,";
}

function signature(ctx: TemplateContext): string {
  return `Thank you,\n${ctx.tenantName}\n${place(ctx)}`;
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

function followupsPhrase(n: number): string {
  if (n <= 0) return "";
  return n === 1 ? ", and followed up once since" : `, and followed up ${n} times since`;
}

const RECORD_LINE = "I'm keeping a dated record of this request and any replies.";

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
          `I'm writing about a repair needed in my apartment at ${where}: ${problem(ctx)}.`,
          `The problem started on ${started}. I first reported it to you on ${firstReported} ${reportChannelPhrase(ctx.firstReportedVia)}${followupsPhrase(ctx.priorFollowups)}. It has now been ${days(ctx.daysSinceReport)} since I first reported it, and it is still not fixed.`,
          `Please reply by ${replyBy(ctx)} with the date the repair will be made.`,
          RECORD_LINE,
          signature(ctx),
        ].join("\n\n"),
      };

    case "reminder": {
      const noticeOn = ctx.sentOn.notice;
      return {
        subject: `Following up: repair at ${where}`,
        body: [
          greeting(ctx),
          `I'm following up on my ${noticeOn ? `message of ${formatFullDate(noticeOn)}` : "earlier message"} about ${problem(ctx)} at ${where}. I haven't received a repair date yet.`,
          `${referenceLine(ctx)}The problem started on ${started}, and it has been ${days(ctx.daysSinceReport)} since I first reported it on ${firstReported}.`,
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
      lines.push(`- ${formatFullDate(ctx.today)}: still not repaired, ${days(ctx.daysSinceReport)} after my first report`);

      const violations =
        ctx.openViolations && ctx.openViolations > 0
          ? `\n\nNYC HPD records currently list ${ctx.openViolations} open ${ctx.openViolations === 1 ? "violation" : "violations"} at this building.`
          : "";

      const est = ctx.estimate;
      const estimate =
        est.high > 0
          ? ` Based on my rent and how long this has gone on, I estimate that reduction may be between ${formatDollars(est.low)} and ${formatDollars(est.high)} so far, and it grows each day the problem continues.`
          : "";

      return {
        subject: `Formal notice: unresolved repair at ${where}`,
        body: [
          greeting(ctx),
          `This is a formal notice about ${problem(ctx)} at ${where}, which remains unrepaired.`,
          `Timeline:\n${lines.join("\n")}`,
          `${referenceLine(ctx)}Under New York's warranty of habitability, tenants may be entitled to a reduction in rent for the period a condition like this goes unrepaired.${estimate}${violations}`,
          `Please make the repair and confirm the repair date in writing by ${replyBy(ctx)}.`,
          RECORD_LINE,
          signature(ctx),
        ].join("\n\n"),
      };
    }

    case "guide_311":
      return {
        subject: `311 complaint filed: ${where}`,
        body: [
          greeting(ctx),
          `Because ${problem(ctx)} at ${where} is still not repaired, I have filed a complaint with NYC 311. My complaint number is [add your 311 number].`,
          `I first reported this problem to you on ${firstReported}. Please make the repair and let me know the repair date in writing.`,
          signature(ctx),
        ].join("\n\n"),
      };

    case "ask_date":
      return {
        subject: `Re: repair at ${where}`,
        body: [
          greeting(ctx),
          `Thank you for your reply about ${problem(ctx)} at ${where}.`,
          `${referenceLine(ctx)}Could you please confirm the specific date the repair will be made? It has been ${days(ctx.daysSinceReport)} since I first reported it on ${firstReported}.`,
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
          `Please let me know right away if that date changes.`,
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
          `${referenceLine(ctx)}I can provide access at these times: [add days and times that work for you]. Please confirm which works and the date the repair will be made.`,
          signature(ctx),
        ].join("\n\n"),
      };

    case "missed_repair": {
      const when = ctx.repairScheduledFor ? formatFullDate(ctx.repairScheduledFor) : "the scheduled date";
      return {
        subject: `Repair did not happen: ${where}`,
        body: [
          greeting(ctx),
          `The repair of ${problem(ctx)} at ${where} that was scheduled for ${when} did not happen, and the problem is still not fixed.`,
          `It has been ${days(ctx.daysSinceReport)} since I first reported it on ${firstReported}. Please reply by ${replyBy(ctx)} with a new repair date.`,
          RECORD_LINE,
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
