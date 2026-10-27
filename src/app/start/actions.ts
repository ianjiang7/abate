"use server";

import { redirect } from "next/navigation";
import { countCasesSince } from "@/lib/cases/repo";
import { createCase } from "@/lib/cases/service";
import { newCaseSchema } from "@/lib/cases/validation";
import { hasDatabase } from "@/lib/db/client";

export type StartState = { errors?: Record<string, string>; message?: string };

const MAX_PHOTOS = 4;
const MAX_CASES_PER_HOUR = 40;
const MAX_PHOTO_BYTES = 3_000_000;

export async function createCaseAction(_prev: StartState, formData: FormData): Promise<StartState> {
  if (!hasDatabase()) {
    return { message: "Abate isn't connected to its database yet. Please try again soon." };
  }

  const fields: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION_") || key === "photos" || key === "issueTypes") continue;
    fields[key] = value;
  }
  // Tenants can pick several problems; each arrives as its own "issueTypes" entry.
  fields.issueTypes = formData.getAll("issueTypes");

  const parsed = newCaseSchema.safeParse(fields);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      errors[key] ??= issue.message;
    }
    return { errors, message: "A few answers need another look." };
  }

  // Photos are optional, but if the tenant added some and none can be used, say so instead of
  // quietly starting the case without them.
  const sent = formData.getAll("photos").filter((p): p is File => p instanceof File && p.size > 0);
  const photos = sent.filter((p) => p.size <= MAX_PHOTO_BYTES && p.type.startsWith("image/")).slice(0, MAX_PHOTOS);
  if (sent.length > 0 && photos.length === 0) {
    return { errors: { photos: "We couldn't use that photo. Remove it and try a different one, or continue without it." }, message: "A few answers need another look." };
  }

  const isTest = process.env.E2E_TEST === "1";
  let token: string;
  try {
    // Abuse guard for a public pilot link: new cases per hour, across everyone.
    if (!isTest && (await countCasesSince(new Date(Date.now() - 3_600_000).toISOString())) >= MAX_CASES_PER_HOUR) {
      return { message: "Abate is getting a lot of new cases right now. Please try again in an hour." };
    }
    const created = await createCase(parsed.data, photos, { isTest });
    token = created.token;
  } catch {
    return { message: "Something went wrong saving your case. Please try again." };
  }

  redirect(`/case/${token}?new=1`);
}
