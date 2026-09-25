import { defineConfig } from "@playwright/test";

// End-to-end tests run against `npm run dev` and the Supabase project in .env.local.
// Owner credentials for the admin steps come from E2E_OWNER_EMAIL / E2E_OWNER_PASSWORD.
//   npm run test:e2e              headless
//   npm run test:e2e -- --headed  watch it click through the app
//   npm run test:e2e -- --ui      interactive runner with time-travel
// E2E_BASE_URL runs the suite against a deployed copy (e.g. the GitHub Pages web version).
const remote = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "reports/desktop.json" }], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: remote ?? "http://localhost:3000",
    channel: "msedge",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { slowMo: Number(process.env.E2E_SLOWMO ?? 0) },
  },
  webServer: remote ? undefined : {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
