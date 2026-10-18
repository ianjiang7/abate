import { expect, test, type Page } from "@playwright/test";

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

test("a tenant starts a case, sends a notice, logs a reply and closes it out", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Repair still not fixed/ })).toBeVisible();
  await shot(page, "01-landing");
  await page.getByRole("link", { name: "Start your case" }).first().click();

  // Step 1: address
  await expect(page.getByRole("heading", { name: "Where do you live?" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Enter your street address.").filter({ visible: true })).toBeVisible();
  const address = page.getByRole("combobox", { name: "Street address" });
  await address.fill("245 East 7th Street");
  const firstOption = page.getByRole("option").first();
  // Pick the NYC geocoder's match when it answers; a free-text address also works.
  const matched = await firstOption
    .waitFor({ state: "visible", timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  if (matched) {
    await firstOption.click();
    await expect(page.getByText("Found your building in NYC records").filter({ visible: true })).toBeVisible();
  }
  await page.getByLabel("Apartment").fill("4B");
  await shot(page, "02-address");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2: the problem
  await expect(page.getByRole("heading", { name: "What needs fixing?" })).toBeVisible();
  // Choices are native radios inside tappable cards; tap the card like a person would.
  await page.locator("label").filter({ hasText: "No heat or hot water" }).filter({ visible: true }).click();
  await expect(page.getByRole("radio", { name: /No heat or hot water/ })).toBeChecked();
  await page.getByLabel(/Describe it in a sentence/).fill("Radiators are cold and there is no hot water.");
  await page.getByLabel("When did it start?").fill(isoDaysAgo(14));
  await page.getByLabel("Choose photos").setInputFiles({ name: "radiator.jpg", mimeType: "image/jpeg", buffer: await fakePhoto(page) });
  await expect(page.getByRole("img", { name: "Photo of the problem" })).toBeVisible();
  await shot(page, "03-problem");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 3: who they told
  await expect(page.getByRole("heading", { name: "Who have you told?" })).toBeVisible();
  await page.getByLabel("When did you first tell management?").fill(isoDaysAgo(12));
  await page.locator("label").filter({ hasText: "Text message" }).filter({ visible: true }).click();
  await expect(page.getByRole("radio", { name: "Text message" })).toBeChecked();
  await page.getByRole("button", { name: "One more" }).click();
  await page.getByRole("button", { name: "One more" }).click();
  await page.getByLabel(/Management company or landlord/).fill("Example Property Management");
  await page.getByLabel(/Their email/).fill("repairs@example.com");
  await shot(page, "04-told");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 4: details
  await expect(page.getByRole("heading", { name: "Last few details" })).toBeVisible();
  await page.getByLabel("Your name").fill("Test Tenant");
  await page.getByLabel("Monthly rent").fill("1,850");
  await page.getByRole("checkbox").check();
  await shot(page, "05-details");
  await page.getByRole("button", { name: "Create my case" }).click();

  // The case page
  await page.waitForURL(/\/case\/[A-Za-z0-9_-]{32}\?new=1/);
  await expect(page.getByText("Save your private link").filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Send your written notice" })).toBeVisible();
  await expect(page.getByText(/may be owed so far/i).filter({ visible: true })).toBeVisible();
  await shot(page, "06-case-new");

  // Send the notice (copy path; mail apps don't exist in the test browser)
  await page.getByRole("button", { name: "Copy the message instead" }).click();
  await page.getByRole("button", { name: "Yes, I sent it" }).click();
  await expect(page.getByRole("heading", { name: /Next up: reminder on/ })).toBeVisible();
  await expect(page.getByText("Written notice sent").filter({ visible: true })).toBeVisible();
  await shot(page, "07-after-notice");

  // Management replies without a date
  await page.getByRole("button", { name: "Management replied" }).first().click();
  await page.getByLabel("Their reply").fill("Hi, thanks for letting us know. We will look into it and get back to you.");
  await page.getByRole("button", { name: "Read their reply" }).click();
  await expect(page.getByText("Abate read their latest reply as").filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ask them for a repair date" })).toBeVisible();
  await shot(page, "08-after-reply");

  // The tenant corrects it: they actually gave a date
  await page.getByRole("button", { name: /Not right\?/ }).click();
  await page.getByRole("radio", { name: "They gave a repair date" }).check();
  await page.getByLabel("Repair date", { exact: true }).fill(isoDaysAgo(-2));
  await page.getByRole("button", { name: "Update my next step" }).click();
  await expect(page.getByRole("heading", { name: "Confirm the repair date" })).toBeVisible();
  await page.getByRole("button", { name: "Copy the message instead" }).click();
  await page.getByRole("button", { name: "Yes, I sent it" }).click();
  await expect(page.getByRole("heading", { name: /They.re coming/ })).toBeVisible();
  await shot(page, "09-scheduled");

  // Fixed early
  await page.getByRole("button", { name: "It's fixed already" }).click();
  await expect(page.getByRole("heading", { name: "Fixed. Nice work." })).toBeVisible();
  await expect(page.getByText("Want us to recover this for you?").filter({ visible: true })).toBeVisible();
  await shot(page, "10-fixed");
});
