import { expect, test, type Page } from "@playwright/test";
import { TEAM_KEY } from "../playwright.config";
import { PRICE_ARMS, PRICE_COPY } from "../src/lib/domain/pricing";

const arm = PRICE_ARMS.find((a) => a.weight > 0)!;
const text = (page: Page, value: string | RegExp) => page.getByText(value).filter({ visible: true });
function ago(days: number) { const d = new Date(); d.setDate(d.getDate() - days); return d.toLocaleDateString("en-CA"); }
const forbidden: string[] = [];
test.beforeEach(({ page }) => {
  forbidden.length = 0;
  page.on("request", (r) => { if (/doubleclick|facebook\.net|stripe|google-analytics/.test(r.url())) forbidden.push(r.url()); });
});
test.afterEach(() => expect(forbidden).toEqual([]));

async function start(page: Page, choice: "free" | "buy", told = true) {
  await page.addInitScript((id) => localStorage.setItem("abate_price_arm", id), arm.id);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Better days/ })).toBeVisible();
  await expect(page.getByText("$1,000", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pause photo carousel" }).click();
  await expect(page.getByRole("button", { name: "Play photo carousel" })).toBeVisible();
  await page.screenshot({ path: "test-results/screens/landing-phone.png", fullPage: true });
  await page.screenshot({ path: "test-results/screens/landing-phone-hero.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("link", { name: "Start my case" }).first().click();
  await page.locator("label").filter({ hasText: "No heat or hot water" }).filter({ visible: true }).click();
  await page.getByLabel("When did it start?").fill(ago(14));
  await page.getByRole("button", { name: "Continue" }).click();
  if (told) {
    await page.getByRole("checkbox", { name: /already reached out/ }).check();
    await page.getByLabel("When did you first tell management?").fill(ago(12));
  }
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Monthly rent").fill("1850");
  await expect(text(page, "Estimated amount you may be owed")).toBeVisible();
  await expect(text(page, /Grows .*a day/)).toHaveCount(0);
  if (!told) await expect(text(page, "Start with your first letter")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: PRICE_COPY.title })).toBeVisible();
  if (choice === "buy") {
    await page.getByRole("button", { name: arm.button, exact: true }).click();
    await expect(text(page, PRICE_COPY.bought)).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
  } else await page.getByRole("button", { name: PRICE_COPY.free }).click();
  await expect(page.getByRole("heading", { name: "Where do you live?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Who should send the follow-ups?" })).toHaveCount(0);
  await page.getByLabel("Your name").fill("Test Tenant");
  await page.getByRole("combobox", { name: "Street address" }).fill("123 Example Street, New York");
  await page.locator("#unit").fill("4B");
  await page.getByLabel("Management's email").fill("repairs@example.com");
  await page.getByRole("checkbox", { name: /I agree/ }).check();
  await page.getByRole("button", { name: "Create my case" }).click();
  await page.waitForURL(/\/case\/[A-Za-z0-9_-]{32}\?new=1/);
  const url = page.url().replace(/\?new=1$/, "");
  const code = (await text(page, /^Case [A-Z0-9]{6}$/).textContent())!.replace("Case ", "");
  return { url, code };
}

async function sendNotice(page: Page) {
  await expect(page.getByRole("heading", { name: "Send your written notice" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve and send" })).toHaveCount(0);
  await page.getByRole("button", { name: "Copy the message instead" }).click();
  await page.getByRole("button", { name: "Yes, I sent it" }).click();
}

test("free has only first letter and estimate; upgrade persists and unlocks replies", async ({ page }) => {
  const { url } = await start(page, "free");
  await expect(page.getByRole("heading", { name: "Your free plan" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Management’s replies" })).toHaveCount(0);
  await sendNotice(page);
  await expect(text(page, /Your free first letter is saved/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /Next up: reminder/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your free plan" })).toBeVisible();
  await page.getByRole("button", { name: "Buy the full plan" }).click();
  await expect(text(page, /Nothing was charged. Your full plan is now unlocked/)).toBeVisible();
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Management’s replies" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Next up: reminder/ })).toBeVisible();
  await page.screenshot({ path: "test-results/screens/upgraded-case-phone.png", fullPage: true });
});

test("full plan saves dated replies, team review sets next draft, tenant marks fixed", async ({ page }) => {
  const { url, code } = await start(page, "buy", false);
  await sendNotice(page);
  await page.getByRole("button", { name: "Add management’s reply" }).click();
  await page.getByLabel("Their reply").filter({ visible: true }).fill("Thanks for letting us know. We will look into it and get back to you.");
  await page.getByLabel("When did you get it?").filter({ visible: true }).fill(ago(0));
  await page.getByRole("button", { name: "Send it to our team" }).click();
  await expect(page.getByRole("heading", { name: "Our team is reading their reply" })).toBeVisible();
  await page.getByText(/Reply received /).click();
  await expect(text(page, "Thanks for letting us know. We will look into it and get back to you.").last()).toBeVisible();
  await page.goto(`/team/${TEAM_KEY}?test=only`);
  const item = page.locator("li").filter({ hasText: code }).filter({ visible: true }).first();
  await item.locator("label").filter({ hasText: "They answered but gave no repair date" }).click();
  await item.getByRole("button", { name: "Set the next step" }).click();
  await expect(item.getByRole("button", { name: "Set the next step" })).toHaveCount(0);
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Ask them for a repair date" })).toBeVisible();
  await expect(text(page, "Our team read their latest reply as")).toBeVisible();
  await page.getByRole("button", { name: "Already fixed? Mark it done" }).click();
  await page.getByRole("button", { name: "It's fixed" }).click();
  await expect(page.getByRole("heading", { name: "Fixed. Nice work." })).toBeVisible();
});
