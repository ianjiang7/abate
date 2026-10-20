import "server-only";
import { randomUUID } from "node:crypto";
import { cache } from "react";
import { db, PHOTO_BUCKET } from "@/lib/db/client";
import type { IssueTypeId, ReportChannelId } from "@/lib/domain/issues";
import type { ReplyCategory, StepId } from "@/lib/domain/ladder";
import { newCaseCode, newCaseToken } from "./ids";
import type { CaseBundle, CaseRecord, MessageRecord, PhotoRecord } from "./types";
import type { NewCaseInput } from "./validation";

const CASE_COLUMNS =
  "id, token, code, created_at, address, unit, borough, bbl, bin, issue_type, issue_description, started_on, first_reported_on, first_reported_via, prior_followups, monthly_rent, tenant_name, tenant_contact, mgmt_name, mgmt_email, status, send_mode, send_mode_chosen, dollar_in_notice, send_authorized_at, tenant_email, paused_at, pause_reason, repair_scheduled_for, repair_scheduled_at, repair_missed_at, fixed_on, help_requested_at";

const MESSAGE_COLUMNS =
  "id, case_id, direction, created_at, step, subject, body, sent_at, approved_at, ready_on, sent_by, claimed_at, withdrawn_at, edited, draft_body, received_at, logged_by, classification, ai_classification, classified_by, classified_at, classification_summary, classification_date, reply_reference, ai_source";

type Row = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v : null);

function toCase(r: Row): CaseRecord {
  return {
    id: r.id as string,
    token: r.token as string,
    code: r.code as string,
    createdAt: r.created_at as string,
    address: r.address as string,
    unit: str(r.unit),
    borough: str(r.borough),
    bbl: str(r.bbl),
    bin: str(r.bin),
    issueType: r.issue_type as IssueTypeId,
    issueDescription: str(r.issue_description),
    startedOn: r.started_on as string,
    firstReportedOn: r.first_reported_on as string,
    firstReportedVia: r.first_reported_via as ReportChannelId,
    priorFollowups: Number(r.prior_followups ?? 0),
    monthlyRent: Number(r.monthly_rent ?? 0),
    tenantName: r.tenant_name as string,
    tenantContact: str(r.tenant_contact),
    mgmtName: str(r.mgmt_name),
    mgmtEmail: str(r.mgmt_email),
    status: r.status === "fixed" ? "fixed" : "open",
    sendMode: r.send_mode === "abate" ? "abate" : "self",
    sendModeChosen: Boolean(r.send_mode_chosen),
    dollarInNotice: typeof r.dollar_in_notice === "boolean" ? r.dollar_in_notice : null,
    sendAuthorizedAt: str(r.send_authorized_at),
    tenantEmail: str(r.tenant_email),
    pausedAt: str(r.paused_at),
    pauseReason: str(r.pause_reason),
    repairScheduledFor: str(r.repair_scheduled_for),
    repairScheduledAt: str(r.repair_scheduled_at),
    repairMissedAt: str(r.repair_missed_at),
    fixedOn: str(r.fixed_on),
    helpRequestedAt: str(r.help_requested_at),
  };
}

function toMessage(r: Row): MessageRecord {
  return {
    id: r.id as string,
    direction: r.direction === "incoming" ? "incoming" : "outgoing",
    createdAt: r.created_at as string,
    step: (str(r.step) as StepId | null) ?? null,
    subject: str(r.subject),
    body: str(r.body),
    sentAt: str(r.sent_at),
    approvedAt: str(r.approved_at),
    readyOn: str(r.ready_on),
    sentBy: r.sent_by === "team" ? "team" : r.sent_by === "tenant" ? "tenant" : null,
    claimedAt: str(r.claimed_at),
    withdrawnAt: str(r.withdrawn_at),
    edited: typeof r.edited === "boolean" ? r.edited : null,
    draftBody: str(r.draft_body),
    receivedAt: str(r.received_at),
    loggedBy: r.logged_by === "team" ? "team" : r.logged_by === "tenant" ? "tenant" : null,
    classification: (str(r.classification) as ReplyCategory | null) ?? null,
    aiClassification: (str(r.ai_classification) as ReplyCategory | null) ?? null,
    classifiedBy: r.classified_by === "agent" || r.classified_by === "team" || r.classified_by === "tenant" ? r.classified_by : null,
    classifiedAt: str(r.classified_at),
    classificationSummary: str(r.classification_summary),
    classificationDate: str(r.classification_date),
    replyReference: str(r.reply_reference),
    aiSource: str(r.ai_source),
  };
}

function check<T>(result: { data: T; error: { message: string; code?: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what} failed: ${result.error.message}`);
  return result.data;
}

/** Inserts a case, retrying if the random token or code collides. */
export async function insertCase(
  input: NewCaseInput,
  extra: { isTest: boolean; invitedByCaseId: string | null; nextStep: string; nextDueOn: string; dollarInNotice: boolean },
): Promise<{ id: string; token: string; code: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = newCaseToken();
    const code = newCaseCode();
    const { data, error } = await db()
      .from("cases")
      .insert({
        token,
        code,
        is_test: extra.isTest,
        address: input.address,
        unit: input.unit,
        borough: input.borough,
        bbl: input.bbl,
        bin: input.bin,
        issue_type: input.issueType,
        issue_description: input.issueDescription,
        started_on: input.startedOn,
        first_reported_on: input.firstReportedOn,
        first_reported_via: input.firstReportedVia,
        prior_followups: input.priorFollowups,
        monthly_rent: input.monthlyRent,
        tenant_name: input.tenantName,
        tenant_contact: input.tenantContact,
        mgmt_name: input.mgmtName,
        mgmt_email: input.mgmtEmail,
        ai_consent: true,
        send_mode: input.sendMode,
        send_mode_chosen: true,
        dollar_in_notice: extra.dollarInNotice,
        send_authorized_at: input.sendMode === "abate" ? new Date().toISOString() : null,
        tenant_email: input.sendMode === "abate" ? input.tenantEmail : null,
        invited_by_case_id: extra.invitedByCaseId,
        next_step: extra.nextStep,
        next_due_on: extra.nextDueOn,
      })
      .select("id, token, code")
      .single();
    if (!error && data) return data as { id: string; token: string; code: string };
    if (error?.code !== "23505") throw new Error(`Creating the case failed: ${error?.message}`);
  }
  throw new Error("Creating the case failed: could not generate a unique code.");
}

export async function uploadCasePhotos(caseId: string, files: File[]): Promise<number> {
  let uploaded = 0;
  for (const file of files) {
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${caseId}/${randomUUID()}.${ext}`;
    const { error } = await db().storage.from(PHOTO_BUCKET).upload(path, file, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });
    if (error) continue;
    const takenAt = file.lastModified ? new Date(file.lastModified).toISOString() : null;
    const insert = await db().from("photos").insert({ case_id: caseId, storage_path: path, taken_at: takenAt });
    if (!insert.error) uploaded++;
  }
  return uploaded;
}

/** Everything the case page needs, read fresh on every request. Deduped within one render. */
export const getCaseBundle = cache(async (token: string): Promise<CaseBundle | null> => {
  const caseRes = await db().from("cases").select(CASE_COLUMNS).eq("token", token).maybeSingle();
  const row = check(caseRes, "Loading the case");
  if (!row) return null;
  const record = toCase(row as Row);

  const [messagesRes, photosRes] = await Promise.all([
    db().from("messages").select(MESSAGE_COLUMNS).eq("case_id", record.id).order("created_at", { ascending: true }),
    db().from("photos").select("id, storage_path").eq("case_id", record.id).order("created_at", { ascending: true }),
  ]);
  const messages = (check(messagesRes, "Loading messages") ?? []).map((m) => toMessage(m as Row));
  const photoRows = (check(photosRes, "Loading photos") ?? []) as Array<{ id: string; storage_path: string }>;

  let photos: PhotoRecord[] = photoRows.map((p) => ({ id: p.id, url: null }));
  if (photoRows.length > 0) {
    const signed = await db()
      .storage.from(PHOTO_BUCKET)
      .createSignedUrls(
        photoRows.map((p) => p.storage_path),
        60 * 60,
      );
    if (!signed.error && signed.data) {
      photos = photoRows.map((p, i) => ({ id: p.id, url: signed.data[i]?.signedUrl ?? null }));
    }
  }
  return { record, messages, photos };
});

/** Minimal lookup for actions: the case id and the fields they need, by private token. */
export async function findCaseByToken(token: string): Promise<CaseRecord | null> {
  const res = await db().from("cases").select(CASE_COLUMNS).eq("token", token).maybeSingle();
  const row = check(res, "Finding the case");
  return row ? toCase(row as Row) : null;
}

export async function listMessages(caseId: string): Promise<MessageRecord[]> {
  const res = await db().from("messages").select(MESSAGE_COLUMNS).eq("case_id", caseId).order("created_at", { ascending: true });
  return (check(res, "Loading messages") ?? []).map((m) => toMessage(m as Row));
}

/**
 * For neighbor invites: the inviter's building, never their unit or anything private. Only cases
 * whose address came from the NYC geocoder qualify; a typed address could include the apartment.
 */
export async function findBuildingByCode(code: string): Promise<{ id: string; address: string; borough: string | null; bbl: string; bin: string | null } | null> {
  const res = await db().from("cases").select("id, address, borough, bbl, bin").eq("code", code).not("bbl", "is", null).maybeSingle();
  const row = check(res, "Finding the invite");
  return (row as { id: string; address: string; borough: string | null; bbl: string; bin: string | null } | null) ?? null;
}

/** Team page: every real case (or test cases, for the end-to-end test) with its messages. */
/** "real": testers only. "all": testers and automated test cases. "test": automated test cases only. */
export type CaseScope = "real" | "all" | "test";

export async function listCasesWithMessages(scope: CaseScope): Promise<Array<{ record: CaseRecord; messages: MessageRecord[]; isTest: boolean }>> {
  let q = db().from("cases").select(`${CASE_COLUMNS}, is_test`).order("created_at", { ascending: false }).limit(500);
  if (scope === "real") q = q.eq("is_test", false);
  if (scope === "test") q = q.eq("is_test", true);
  const casesRes = await q;
  const rows = (check(casesRes, "Loading cases") ?? []) as Row[];
  if (rows.length === 0) return [];
  const msgRes = await db()
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .in(
      "case_id",
      rows.map((r) => r.id as string),
    )
    .order("created_at", { ascending: true });
  const msgs = (check(msgRes, "Loading messages") ?? []) as Row[];
  const byCase = new Map<string, MessageRecord[]>();
  for (const m of msgs) {
    const list = byCase.get(m.case_id as string) ?? [];
    list.push(toMessage(m));
    byCase.set(m.case_id as string, list);
  }
  return rows.map((r) => ({ record: toCase(r), messages: byCase.get(r.id as string) ?? [], isTest: Boolean(r.is_test) }));
}

export async function findMessageWithCase(messageId: string): Promise<{ message: MessageRecord; record: CaseRecord } | null> {
  const res = await db().from("messages").select(MESSAGE_COLUMNS).eq("id", messageId).maybeSingle();
  const row = check(res, "Finding the message") as Row | null;
  if (!row) return null;
  const caseRes = await db().from("cases").select(CASE_COLUMNS).eq("id", row.case_id as string).maybeSingle();
  const caseRow = check(caseRes, "Finding the case") as Row | null;
  return caseRow ? { message: toMessage(row), record: toCase(caseRow) } : null;
}

export async function findCaseByCode(code: string): Promise<CaseRecord | null> {
  const res = await db().from("cases").select(CASE_COLUMNS).eq("code", code).maybeSingle();
  const row = check(res, "Finding the case") as Row | null;
  return row ? toCase(row) : null;
}

export async function countEvents(name: string, scope: CaseScope): Promise<number> {
  let q = db().from("events").select("id, cases!inner(is_test)", { count: "exact", head: true }).eq("name", name);
  if (scope === "real") q = q.eq("cases.is_test", false);
  if (scope === "test") q = q.eq("cases.is_test", true);
  const res = await q;
  if (res.error) throw new Error(`Counting events failed: ${res.error.message}`);
  return res.count ?? 0;
}

/** How many cases of this sender type already got each first-notice version (to keep the groups even). */
export async function countDollarGroups(sendMode: "abate" | "self", isTest: boolean): Promise<{ with: number; without: number }> {
  const count = async (value: boolean) => {
    const res = await db()
      .from("cases")
      .select("id", { count: "exact", head: true })
      .eq("is_test", isTest)
      .eq("send_mode_chosen", true)
      .eq("send_mode", sendMode)
      .eq("dollar_in_notice", value);
    if (res.error) throw new Error(`Counting groups failed: ${res.error.message}`);
    return res.count ?? 0;
  };
  const [withCount, withoutCount] = await Promise.all([count(true), count(false)]);
  return { with: withCount, without: withoutCount };
}

/** Abuse guards: how many real cases were created, and replies read for one case, since a time. */
export async function countCasesSince(sinceIso: string): Promise<number> {
  const res = await db().from("cases").select("id", { count: "exact", head: true }).eq("is_test", false).gte("created_at", sinceIso);
  if (res.error) throw new Error(`Counting cases failed: ${res.error.message}`);
  return res.count ?? 0;
}

export async function countRepliesSince(caseId: string, sinceIso: string): Promise<number> {
  const res = await db()
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("case_id", caseId)
    .eq("direction", "incoming")
    .gte("created_at", sinceIso);
  if (res.error) throw new Error(`Counting replies failed: ${res.error.message}`);
  return res.count ?? 0;
}

export async function insertMessage(caseId: string, fields: Record<string, unknown>): Promise<string> {
  const res = await db()
    .from("messages")
    .insert({ case_id: caseId, ...fields })
    .select("id")
    .single();
  return (check(res, "Saving the message") as { id: string }).id;
}

export async function updateMessage(caseId: string, messageId: string, patch: Record<string, unknown>): Promise<boolean> {
  const res = await db().from("messages").update(patch).eq("id", messageId).eq("case_id", caseId).select("id");
  return (check(res, "Updating the message") ?? []).length > 0;
}

export async function deleteMessage(caseId: string, messageId: string): Promise<void> {
  const res = await db().from("messages").delete().eq("id", messageId).eq("case_id", caseId);
  check(res, "Withdrawing the message");
}

export async function updateCase(caseId: string, patch: Record<string, unknown>): Promise<void> {
  const res = await db().from("cases").update(patch).eq("id", caseId);
  check(res, "Updating the case");
}

/** Records a funnel event. Never throws: analytics must not break the tenant's flow. */
export async function logEvent(caseId: string | null, name: string, props: Record<string, unknown> = {}): Promise<void> {
  try {
    await db().from("events").insert({ case_id: caseId, name, props });
  } catch {
    // ignore
  }
}
