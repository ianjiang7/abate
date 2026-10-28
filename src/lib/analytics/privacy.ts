// What PostHog may see. Pure rules shared by the browser (client.ts) and the server (server.ts),
// with tests in privacy.test.ts.

/** The only pages PostHog runs on. Case and team pages are secret links that show tenant data. */
export const TRACKED_PATHS = ["/", "/start", "/privacy"] as const;

/** PostHog keeps the visitor's anonymous id in this cookie (persistence_name "abate"). */
export const POSTHOG_PERSISTENCE_NAME = "abate";
export const POSTHOG_COOKIE = `ph_${POSTHOG_PERSISTENCE_NAME}`;

export function isTrackedPath(pathname: string): boolean {
  return (TRACKED_PATHS as readonly string[]).includes(pathname);
}

/**
 * A URL as PostHog may store it. The query string and #hash always go (they can carry an invite
 * code). The path stays only for our own tracked pages, so a referrer like /case/<token> or another
 * site's page shrinks to its origin. Anything that isn't a full URL comes back unchanged.
 */
export function scrubUrl(value: string, ownOrigin: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return value;
  }
  return url.origin === ownOrigin && isTrackedPath(url.pathname) ? url.origin + url.pathname : url.origin;
}

type Props = Record<string, unknown>;

function scrubProps(props: Props, ownOrigin: string): Props {
  const out: Props = {};
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) out[key] = scrubUrl(value, ownOrigin);
    // $pathname, $initial_pathname and the like: drop any path that isn't a tracked page.
    else if (typeof value === "string" && key.endsWith("pathname") && !isTrackedPath(value)) continue;
    else out[key] = value;
  }
  return out;
}

/** Scrubs every URL in an event's properties and in the person properties it sets. */
export function scrubEvent<E extends { properties: Props; $set?: Props; $set_once?: Props }>(event: E, ownOrigin: string): E {
  return {
    ...event,
    properties: scrubProps(event.properties, ownOrigin),
    ...(event.$set ? { $set: scrubProps(event.$set, ownOrigin) } : {}),
    ...(event.$set_once ? { $set_once: scrubProps(event.$set_once, ownOrigin) } : {}),
  };
}

/**
 * Whether the browser may send an event. Only while a tracked page is on screen, and no replay data
 * once a case or team page was open in this tab: Next keeps visited pages in the document (hidden),
 * so a recording could copy their text.
 */
export function mayCapture(event: string, pathname: string, sawOtherPage: boolean): boolean {
  if (!isTrackedPath(pathname)) return false;
  return !(sawOtherPage && event === "$snapshot");
}

/** The visitor's anonymous PostHog ids, read from PostHog's cookie so a server event joins their funnel. */
export function visitorFromCookie(value: string | undefined): { distinctId: string; sessionId?: string } | null {
  if (!value) return null;
  for (const text of [value, safeDecode(value)]) {
    try {
      const data = JSON.parse(text) as { distinct_id?: unknown; $sesid?: unknown };
      if (typeof data.distinct_id !== "string" || !data.distinct_id) return null;
      // $sesid is [last activity, session id, session start].
      const sessionId = Array.isArray(data.$sesid) && typeof data.$sesid[1] === "string" ? data.$sesid[1] : undefined;
      return { distinctId: data.distinct_id, sessionId };
    } catch {
      // Try the URL-decoded form next.
    }
  }
  return null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
