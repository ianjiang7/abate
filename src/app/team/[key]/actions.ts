"use server";

import { refresh } from "next/cache";
import { teamClassify, teamLogReply, teamMarkSent } from "@/lib/cases/service";
import { categorySchema, replySchema } from "@/lib/cases/validation";
import { isIsoDate, nyDate } from "@/lib/domain/dates";
import type { ReplyCategory } from "@/lib/domain/ladder";
import { isTeamKey } from "@/lib/team/auth";

export type TeamActionState = { ok?: boolean; message?: string; errors?: Record<string, string> };

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
  const code = text(formData, "code").trim().toUpperCase();
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
