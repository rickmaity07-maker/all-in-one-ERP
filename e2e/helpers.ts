import { expect, type Page } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";

// Load .env.local so tests see the same settings as the app (Playwright doesn't do this itself).
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export type TestUser = { name: string; email: string; password: string };

export const owner: TestUser = { name: "E2E Test Owner", email: process.env.E2E_OWNER_EMAIL ?? "", password: process.env.E2E_OWNER_PASSWORD ?? "" };
export const hasOwner = Boolean(owner.email && owner.password);

// Unique per run so tests never collide with real data or a previous run.
export const RUN = Date.now().toString(36);
export const EMAIL_DOMAIN = process.env.E2E_EMAIL_DOMAIN ?? "gmail.com";
export const testUser = (kind: string): TestUser => ({
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

// Signs in. If the account was just created or reset by an admin, the app forces a new password first;
// that is handled here and the new password is stored on the user object for later logins.
export async function login(page: Page, user: TestUser | string, password?: string) {
  const u: TestUser = typeof user === "string" ? { name: "", email: user, password: password ?? "" } : user;
  await page.goto("/");
  await page.getByPlaceholder("Email Address").fill(u.email);
  await page.getByPlaceholder("Password").fill(u.password);
  await page.getByRole("button", { name: /Connect to Database/ }).click();
  // The app may show the dashboard for a moment before redirecting to Settings, so wait for a final screen.
  const greeting = page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ });
  const mustChange = page.getByText(/signed in with a temporary password/i);
  await expect(greeting.or(mustChange)).toBeVisible();
  if (await mustChange.isVisible()) {
    const next = `${u.password}9`;
    await page.getByLabel("New Password").fill(next);
    await page.getByLabel("Confirm Password").fill(next);
    await page.getByRole("button", { name: "Change Password" }).click();
    await expectToast(page, "Password changed.");
    u.password = next;
    await page.goto("/dashboard");
  }
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  return u;
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

// Admin → Invite User. Returns the user (password may change on their first login).
export async function inviteUser(page: Page, user: TestUser, role: string) {
  await page.goto("/admin");
  await page.getByRole("button", { name: "Invite User" }).click();
  const modal = page.locator("form").filter({ hasText: "Temporary Password" });
  await modal.getByLabel("Full Name").fill(user.name);
  await modal.getByLabel("Email").fill(user.email);
  await modal.getByLabel("Temporary Password").fill(user.password);
  await modal.getByLabel("System Role").selectOption(role);
  await modal.getByRole("button", { name: "Create Account" }).click();
  await expectToast(page, /User created/);
  return user;
}

// Printing opens the system dialog, which would block a test. Capture the printed HTML instead:
// call before navigating, then read with printedDocuments(page).
export async function capturePrints(page: Page) {
  await page.addInitScript(() => {
    const desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow")!;
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
      get() {
        const w = desc.get!.call(this) as (Window & { __stub?: boolean }) | null;
        if (w && !w.__stub) {
          w.__stub = true;
          w.print = () => {
            const store = ((window as unknown as { __printed?: string[] }).__printed ??= []);
            store.push(w.document.documentElement.outerHTML);
          };
        }
        return w;
      },
    });
  });
}

export async function printedDocuments(page: Page): Promise<string[]> {
  await page.waitForTimeout(600);
  return page.evaluate(() => (window as unknown as { __printed?: string[] }).__printed ?? []);
}
