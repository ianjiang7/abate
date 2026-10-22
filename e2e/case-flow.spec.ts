import { expect, test, type Page } from "@playwright/test";
import { TEAM_KEY } from "../playwright.config";

// Next keeps visited pages mounted but hidden (React Activity), so text lookups filter to visible
// elements. Role lookups already skip hidden ones.

/** Draws a small "photo" in the browser and returns it as JPEG bytes, like a phone camera would. */
async function fakePhoto(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 600;
    const ctx = c.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 800, 600);
    g.addColorStop(0, "#c9cee8");
    g.addColorStop(1, "#08014e");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 800, 600);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 64px sans-serif";
    ctx.fillText("Cold radiator", 160, 320);
    return c.toDataURL("image/jpeg", 0.9);
  });
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString("en-CA");
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });
}

const visibleText = (page: Page, text: string | RegExp) => page.getByText(text).filter({ visible: true });

/** Fills the start form through the "who sends" step. Returns on the case page. */
async function startCase(page: Page, sendMode: "abate" | "self", prefix: string, { photo }: { photo: boolean }) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Repair still not fixed/ })).toBeVisible();
  await shot(page, `${prefix}-01-landing`);
  await page.getByRole("link", { name: "Start your case" }).first().click();

  // Step 1: address
  await expect(page.getByRole("heading", { name: "Where do you live?" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(visibleText(page, "Enter your street address.")).toBeVisible();
  await page.getByRole("combobox", { name: "Street address" }).fill("245 East 7th Street");
  const firstOption = page.getByRole("option").first();
  // Pick the NYC geocoder's match when it answers; a free-text address also works.
  const matched = await firstOption
    .waitFor({ state: "visible", timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  if (matched) {
    await firstOption.click();
    await expect(visibleText(page, "Found your building in NYC records")).toBeVisible();
  }
  await page.getByLabel("Apartment").fill("4B");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2: the problem. Choices are native radios inside tappable cards; tap the card.
  await expect(page.getByRole("heading", { name: "What needs fixing?" })).toBeVisible();
  await page.locator("label").filter({ hasText: "No heat or hot water" }).filter({ visible: true }).click();
  await expect(page.getByRole("radio", { name: /No heat or hot water/ })).toBeChecked();
  await page.getByLabel(/Describe it in a sentence/).fill("Radiators are cold and there is no hot water.");
  await page.getByLabel("When did it start?").fill(isoDaysAgo(14));
  // Photos are optional (nothing to photograph for no heat); one test adds one, the other skips it.
  if (photo) {
    await page.getByLabel("Choose photos").setInputFiles({ name: "radiator.jpg", mimeType: "image/jpeg", buffer: await fakePhoto(page) });
    await expect(page.getByRole("img", { name: "Photo of the problem" })).toBeVisible();
  }
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 3: who they told
  await expect(page.getByRole("heading", { name: "Who have you told?" })).toBeVisible();
  await page.getByLabel("When did you first tell management?").fill(isoDaysAgo(12));
  await page.locator("label").filter({ hasText: "Text message" }).filter({ visible: true }).click();
  await page.getByRole("button", { name: "One more" }).click();
  await page.getByLabel(/Management company or landlord/).fill("Example Property Management");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 4: who sends
  await expect(page.getByRole("heading", { name: "Who should send the follow-ups?" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(visibleText(page, "Choose who sends the follow-ups.")).toBeVisible();
  if (sendMode === "abate") {
    await page.locator("label").filter({ hasText: "Abate's team sends them for me" }).filter({ visible: true }).click();
    // Management's email is asked for once, here, and is required when Abate sends.
    await page.getByLabel("Your email").fill("tenant@example.com");
    await page.getByRole("checkbox").filter({ visible: true }).check();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(visibleText(page, /^Add management's email so we can send your follow-ups/)).toBeVisible();
    await shot(page, `${prefix}-04-mgmt-email-required`);
    await page.getByLabel("Management's email").fill("repairs@example.com");
  } else {
    // A tenant who tries Abate without management's email, then switches to sending themselves,
    // doesn't keep the "required" error on a field that is now optional.
    await page.locator("label").filter({ hasText: "Abate's team sends them for me" }).filter({ visible: true }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(visibleText(page, /^Add management's email so we can send your follow-ups/)).toBeVisible();
    await page.locator("label").filter({ hasText: "I'll send them myself" }).filter({ visible: true }).click();
    await expect(visibleText(page, /^Add management's email so we can send your follow-ups/)).toHaveCount(0);
    await expect(visibleText(page, "We'll put it in the To line of each message for you.")).toBeVisible();
    // Optional here, but still checked: a half-typed address is caught now, not on the server later.
    await page.getByLabel("Management's email").fill("repairs@exam");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(visibleText(page, "That email doesn't look right.")).toBeVisible();
    await page.getByLabel("Management's email").fill("repairs@example.com");
  }
  await shot(page, `${prefix}-04-who-sends`);
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 5: details
  await expect(page.getByRole("heading", { name: "Last few details" })).toBeVisible();
  await page.getByLabel("Your name").fill("Test Tenant");
  await page.getByLabel("Monthly rent").fill("1,850");
  // We already have an Abate tenant's email, so reminders only ask for a phone.
  await expect(page.getByLabel(sendMode === "abate" ? "Phone for text reminders" : "Phone or email for reminders")).toBeVisible();
  await page.getByRole("checkbox").filter({ visible: true }).check();
  await page.getByRole("button", { name: "Create my case" }).click();

  await page.waitForURL(/\/case\/[A-Za-z0-9_-]{32}\?new=1/);
  const caseUrl = page.url().replace(/\?new=1$/, "");
  const code = ((await visibleText(page, /^Case [A-Z0-9]{6}$/).textContent()) ?? "").replace("Case ", "");
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  return { caseUrl, code };
}

// Only automated test cases, so screenshots never capture real testers' details.
const teamUrl = `/team/${TEAM_KEY}?test=only`;

/** On the team page, act inside the list item for this case. */
const teamItem = (page: Page, code: string) => page.locator("li").filter({ hasText: code }).filter({ visible: true }).first();

test("concierge: the tenant approves, our team sends and reads replies, then the case closes", async ({ page }) => {
  const { caseUrl, code } = await startCase(page, "abate", "c", { photo: true });
  await expect(page.getByRole("heading", { name: "Approve your written notice" })).toBeVisible();
  await expect(visibleText(page, "From:")).toBeVisible();
  await expect(visibleText(page, /may be owed so far/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Photos", exact: true })).toBeVisible();
  await shot(page, "c-05-case-new");

  // The tenant approves; the case waits for the team.
  await page.getByRole("button", { name: "Approve and send" }).click();
  await expect(page.getByRole("heading", { name: "Our team is sending your written notice" })).toBeVisible();
  await expect(visibleText(page, "Written notice approved")).toBeVisible();
  await shot(page, "c-06-approved");

  // The team sends it from the team inbox and marks it sent.
  await page.goto(teamUrl);
  await expect(page.getByRole("heading", { name: /Live results/ })).toBeVisible();
  // Copy claims the message (re-checking the case) before it can be sent.
  await teamItem(page, code).getByRole("button", { name: "Copy" }).click();
  await expect(teamItem(page, code).getByRole("button", { name: "Copied" })).toBeVisible();
  await teamItem(page, code).getByRole("button", { name: "Mark sent" }).click();
  await expect(teamItem(page, code).getByRole("button", { name: "Mark sent" })).toHaveCount(0);
  await shot(page, "c-07-team-sent");

  // Back on the case: the reminder is scheduled, and the record shows who sent it.
  await page.goto(caseUrl);
  await expect(page.getByRole("heading", { name: /Next up: reminder on/ })).toBeVisible();
  await expect(visibleText(page, "Written notice sent by Abate")).toBeVisible();

  // Management writes to the tenant directly; the tenant passes it to the team.
  await page.getByRole("button", { name: "Management replied" }).first().click();
  await page.getByLabel("Their reply").fill("Hi, thanks for letting us know. We will look into it and get back to you.");
  await page.getByRole("button", { name: "Send it to our team" }).click();
  await expect(page.getByRole("heading", { name: "Our team is reading their reply" })).toBeVisible();
  await shot(page, "c-08-team-reading");

  // The team reads it.
  await page.goto(teamUrl);
  const reply = teamItem(page, code);
  await reply.locator("label").filter({ hasText: "They answered but gave no repair date" }).click();
  await reply.getByRole("button", { name: "Set the next step" }).click();
  await expect(page.getByRole("button", { name: "Set the next step" })).toHaveCount(0);

  // The tenant sees the reading and the next draft.
  await page.goto(caseUrl);
  await expect(visibleText(page, "Our team read their latest reply as")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Approve: ask them for a repair date" })).toBeVisible();
  await shot(page, "c-09-next-draft");

  // Pausing and resuming.
  await page.getByRole("button", { name: "Pause Abate" }).click();
  await page.locator("label").filter({ hasText: "I'm worried about how my landlord will react" }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Abate is paused" })).toBeVisible();
  await page.getByRole("button", { name: "Resume Abate" }).click();
  await expect(page.getByRole("heading", { name: "Approve: ask them for a repair date" })).toBeVisible();

  // Fixed.
  await page.getByRole("button", { name: "Already fixed? Mark it done" }).click();
  await page.getByRole("button", { name: "It's fixed" }).click();
  await expect(page.getByRole("heading", { name: "Fixed. Nice work." })).toBeVisible();
  await shot(page, "c-10-fixed");

  // The team page's numbers include this case.
  await page.goto(teamUrl);
  await expect(visibleText(page, "Chose Abate to send for them")).toBeVisible();
  await shot(page, "c-11-team-results");
});

test("self-send: the tenant sends from their own email", async ({ page }) => {
  const { caseUrl } = await startCase(page, "self", "s", { photo: false });
  await expect(page.getByRole("heading", { name: "Send your written notice" })).toBeVisible();
  // No photo was added, so the case page leaves out the Photos card.
  await expect(page.getByRole("heading", { name: "Photos", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Copy the message instead" }).click();
  await page.getByRole("button", { name: "Yes, I sent it" }).click();
  await expect(page.getByRole("heading", { name: /Next up: reminder on/ })).toBeVisible();
  await expect(visibleText(page, "Written notice sent")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause Abate" })).toHaveCount(0);
  await shot(page, "s-05-after-send");

  await page.goto(caseUrl);
  await page.getByRole("button", { name: "Already fixed? Mark it done" }).click();
  await page.getByRole("button", { name: "It's fixed" }).click();
  await expect(page.getByRole("heading", { name: "Fixed. Nice work." })).toBeVisible();
});
