// Public container ID, supplied by the site owner. It is not a credential.
export const GOOGLE_TAG_ID = "GTM-NG24H978";
export const GOOGLE_ADS_PATHS = ["/", "/start", "/privacy"];

export function googlePage(pathname: string, origin: string) {
  if (!GOOGLE_ADS_PATHS.includes(pathname)) return null;
  return { page_location: origin + pathname, page_referrer: "", page_title: pathname === "/start" ? "Start your case · Abate" : pathname === "/privacy" ? "Privacy · Abate" : "Abate" };
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** No form values, case token, plan selection, purchase value or user identifiers. */
export async function trackGoogleSignup(): Promise<void> {
  if (window.location.pathname !== "/start" || !window.gtag) return;
  const destination = process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_SEND_TO;
  // Let the configured conversion finish, but never hold up the tenant for more than 1.2s.
  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, 1200);
    const done = () => { window.clearTimeout(timeout); resolve(); };
    if (destination && /^AW-\d+\/[A-Za-z0-9_-]+$/.test(destination)) {
      window.gtag!("event", "conversion", {
        send_to: destination, event_callback: done, event_timeout: 1000,
      });
    } else {
      // GTM custom-event alternative; never emit both conversion methods.
      window.dataLayer?.push({ event: "abate_signup_completed", eventCallback: done, eventTimeout: 1000 });
    }
  });
}
