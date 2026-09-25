import { expect } from "@playwright/test";
import { test, hasOwner, owner, login, watchForErrors, expectNoErrorToast, onAndroid } from "./helpers";

// Every page, opened as the owner: must render its heading area with no crashes,
// console errors or "Could not load ..." toasts (which usually mean a missing table/column).
const ROUTES = [
  "/dashboard", "/announcements", "/classes", "/attendance", "/gradebook", "/e-learning", "/exams",
  "/registrar", "/housing", "/chat", "/calendar", "/leave", "/makerspace", "/careers", "/library",
  "/campus-life", "/logistics", "/tasks", "/admissions", "/finance", "/admin", "/settings",
];

test.describe("Smoke: every module loads", () => {
  test.skip(!hasOwner, "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD in .env.local");

  test("all routes render without errors", async ({ page }) => {
    test.setTimeout(300_000);
    const errors = watchForErrors(page);
    await login(page, owner);
    const failures: string[] = [];
    for (const route of ROUTES) {
      await test.step(route, async () => {
        const before = errors.length;
        await page.goto(route);
        await expect(page.locator("main").first()).toBeVisible();
        // Live connections can keep the network busy (e.g. on a phone); the checks below catch real problems.
        await page.waitForLoadState("networkidle", { timeout: onAndroid ? 3_000 : 10_000 }).catch(() => {});
        await expect(page.getByText(/Syncing|Loading/).first()).toHaveCount(0, { timeout: 15_000 }).catch(() => {});
        const toasts = await page.locator(".fixed.bottom-6 .bg-red-50").allInnerTexts();
        if (toasts.length) failures.push(`${route}: ${toasts.join(" | ")}`);
        if (errors.length > before) failures.push(`${route}: ${errors.slice(before).join(" | ")}`);
        await expectNoErrorToast(page).catch(() => {});
      });
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
});

test("losing the connection shows an offline notice and keeps you signed in", async ({ page, context }) => {
  test.skip(!hasOwner, "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD in .env.local");
  test.skip(onAndroid, "covered by the Android airplane-mode test");
  await login(page, owner);
  await context.setOffline(true);
  await expect(page.getByText(/You're offline/)).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText(/You're offline/)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
});
