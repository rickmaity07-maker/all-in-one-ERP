import { expect } from "@playwright/test";
import { test, hasOwner, owner, login, watchForErrors } from "./helpers";

// The web version on a phone: nothing may be wider than the screen, and the menu must work.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
test.skip(!hasOwner, "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD in .env.local");
test.setTimeout(180_000);

const ROUTES = [
  "/dashboard", "/announcements", "/classes", "/attendance", "/gradebook", "/e-learning", "/exams",
  "/registrar", "/housing", "/chat", "/calendar", "/leave", "/makerspace", "/careers", "/library",
  "/campus-life", "/logistics", "/tasks", "/admissions", "/finance", "/admin", "/settings",
  "/academics", "/degree-audit", "/facilities", "/credentials", "/analytics", "/integrations", "/verify",
];

test("login screen fits a phone", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Secure Sign In" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("every page fits a phone screen and the menu works", async ({ page }) => {
  const errors = watchForErrors(page);
  await login(page, owner);
  // Long unbroken text must wrap instead of pushing the page sideways.
  const longTitle = `E2E-${"W".repeat(60)}-${Date.now()}`;
  await page.goto("/announcements");
  await page.getByRole("button", { name: "New Announcement" }).last().click();
  await page.getByRole("dialog").getByLabel("Title").fill(longTitle);
  await page.getByRole("dialog").getByLabel("Message").fill("x".repeat(120));
  await page.getByRole("dialog").getByRole("button", { name: "Post" }).click();
  await expect(page.getByText(longTitle)).toBeVisible();
  const wide: string[] = [];
  for (const route of ROUTES) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    // Page-level horizontal scrolling means something is too wide. Tables may scroll inside their own box.
    const overflow = await page.evaluate(() => {
      const main = document.querySelector("main");
      const docOver = document.documentElement.scrollWidth - window.innerWidth;
      const mainOver = main ? main.scrollWidth - main.clientWidth : 0;
      return Math.max(docOver, mainOver);
    });
    if (overflow > 1) wide.push(`${route}: ${overflow}px too wide`);
  }
  await page.goto("/announcements");
  page.once("dialog", (d) => d.accept());
  await page.locator("article").filter({ hasText: longTitle }).getByTitle("Delete").click();
  await expect(page.getByText(longTitle)).toHaveCount(0);
  expect(wide, wide.join("\n")).toEqual([]);

  // Hamburger menu → navigate
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("link", { name: "Master Calendar" }).click();
  await expect(page).toHaveURL(/\/calendar/);
  await expect(page.getByRole("link", { name: "Master Calendar" })).toHaveCount(0); // menu closed after navigating

  // Module tabs appear as swipeable pills on phones
  await page.goto("/finance");
  await page.getByRole("tab", { name: "Expenses & Payroll" }).click();
  await expect(page.getByRole("heading", { name: "Expenses & Payroll" })).toBeVisible();

  // Bell opens as a full-width panel
  await page.getByRole("button", { name: /Notifications/ }).first().click();
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  expect(errors).toEqual([]);
});
