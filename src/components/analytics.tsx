"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect } from "react";
import { showPage, trackStartClicks } from "@/lib/analytics/client";

/** PostHog on the landing, start and privacy pages (see src/lib/analytics). Renders nothing. */
export function Analytics() {
  const pathname = usePathname();
  // A layout effect runs before the browser paints the new page, so the recorder stops before a
  // case or team page appears.
  useLayoutEffect(() => showPage(pathname), [pathname]);
  useEffect(() => trackStartClicks(), []);
  return null;
}
