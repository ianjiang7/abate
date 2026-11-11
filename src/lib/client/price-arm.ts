// Which price this browser sees on the start form, kept so a reload shows the same one.

import { chooseArm, type PriceArm } from "@/lib/domain/pricing";

const KEY = "abate_price_arm";
// Used when the browser blocks storage (private mode, some in-app browsers): the price then stays
// the same only until the page is reloaded or closed.
let remembered: string | null = null;

/** Call only from an event handler (the rent step's Continue), never during render. */
export function stickyPriceArm(): PriceArm {
  let stored = remembered;
  try {
    stored = window.localStorage.getItem(KEY) ?? remembered;
  } catch {
    // storage blocked: use the remembered one
  }
  const arm = chooseArm(stored, Math.random());
  remembered = arm.id;
  try {
    window.localStorage.setItem(KEY, arm.id);
  } catch {
    // storage blocked: remembered above
  }
  return arm;
}
