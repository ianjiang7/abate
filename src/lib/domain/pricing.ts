// The price test on the start form. It's a fake door: nothing is ever charged, and there is no
// checkout. Each "arm" is one price we show; the form picks one per browser by weight.
//
// Never edit or reuse an arm once it has been shown: the arm id is the only record of what a
// tenant saw. To stop showing one, set its weight to 0 (it stays here so old cases still read).
// No imports, so the end-to-end test can read this file too.

export type PriceArm = {
  /** Stored on the case and sent to PostHog as price_arm. */
  id: string;
  /** How often it's shown, relative to the others. 0 = retired. */
  weight: number;
  /** Short name for the team page. */
  label: string;
  /** The price line on the card. */
  line: string;
  /** The Buy button. 28 characters or fewer so it fits on one line at 375px. */
  button: string;
};

export const PRICE_ARMS: readonly PriceArm[] = [
  { id: "p29", weight: 2, label: "$29", line: "$29 one time, for this repair", button: "Get the full plan – $29" },
  { id: "p9", weight: 1, label: "$9", line: "$9 one time, for this repair", button: "Get the full plan – $9" },
  { id: "p49", weight: 0, label: "$49", line: "$49 one time, for this repair", button: "Get the full plan – $49" },
  { id: "p19", weight: 0, label: "$19", line: "$19 one time, for this repair", button: "Get the full plan – $19" },
  { id: "p29_fixed", weight: 0, label: "$29 once fixed", line: "$29, only once your repair is fixed", button: "Full plan – $29 once fixed" },
];

export const PRICE_COPY = {
  title: "Get the whole follow-up plan",
  subtitle: "The reminder, formal notice and 311 guide that follow your first letter, written and timed for you.",
  body: "You send each letter from your own email in one tap. We write and time them.",
  heat311: "No heat or hot water? You can file a free 311 complaint now, any time.",
  free: "Just the free first letter",
  bought: "Paid plans aren't open yet. Nothing was charged, and you get the full plan free during the pilot.",
  /** On the price step after Back, once the free letter was picked. */
  freePicked: "You picked the free first letter.",
  /** Shown once they pick the free letter (it can't be undone either), so they know what they'll get. */
  freeChosen: "During the pilot you get the full follow-up plan free either way.",
  okToAskLead: "Tell me when paid plans open.",
  okToAskRest: "It's OK to ask me 3 quick questions.",
} as const;

/** Whether this is one of our arm ids, retired or not. */
export function isPriceArmId(v: unknown): v is string {
  return PRICE_ARMS.some((a) => a.id === v);
}

export function priceArmById(id?: string | null): PriceArm | null {
  return PRICE_ARMS.find((a) => a.id === id) ?? null;
}

/**
 * The price to show. Keeps the one this browser saw before if it's still running (weight above 0),
 * so a reload doesn't change the price. Otherwise picks by weight: roll is a random number in
 * [0, 1), passed in so tests can pick it.
 */
export function chooseArm(storedId: string | null, roll: number, arms: readonly PriceArm[] = PRICE_ARMS): PriceArm {
  const active = arms.filter((a) => a.weight > 0);
  const stored = active.find((a) => a.id === storedId);
  if (stored) return stored;
  const total = active.reduce((sum, a) => sum + a.weight, 0);
  let cumulative = 0;
  for (const arm of active) {
    cumulative += arm.weight;
    if (roll * total < cumulative) return arm;
  }
  // Only reached with a roll of 1 or more, or no active arm (the config tests rule that out).
  return active[active.length - 1] ?? arms[0];
}

/**
 * A price event's own properties: which price was shown, never an answer. (track() adds the tab's
 * ad tags, utm_source and the like, as it does to every event.)
 */
export function priceEventProps(arm: PriceArm): { price_arm: string } {
  return { price_arm: arm.id };
}
