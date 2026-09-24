import { test, expect } from "@playwright/test";
import { hasOwner, owner, login, watchForErrors, expectNoErrorToast } from "./helpers";

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
    const errors = watchForErrors(page);
    await login(page, owner);
    const failures: string[] = [];
    for (const route of ROUTES) {
      await test.step(route, async () => {
        const before = errors.length;
        await page.goto(route);
        await expect(page.locator("main").first()).toBeVisible();
        await page.waitForLoadState("networkidle");
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
