import { expect, type Page } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";

// Load .env.local so tests see the same settings as the app (Playwright doesn't do this itself).
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export const owner = { email: process.env.E2E_OWNER_EMAIL ?? "", password: process.env.E2E_OWNER_PASSWORD ?? "" };
export const hasOwner = Boolean(owner.email && owner.password);

// Unique per run so tests never collide with real data or a previous run.
export const RUN = Date.now().toString(36);
export const EMAIL_DOMAIN = process.env.E2E_EMAIL_DOMAIN ?? "gmail.com";
export const testUser = (kind: string) => ({
  name: `E2E ${kind} ${RUN}`,
  email: `e2e.${kind}.${RUN}@${EMAIL_DOMAIN}`,
  password: `E2e-${RUN}-Pass!`,
});

// Fails the test on uncaught page errors and on any red error toast.
export function watchForErrors(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|Download the React DevTools|\[Fast Refresh\]/i.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  return problems;
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/");
  await page.getByPlaceholder("Email Address").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: /Connect to Database/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
}

export async function logout(page: Page) {
  await page.getByTitle("Log Out").click();
  await expect(page).toHaveURL(/\/$/);
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator(".fixed.bottom-6").getByText(text).last()).toBeVisible();
}

export async function expectNoErrorToast(page: Page) {
  await expect(page.locator(".fixed.bottom-6 .bg-red-50")).toHaveCount(0);
}
