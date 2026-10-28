import "server-only";

import { cookies, headers } from "next/headers";
import { POSTHOG_COOKIE, visitorFromCookie } from "./privacy";

/**
 * Sends `case_created`, the funnel's last step, once a case is saved: only the send mode and how
 * many problems were picked. It joins the visitor's funnel through the anonymous id in PostHog's
 * cookie, so without that cookie (no key, or PostHog blocked in their browser) nothing is sent.
 */
export async function trackCaseCreated(details: { sendMode: "abate" | "self"; problems: number }): Promise<void> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!key || !host) return;
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const visitor = visitorFromCookie(cookieStore.get(POSTHOG_COOKIE)?.value);
  if (!visitor) return;
  try {
    await fetch(`${host.replace(/\/+$/, "")}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        event: "case_created",
        distinct_id: visitor.distinctId,
        properties: {
          send_mode: details.sendMode,
          problems: details.problems,
          // PostHog's test-traffic filter matches on $host, so local runs (localhost) stay out of the funnel.
          $host: headerStore.get("host") ?? undefined,
          $session_id: visitor.sessionId,
          $process_person_profile: false,
        },
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // A lost analytics event never matters more than the case.
  }
}
