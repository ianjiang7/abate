"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { countCasesSince } from "@/lib/cases/repo";
import { createCase, warmBuilding } from "@/lib/cases/service";
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

  const fields: Record<string, FormDataEntryValue> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION_") || key === "photos") continue;
    fields[key] = value;
  }

  const parsed = newCaseSchema.safeParse(fields);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      errors[key] ??= issue.message;
    }
    return { errors, message: "A few answers need another look." };
  }

  const photos = formData
    .getAll("photos")
    .filter((p): p is File => p instanceof File && p.size > 0 && p.size <= MAX_PHOTO_BYTES && p.type.startsWith("image/"))
    .slice(0, MAX_PHOTOS);
  if (photos.length === 0) {
    return { errors: { photos: "Add at least one photo of the problem." }, message: "A few answers need another look." };
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
    const { bbl, bin } = parsed.data;
    after(() => warmBuilding(bbl, bin));
  } catch {
    return { message: "Something went wrong saving your case. Please try again." };
  }

  redirect(`/case/${token}?new=1`);
}
