import { defineConfig } from "@playwright/test";

// Runs the E2E specs inside the Android app (see e2e/helpers.ts → androidPage) plus the
// Android-only tests in e2e-android/. Needs an emulator or phone on adb and:
//   E2E_ANDROID_PKG=com.allinoneerp.app.debug   (debug builds allow WebView automation)
//   E2E_SUITE=full    → e2e/ (tablet-size screen, same tests as the desktop app)
//   E2E_SUITE=phone   → the phone-layout test and the Android-only tests
// The chat test's second person uses a normal browser on http://localhost:3000 (the static web build).
const suite = process.env.E2E_SUITE ?? "full";

export default defineConfig({
  testDir: ".",
  testMatch: suite === "phone" ? ["e2e/06-mobile.spec.ts", "e2e-android/**/*.spec.ts"] : ["e2e/**/*.spec.ts"],
  testIgnore: suite === "phone" ? [] : ["e2e/06-mobile.spec.ts"],
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: `test-results/android-${suite}.json` }], ["html", { open: "never", outputFolder: `playwright-report-android-${suite}` }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
