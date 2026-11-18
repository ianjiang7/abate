"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { GOOGLE_TAG_ID, googlePage } from "@/lib/analytics/google-ads";

/** Only mounted in the public root. Moving to the private root destroys this document. */
export function GoogleAds() {
  const pathname = usePathname();
  useEffect(() => {
    const page = googlePage(pathname, window.location.origin);
    if (!page) return;
    window.dataLayer = window.dataLayer || [];
    // Google's documented queue uses Arguments objects, not arrays.
    // eslint-disable-next-line prefer-rest-params
    window.gtag = window.gtag || function () { window.dataLayer!.push(arguments); };
    window.gtag("set", { ...page, allow_ad_personalization_signals: false });
    if (document.getElementById("abate-google-tag")) return;
    window.gtag("js", new Date());
    const script = document.createElement("script");
    script.id = "abate-google-tag";
    script.async = true;
    script.referrerPolicy = "no-referrer";
    script.src = `https://www.googletagmanager.com/gtm.js?id=${GOOGLE_TAG_ID}`;
    document.head.appendChild(script);
  }, [pathname]);
  return null;
}
