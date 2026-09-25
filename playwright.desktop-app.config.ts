import { defineConfig } from "@playwright/test";

// Runs the E2E specs inside the installed Windows desktop app (see e2e/helpers.ts → desktopAppPage).
//   E2E_DESKTOP_APP=1 npx playwright test -c playwright.desktop-app.config.ts
// The chat test's second person uses Microsoft Edge on http://localhost:3000 (npm run dev).
export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["06-mobile.spec.ts"], // phone layouts are covered by the web and Android runs
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "reports/desktop-app.json" }]],
  use: { baseURL: "http://localhost:3000", channel: "msedge", viewport: { width: 1440, height: 900 }, trace: "retain-on-failure", screenshot: "only-on-failure" },
});
