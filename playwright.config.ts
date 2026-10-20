import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

/** The team page key used by the end-to-end test (the real one lives in .env.local and Vercel). */
export const TEAM_KEY = "e2e-team-key-0123456789abcdefXYZ";

// One end-to-end run of the tenant flow on a phone-sized screen, against a production build.
// Needs Supabase credentials in .env.local. Cases it creates are marked is_test (npm run e2e:cleanup).
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["iPhone 13"],
    browserName: "chromium",
    viewport: { width: 375, height: 812 },
    permissions: ["clipboard-read", "clipboard-write"],
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env: { E2E_TEST: "1", ABATE_AGENT: "standin", TEAM_KEY },
  },
});
