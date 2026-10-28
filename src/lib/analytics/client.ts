import type { PostHog } from "posthog-js";
import { isTrackedPath, mayCapture, POSTHOG_PERSISTENCE_NAME, scrubEvent, scrubUrl } from "./privacy";

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
  track("$pageview");
  load();
}

/** Sends a funnel event. Properties never hold anything a tenant typed. */
export function track(event: string, properties: Properties = {}): void {
  if (!KEY || !HOST || !isTrackedPath(window.location.pathname)) return;
  if (posthog) posthog.capture(event, properties);
  else if (waiting.length < 20) waiting.push([event, properties]);
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
