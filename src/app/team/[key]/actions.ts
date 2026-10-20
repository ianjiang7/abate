"use server";

import { refresh } from "next/cache";
import { teamClaim, teamClassify, teamLogReply, teamMarkSent, teamSetMgmtEmail } from "@/lib/cases/service";
import { categorySchema, replySchema } from "@/lib/cases/validation";
import { isIsoDate, nyDate } from "@/lib/domain/dates";
import type { ReplyCategory } from "@/lib/domain/ladder";
import { isTeamKey } from "@/lib/team/auth";

export type TeamActionState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
  /** Echoed back on errors so the form can keep what the teammate typed. */
  values?: Record<string, string>;
  /** Set when a teammate already opened this message recently. */
  claimed?: "recently";
};

const DENIED: TeamActionState = { ok: false, message: "This team link isn't valid." };
const FAILED: TeamActionState = { ok: false, message: "Something went wrong. Refresh and try again." };

const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

function readCategory(fd: FormData): { category: ReplyCategory; scheduledFor: string | null } | { error: Record<string, string> } {
  const category = categorySchema.safeParse(text(fd, "category"));
  if (!category.success) return { error: { category: "Choose what the reply said." } };
  const scheduledFor = text(fd, "scheduledFor");
  if (category.data === "scheduled" && !isIsoDate(scheduledFor)) return { error: { scheduledFor: "Pick the repair date." } };
  return { category: category.data as ReplyCategory, scheduledFor: category.data === "scheduled" ? scheduledFor : null };
}

/** Called right before "Open in Gmail" or "Copy": re-checks the case and claims the message. */
export async function claimAction(key: string, messageId: string, force: boolean): Promise<TeamActionState> {
  if (!isTeamKey(key)) return DENIED;
  if (!/^[0-9a-f-]{36}$/i.test(messageId)) return { ok: false, message: "Unknown message." };
  try {
    const result = await teamClaim(messageId, force);
    if (!result.ok) {
      if (!result.claimed) refresh();
      return { ok: false, message: result.message, claimed: result.claimed };
    }
  } catch {
    return FAILED;
  }
  return { ok: true };
}

export async function mgmtEmailAction(key: string, code: string, _prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  if (!isTeamKey(key)) return DENIED;
  const email = text(formData, "email").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return { ok: false, errors: { email: "That email doesn't look right." }, values: { email } };
  try {
    const result = await teamSetMgmtEmail(code, email);
    if (!result.ok) return { ok: false, message: result.message };
  } catch {
    return FAILED;
  }
  refresh();
  return { ok: true };
}

export async function markSentAction(key: string, messageId: string): Promise<TeamActionState> {
  if (!isTeamKey(key)) return DENIED;
  if (!/^[0-9a-f-]{36}$/i.test(messageId)) return { ok: false, message: "Unknown message." };
  try {
    const result = await teamMarkSent(messageId);
    if (!result.ok) return { ok: false, message: result.message };
  } catch {
    return FAILED;
  }
  refresh();
  return { ok: true };
}

export async function classifyAction(key: string, _prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  if (!isTeamKey(key)) return DENIED;
  const messageId = text(formData, "messageId");
  if (!/^[0-9a-f-]{36}$/i.test(messageId)) return { ok: false, message: "Unknown reply." };
  const reading = readCategory(formData);
  if ("error" in reading) return { ok: false, errors: reading.error };
  try {
    const result = await teamClassify(messageId, reading.category, reading.scheduledFor);
    if (!result.ok) return { ok: false, message: result.message };
  } catch {
    return FAILED;
  }
  refresh();
  return { ok: true };
}

export async function logReplyAction(key: string, _prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  if (!isTeamKey(key)) return DENIED;
  const values = { code: text(formData, "code"), text: text(formData, "text"), receivedOn: text(formData, "receivedOn") };
  const result = await logReplyInner(formData);
  return result.ok ? result : { ...result, values };
}

async function logReplyInner(formData: FormData): Promise<TeamActionState> {
  const code = text(formData, "code").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return { ok: false, errors: { code: "Choose a case." } };
  const parsed = replySchema.safeParse({ text: text(formData, "text"), receivedOn: text(formData, "receivedOn") || nyDate() });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { ok: false, errors };
  }
  if (parsed.data.receivedOn > nyDate()) return { ok: false, errors: { receivedOn: "That date is in the future." } };
  const reading = readCategory(formData);
  if ("error" in reading) return { ok: false, errors: reading.error };
  try {
    const result = await teamLogReply(code, parsed.data.text, parsed.data.receivedOn, reading.category, reading.scheduledFor);
    if (!result.ok) return { ok: false, message: result.message };
  } catch {
    return FAILED;
  }
  refresh();
  return { ok: true };
}
