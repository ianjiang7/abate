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
  issueType: IssueTypeId;
  issueDescription: string | null;
  startedOn: IsoDate;
  firstReportedOn: IsoDate;
  firstReportedVia: ReportChannelId;
  priorFollowups: number;
  monthlyRent: number;
  tenantName: string;
  mgmtName: string | null;
  mgmtEmail: string | null;
  status: "open" | "fixed";
  repairScheduledFor: IsoDate | null;
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
  receivedAt: string | null;
  loggedBy: "tenant" | "team" | null;
  classification: ReplyCategory | null;
  aiClassification: ReplyCategory | null;
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
