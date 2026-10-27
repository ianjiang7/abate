"use server";

import { refresh } from "next/cache";
import { isCaseToken } from "@/lib/cases/ids";
import { confirmFixed, correctReply, logReply, pauseCase, recordClientEvent, recordStep, reportNotFixed, requestHelp, resumeCase, saveContact } from "@/lib/cases/service";
import { categorySchema, helpSchema, pauseReasonSchema, replySchema } from "@/lib/cases/validation";
import { isIsoDate, nyDate } from "@/lib/domain/dates";
import type { ReplyCategory, StepId } from "@/lib/domain/ladder";
import { STEP_LABELS } from "@/lib/domain/ladder";

export type CaseActionState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
};

const NOT_FOUND: CaseActionState = { ok: false, message: "We couldn't find this case. Check the link and try again." };
const FAILED: CaseActionState = { ok: false, message: "Something went wrong. Refresh the page and try again." };

const isStep = (v: unknown): v is StepId => typeof v === "string" && v in STEP_LABELS;
const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

export async function sendAction(token: string, _prev: CaseActionState, formData: FormData): Promise<CaseActionState> {
  if (!isCaseToken(token)) return NOT_FOUND;
  const step = text(formData, "step");
  const subject = text(formData, "subject").trim().slice(0, 300);
  const body = text(formData, "body").trim().slice(0, 10_000);
  if (!isStep(step) || !subject || !body) return { ok: false, message: "The message is empty. Add some text and try again." };
  const draftedOn = text(formData, "draftedOn");
  const shown = isIsoDate(draftedOn) ? { draftedOn } : null;
  try {
    const result = await recordStep(token, step, subject, body, shown);
    if (!result.ok) return { ok: false, message: result.message };
  } catch {
    return FAILED;
  }
  refresh();
  return { ok: true };
}

export async function replyAction(token: string, _prev: CaseActionState, formData: FormData): Promise<CaseActionState> {
  if (!isCaseToken(token)) return NOT_FOUND;
  const parsed = replySchema.safeParse({ text: text(formData, "text"), receivedOn: text(formData, "receivedOn") || nyDate() });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { ok: false, errors };
  }
  if (parsed.data.receivedOn > nyDate()) return { ok: false, errors: { receivedOn: "That date is in the future." } };
  try {
    const result = await logReply(token, parsed.data.text, parsed.data.receivedOn);
    if (!result.ok) return { ok: false, message: result.message };
    refresh();
    return { ok: true };
  } catch {
    return FAILED;
  }
}

export async function correctReplyAction(token: string, _prev: CaseActionState, formData: FormData): Promise<CaseActionState> {
  if (!isCaseToken(token)) return NOT_FOUND;
  const messageId = text(formData, "messageId");
  const category = categorySchema.safeParse(text(formData, "category"));
  const scheduledFor = text(formData, "scheduledFor");
  if (!/^[0-9a-f-]{36}$/i.test(messageId) || !category.success) return { ok: false, message: "Choose what their reply said." };
  if (category.data === "scheduled" && !isIsoDate(scheduledFor)) return { ok: false, errors: { scheduledFor: "Pick the repair date." } };
  try {
    const result = await correctReply(token, messageId, category.data as ReplyCategory, category.data === "scheduled" ? scheduledFor : null);
    if (!result.ok) return { ok: false, message: result.message };
  } catch {
    return FAILED;
  }
  refresh();
  return { ok: true };
}

export async function fixedAction(token: string, _prev: CaseActionState, formData: FormData): Promise<CaseActionState> {
  if (!isCaseToken(token)) return NOT_FOUND;
  const fixedOn = text(formData, "fixedOn") || nyDate();
  if (!isIsoDate(fixedOn) || fixedOn > nyDate()) return { ok: false, errors: { fixedOn: "Pick the date it was fixed." } };
  try {
    const result = await confirmFixed(token, fixedOn);
    if (!result.ok) return { ok: false, message: result.message };
  } catch {
    return FAILED;
  }
  refresh();
  return { ok: true };
}

export async function notFixedAction(token: string): Promise<CaseActionState> {
  if (!isCaseToken(token)) return NOT_FOUND;
  try {
    const result = await reportNotFixed(token);
    if (!result.ok) return { ok: false, message: result.message };
  } catch {
    return FAILED;
  }
  refresh();
  return { ok: true };
}

export async function helpAction(token: string, _prev: CaseActionState, formData: FormData): Promise<CaseActionState> {
  if (!isCaseToken(token)) return NOT_FOUND;
  const parsed = helpSchema.safeParse({ contact: text(formData, "contact") });
  if (!parsed.success) return { ok: false, errors: { contact: parsed.error.issues[0]?.message ?? "Add a phone number or email." } };
  try {
    const result = await requestHelp(token, parsed.data.contact);
    if (!result.ok) return { ok: false, message: result.message };
  } catch {
    return FAILED;
  }
  refresh();
  return { ok: true };
}

export async function contactAction(token: string, _prev: CaseActionState, formData: FormData): Promise<CaseActionState> {
  if (!isCaseToken(token)) return NOT_FOUND;
  const parsed = helpSchema.safeParse({ contact: text(formData, "contact") });
  if (!parsed.success) return { ok: false, errors: { contact: parsed.error.issues[0]?.message ?? "Add a phone number or email." } };
  try {
    const result = await saveContact(token, parsed.data.contact);
    if (!result.ok) return { ok: false, message: result.message };
  } catch {
    return FAILED;
  }
  refresh();
  return { ok: true };
}

export async function pauseAction(token: string, _prev: CaseActionState, formData: FormData): Promise<CaseActionState> {
  if (!isCaseToken(token)) return NOT_FOUND;
  const reason = pauseReasonSchema.safeParse(text(formData, "reason"));
  if (!reason.success) return { ok: false, errors: { reason: "Choose a reason." } };
  try {
    const result = await pauseCase(token, reason.data);
    if (!result.ok) return { ok: false, message: result.message };
  } catch {
    return FAILED;
  }
  refresh();
  return { ok: true };
}

export async function resumeAction(token: string): Promise<CaseActionState> {
  if (!isCaseToken(token)) return NOT_FOUND;
  try {
    const result = await resumeCase(token);
    if (!result.ok) return { ok: false, message: result.message };
  } catch {
    return FAILED;
  }
  refresh();
  return { ok: true };
}

/** Fire-and-forget funnel events from the browser (whitelisted names only). */
export async function trackAction(token: string, name: string, props: Record<string, string | number | boolean> = {}): Promise<void> {
  if (!isCaseToken(token)) return;
  try {
    await recordClientEvent(token, name, props);
  } catch {
    // analytics must never break the page
  }
}
