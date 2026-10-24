import type { IsoDate } from "@/lib/domain/dates";
import type { IssueTypeId, ReportChannelId } from "@/lib/domain/issues";
import type { ReplyCategory, StepId } from "@/lib/domain/ladder";

/** A row of public.cases, as the app uses it. */
export type CaseRecord = {
  id: string;
  token: string;
  code: string;
  createdAt: string;
  address: string;
  unit: string | null;
  borough: string | null;
  bbl: string | null;
  bin: string | null;
  /** Every problem the tenant picked, most serious first. Never empty. */
  issueTypes: IssueTypeId[];
  issueDescription: string | null;
  startedOn: IsoDate;
  firstReportedOn: IsoDate;
  firstReportedVia: ReportChannelId;
  priorFollowups: number;
  monthlyRent: number;
  tenantName: string;
  tenantContact: string | null;
  mgmtName: string | null;
  mgmtEmail: string | null;
  status: "open" | "fixed";
  /** "abate": the team sends follow-ups on the tenant's behalf. "self": the tenant sends them. */
  sendMode: "abate" | "self";
  /** The tenant was offered the who-sends choice (cases created before the concierge pilot weren't). */
  sendModeChosen: boolean;
  /** Hypothesis 1 split: whether the first notice includes the dollar estimate (null before the split). */
  dollarInNotice: boolean | null;
  sendAuthorizedAt: string | null;
  tenantEmail: string | null;
  pausedAt: string | null;
  pauseReason: string | null;
  repairScheduledFor: IsoDate | null;
  repairScheduledAt: string | null;
  repairMissedAt: string | null;
  fixedOn: IsoDate | null;
  helpRequestedAt: string | null;
};

export type MessageRecord = {
  id: string;
  direction: "outgoing" | "incoming";
  createdAt: string;
  step: StepId | null;
  subject: string | null;
  body: string | null;
  sentAt: string | null;
  /** Abate mode: when the tenant approved the team sending it. */
  approvedAt: string | null;
  /** The day this step became ready to send. */
  readyOn: IsoDate | null;
  sentBy: "team" | "tenant" | null;
  /** A teammate opened it to send. */
  claimedAt: string | null;
  /** Approved but never sent (paused, switched, or a reply changed the plan). */
  withdrawnAt: string | null;
  /** Whether the tenant changed the template before approving or sending, and the template text. */
  edited: boolean | null;
  draftBody: string | null;
  receivedAt: string | null;
  loggedBy: "tenant" | "team" | null;
  classification: ReplyCategory | null;
  aiClassification: ReplyCategory | null;
  classifiedBy: "agent" | "team" | "tenant" | null;
  /** When someone decided what this reply meant. */
  classifiedAt: string | null;
  classificationSummary: string | null;
  classificationDate: IsoDate | null;
  replyReference: string | null;
  aiSource: string | null;
};

export type PhotoRecord = { id: string; url: string | null };

export type CaseBundle = {
  record: CaseRecord;
  messages: MessageRecord[];
  photos: PhotoRecord[];
};
