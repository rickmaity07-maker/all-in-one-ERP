import { test as base, expect, _android, type Page, type AndroidDevice } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";

// Load .env.local so tests see the same settings as the app (Playwright doesn't do this itself).
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

// When testing a deployed copy under a sub-path (GitHub Pages), "/dashboard" must become "/all-in-one-ERP/dashboard".
const BASE_PATH = process.env.E2E_BASE_URL ? new URL(process.env.E2E_BASE_URL).pathname.replace(/\/$/, "") : "";
export function withBasePath(page: Page) {
  const p = page as Page & { __based?: boolean };
  if (!BASE_PATH || p.__based) return page;
  p.__based = true;
  const goto = page.goto.bind(page);
  page.goto = (url, options) => goto(url.startsWith("/") ? BASE_PATH + url : url, options);
  return page;
}

// ---------- Android app ----------
// E2E_ANDROID_PKG=com.allinoneerp.app(.debug) runs the same specs inside the installed Android app:
// Playwright attaches to the app's WebView over adb instead of launching a browser.
export const ANDROID_PKG = process.env.E2E_ANDROID_PKG ?? "";
export const onAndroid = Boolean(ANDROID_PKG);
const ANDROID_ORIGIN = process.env.E2E_ANDROID_ORIGIN ?? "http://tauri.localhost";

let device: AndroidDevice | null = null;
let appPage: Page | null = null;
export async function androidDevice() {
  if (!device) [device] = await _android.devices();
  if (!device) throw new Error("No Android device/emulator found (adb devices).");
  return device;
}
export const adb = async (cmd: string) => (await (await androidDevice()).shell(cmd)).toString();

export async function androidPage(): Promise<Page> {
  if (appPage && !appPage.isClosed()) return appPage;
  const d = await androidDevice();
  await d.shell(`am start -W -n ${ANDROID_PKG}/com.allinoneerp.app.MainActivity`);
  const webview = await d.webView({ pkg: ANDROID_PKG }, { timeout: 60_000 });
  appPage = await webview.page();
  const goto = appPage.goto.bind(appPage);
  appPage.goto = (url, options) => goto(url.startsWith("/") ? ANDROID_ORIGIN + url : url, options);
  // Record what the app prints and which URLs it hands to the system (the browser), so tests can check them.
  await appPage.addInitScript(() => {
    const w = window as unknown as { __printed?: string[]; __opened?: string[] };
    window.addEventListener("erp:print", (e) => (w.__printed ??= []).push((e as CustomEvent).detail.html));
    window.addEventListener("erp:open-external", (e) => (w.__opened ??= []).push((e as CustomEvent).detail.url));
  });
  return appPage;
}

// Brings the app back to the front (after the browser or a system dialog opened).
export async function returnToApp() {
  if (!onAndroid) return;
  await adb(`am start -n ${ANDROID_PKG}/com.allinoneerp.app.MainActivity`);
}

// Use this "test" in specs so every page understands the base path (and, on Android, is the app).
export const test = base.extend({
  page: async ({ page }, provide) => {
    if (!onAndroid) {
      await provide(withBasePath(page));
      return;
    }
    const app = await androidPage();
    // Each test starts signed out on the login screen, like a fresh browser context.
    await app.goto("/");
    await app.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await app.goto("/");
    await provide(app);
    app.removeAllListeners();
  },
});

// CSV export: a browser download on desktop, a real file in the phone's Downloads folder on Android.
export async function exportCsv(page: Page, click: () => Promise<void>): Promise<{ name: string; text: string }> {
  if (!onAndroid) {
    const [dl] = await Promise.all([page.waitForEvent("download"), click()]);
    const path = await dl.path();
    return { name: dl.suggestedFilename(), text: readFileSync(path!, "utf8") };
  }
  const before = new Set((await adb("ls /sdcard/Download")).split(/\s+/));
  await click();
  let name = "";
  await expect.poll(async () => {
    name = (await adb("ls /sdcard/Download")).split(/\s+/).find((f) => f && !before.has(f)) ?? "";
    return name;
  }, { timeout: 15_000 }).not.toBe("");
  const text = await adb(`cat "/sdcard/Download/${name}"`);
  await adb(`rm "/sdcard/Download/${name}"`);
  return { name, text: text.replace(/^\uFEFF/, "") };
}

// "Open" buttons: a new tab on desktop; on Android the app hands the URL to the phone's browser.
// Returns the URL that was opened.
export async function openedUrl(page: Page, click: () => Promise<void>): Promise<string> {
  if (!onAndroid) {
    const [tab] = await Promise.all([page.context().waitForEvent("page"), click()]);
    await tab.waitForLoadState("domcontentloaded").catch(() => {});
    const url = tab.url();
    await tab.close();
    return url;
  }
  const count = await page.evaluate(() => ((window as unknown as { __opened?: string[] }).__opened ?? []).length);
  await click();
  let url = "";
  await expect.poll(async () => {
    url = await page.evaluate((n) => ((window as unknown as { __opened?: string[] }).__opened ?? [])[n] ?? "", count);
    return url;
  }, { timeout: 15_000 }).not.toBe("");
  // Android really left the app for another activity (the browser / viewer).
  await expect.poll(async () => !(await adb("dumpsys activity activities | grep -m1 -i 'ResumedActivity'")).includes(ANDROID_PKG), { timeout: 15_000 }).toBe(true);
  await returnToApp();
  return url;
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
  withBasePath(page);
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
  if (onAndroid) return; // recorded by androidPage() from the app's "erp:print" event
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
  if (onAndroid) {
    // Close Android's print dialog and come back to the app.
    await page.waitForTimeout(1500);
    if (!(await adb("dumpsys activity activities | grep -m1 -E 'ResumedActivity'")).includes(ANDROID_PKG)) {
      await adb("input keyevent KEYCODE_BACK");
      await returnToApp();
    }
  }
  return page.evaluate(() => (window as unknown as { __printed?: string[] }).__printed ?? []);
}
