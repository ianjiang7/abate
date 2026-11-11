import type { PostHog } from "posthog-js";
import { adTagsFrom, isTrackedPath, mayCapture, POSTHOG_PERSISTENCE_NAME, scrubEvent, scrubUrl } from "./privacy";

// PostHog in the browser: funnel events and session replay on the landing, start and privacy pages
// only. Without NEXT_PUBLIC_POSTHOG_KEY and NEXT_PUBLIC_POSTHOG_HOST (local dev, e2e) nothing loads.
const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST;

type Properties = Record<string, string | number | boolean>;

let posthog: PostHog | undefined;
let loading = false;
let shownPath = "";
/** A page other than the tracked ones was shown in this tab, so replay stays off until a reload. */
let sawOtherPage = false;
/** Events from before PostHog finished loading. */
const waiting: [string, Properties][] = [];
/** The ad tags (utm_source and the like) from the link that brought this tab, kept for the session. */
const AD_TAGS_KEY = "abate_ad_tags";
let adTags: Record<string, string> = {};

/** Called by <Analytics /> whenever the page on screen changes, before the browser paints it. */
export function showPage(pathname: string): void {
  if (!KEY || !HOST || pathname === shownPath) return; // React runs effects twice in development
  shownPath = pathname;
  if (!isTrackedPath(pathname)) {
    // Stop the recorder before it sees a case or team page.
    sawOtherPage = true;
    posthog?.stopSessionRecording();
    return;
  }
  rememberAdTags();
  track("$pageview");
  load();
}

/**
 * PostHog reads ad tags from the URL only once it has loaded, so a tenant who taps Start on the
 * landing page before then would lose them (the Start links have no query string). We keep them
 * ourselves, in this tab only, and add them to every event track() sends (not as PostHog session
 * properties, which PostHog clears when it starts a new session). A link with any campaign
 * parameter (utm_* or an ad click id) is a new visit and replaces the tags, even with none we keep;
 * a page reached from the landing page by a full page load reads them from the referrer; anything
 * else keeps the tab's earlier tags.
 */
function rememberAdTags(): void {
  let found = campaignTagsIn(window.location.search);
  if (!found && document.referrer) {
    try {
      const from = new URL(document.referrer);
      if (from.origin === window.location.origin && isTrackedPath(from.pathname)) found = campaignTagsIn(from.search);
    } catch {
      // not a URL: no tags
    }
  }
  try {
    if (found) window.sessionStorage.setItem(AD_TAGS_KEY, JSON.stringify(found));
    else found = adTagsFrom(new URLSearchParams(JSON.parse(window.sessionStorage.getItem(AD_TAGS_KEY) ?? "{}")).toString());
  } catch {
    // storage blocked: keep what this page load found
  }
  if (found) adTags = found;
}

/** Ad click ids (Google, Meta, Microsoft): a link with one is a new ad visit even without utm tags. */
const CLICK_IDS = ["gclid", "gbraid", "wbraid", "gad_source", "fbclid", "msclkid"];

/** The ad tags in a query string, or null when it has no campaign parameter at all (not a new visit). */
function campaignTagsIn(search: string): Record<string, string> | null {
  const keys = [...new URLSearchParams(search).keys()];
  return keys.some((k) => k.startsWith("utm_") || CLICK_IDS.includes(k)) ? adTagsFrom(search) : null;
}

/** Sends a funnel event, with this tab's ad tags. Properties never hold anything a tenant typed. */
export function track(event: string, properties: Properties = {}): void {
  if (!KEY || !HOST || !isTrackedPath(window.location.pathname)) return;
  const withTags = { ...adTags, ...properties };
  if (posthog) posthog.capture(event, withTags);
  else if (waiting.length < 20) waiting.push([event, withTags]);
}

/** Sends start_clicked for taps on any link to /start, with where the link sits on the page. */
export function trackStartClicks(): (() => void) | undefined {
  if (!KEY || !HOST) return;
  const onClick = (e: MouseEvent) => {
    const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
    if (!(link instanceof HTMLAnchorElement) || link.origin !== window.location.origin || link.pathname !== "/start") return;
    // Hidden pages stay in the document, so count only links on screen. No link text is sent.
    const visible = [...document.querySelectorAll<HTMLAnchorElement>('a[href="/start"]')].filter((a) => a.getClientRects().length > 0);
    track("start_clicked", { placement: link.closest("header") ? "header" : "page", position: visible.indexOf(link) + 1 });
  };
  document.addEventListener("click", onClick, true);
  return () => document.removeEventListener("click", onClick, true);
}

function load() {
  if (loading) return;
  loading = true;
  import("posthog-js")
    .then(({ default: ph }) => {
      ph.init(KEY!, {
        api_host: HOST,
        persistence_name: POSTHOG_PERSISTENCE_NAME, // the server reads this cookie for case_created
        cross_subdomain_cookie: false,
        person_profiles: "identified_only",
        // Only the events we send ourselves. Autocapture, rage clicks and dead clicks would copy page text.
        capture_pageview: false,
        capture_pageleave: false,
        autocapture: false,
        rageclick: false,
        capture_dead_clicks: false,
        capture_heatmaps: false,
        capture_exceptions: false,
        // Network timing would record /api/address?q=<the address being typed>.
        capture_performance: false,
        enable_recording_console_log: false,
        disable_capture_url_hashes: true,
        mask_personal_data_properties: true,
        // Keep /flags for the replay settings, but evaluate no flags and show nothing on the page.
        advanced_disable_feature_flags: true,
        disable_surveys: true,
        disable_product_tours: true,
        disable_conversations: true,
        disable_web_experiments: true,
        disable_session_recording: sawOtherPage,
        session_recording: {
          maskAllInputs: true,
          // Text that repeats answers: the address suggestions, and the sentence next to a checkbox
          // (the authorization line names management). Elements with class "ph-mask" are masked too.
          maskTextSelector: '[role="listbox"], input[type="checkbox"] + span',
          // Photo previews are the tenant's own pictures.
          blockSelector: 'img[src^="blob:"]',
          // Page URLs inside recordings lose their query string, like event URLs.
          maskCapturedNetworkRequestFn: (request) => ({ ...request, name: scrubUrl(request.name, window.location.origin) }),
        },
        before_send: (event) =>
          event && mayCapture(event.event, window.location.pathname, sawOtherPage) ? scrubEvent(event, window.location.origin) : null,
      });
      posthog = ph;
      for (const [event, properties] of waiting.splice(0)) ph.capture(event, properties);
    })
    .catch(() => {
      loading = false; // try again on the next page
    });
}
