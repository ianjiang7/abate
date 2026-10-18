"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const localToday = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in the phone's time zone
const serverToday = () => "";

/** Today's date in the browser, or "" while prerendering on the server (where reading the clock is off-limits). */
export function useToday(): string {
  return useSyncExternalStore(subscribe, localToday, serverToday);
}
