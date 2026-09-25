import { test as base, expect, _android, chromium, type Page, type AndroidDevice } from "@playwright/test";
import { readFileSync, existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { execSync, spawn } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

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
// E2E_DESKTOP_APP=1 runs the same specs inside the installed Windows app (its WebView2, over CDP).
export const onDesktopApp = process.env.E2E_DESKTOP_APP === "1";
// Either native app: one app window instead of fresh browser tabs.
export const onApp = onAndroid || onDesktopApp;
const ANDROID_ORIGIN = process.env.E2E_ANDROID_ORIGIN ?? "http://tauri.localhost";

let device: AndroidDevice | null = null;
let appPage: Page | null = null;
let appPid = "";
export async function androidDevice() {
  // E2E_ANDROID_SERIAL picks one emulator when several run side by side (e.g. phone + tablet).
  if (!device) {
    const all = await _android.devices();
    device = all.find((d) => !process.env.E2E_ANDROID_SERIAL || d.serial() === process.env.E2E_ANDROID_SERIAL) ?? null;
  }
  if (!device) throw new Error("No Android device/emulator found (adb devices).");
  return device;
}
export const adb = async (cmd: string) => (await (await androidDevice()).shell(cmd)).toString();

export async function androidPage(): Promise<Page> {
  const d = await androidDevice();
  // Reuse the attached page only while the app process is still alive.
  const pid = (await d.shell(`pidof ${ANDROID_PKG}`)).toString().trim();
  if (appPage && !appPage.isClosed() && pid && pid === appPid) return appPage;
  if (appPage && !pid) console.warn("Android app process was not running; relaunching it.");
  appPage = null;
  await d.shell(`am start -W -n ${ANDROID_PKG}/com.allinoneerp.app.MainActivity`);
  const webview = await d.webView({ pkg: ANDROID_PKG }, { timeout: 60_000 });
  // The app can briefly own a second, hidden WebView (the print helper); drive the one showing the app.
  const first = await webview.page();
  appPage = first.context().pages().find((p) => p.url().startsWith(ANDROID_ORIGIN)) ?? first;
  appPid = (await d.shell(`pidof ${ANDROID_PKG}`)).toString().trim();
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

// Signs the app out the hard way: wipes everything it stores (localStorage and the IndexedDB session store).
export async function clearAppStorage(page: Page) {
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await new Promise<void>((resolve) => {
      const req = indexedDB.open("erp-auth", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("kv");
      req.onerror = () => resolve();
      req.onsuccess = () => {
        const tx = req.result.transaction("kv", "readwrite");
        tx.objectStore("kv").clear();
        tx.oncomplete = tx.onerror = () => { req.result.close(); resolve(); };
      };
    });
  });
}

// ---------- Windows desktop app ----------
const DESKTOP_EXE = join(process.env.LOCALAPPDATA ?? "", "all-in-one-erp", "app.exe");
const CDP_PORT = 9333;
let deskPage: Page | null = null;
export async function desktopAppPage(): Promise<Page> {
  if (deskPage && !deskPage.isClosed()) return deskPage;
  try { execSync(`powershell -NoProfile -Command "Get-Process app -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*all-in-one-erp*' } | Stop-Process -Force"`); } catch {}
  spawn(DESKTOP_EXE, [], { detached: true, stdio: "ignore", env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_PORT}` } }).unref();
  for (let i = 0; i < 60 && !deskPage; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const b = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
      deskPage = b.contexts()[0]?.pages().find((p) => p.url().startsWith(ANDROID_ORIGIN)) ?? null;
    } catch {}
  }
  if (!deskPage) throw new Error("Could not attach to the installed desktop app");
  const goto = deskPage.goto.bind(deskPage);
  deskPage.goto = (url, options) => goto(url.startsWith("/") ? ANDROID_ORIGIN + url : url, options);
  await deskPage.addInitScript(() => {
    const w = window as unknown as { __opened?: string[] };
    window.addEventListener("erp:open-external", (e) => (w.__opened ??= []).push((e as CustomEvent).detail.url));
  });
  return deskPage;
}

// Brings the app back to the front (after the browser or a system dialog opened).
export async function returnToApp() {
  if (!onAndroid) return;
  // Another app (e.g. the browser finishing its own start-up) can jump back on top; insist until
  // the app has stayed in front for a moment, otherwise its WebView stops drawing.
  const front = async () => (await adb("dumpsys activity activities | grep -m1 -E 'ResumedActivity'")).includes(ANDROID_PKG);
  for (let i = 0, steady = 0; i < 20 && steady < 3; i++) {
    if (await front()) steady++;
    else {
      steady = 0;
      await adb(`am start -n ${ANDROID_PKG}/com.allinoneerp.app.MainActivity`);
    }
    await new Promise((r) => setTimeout(r, 700));
  }
}

// Use this "test" in specs so every page understands the base path (and, on Android, is the app).
export const test = base.extend({
  page: async ({ page }, provide) => {
    if (!onApp) {
      await provide(withBasePath(page));
      return;
    }
    const app = onAndroid ? await androidPage() : await desktopAppPage();
    await returnToApp(); // the app must be in front, or its WebView stops drawing
    // Each test starts signed out on the login screen, like a fresh browser context.
    await app.goto("/");
    await clearAppStorage(app);
    await app.goto("/");
    await provide(app);
    app.removeAllListeners();
  },
});

// CSV export: a browser download on desktop, a real file in the phone's Downloads folder on Android.
export async function exportCsv(page: Page, click: () => Promise<void>): Promise<{ name: string; text: string }> {
  if (onDesktopApp) {
    // The desktop app saves downloads straight into the Downloads folder.
    const dir = join(homedir(), "Downloads");
    const since = Date.now();
    await click();
    let name = "";
    await expect.poll(() => {
      name = readdirSync(dir).find((f) => f.endsWith(".csv") && !f.endsWith(".crdownload") && statSync(join(dir, f)).mtimeMs >= since - 1000) ?? "";
      return name;
    }, { timeout: 15_000 }).not.toBe("");
    const text = readFileSync(join(dir, name), "utf8").replace(/^﻿/, "");
    unlinkSync(join(dir, name));
    return { name: name.replace(/ \(\d+\)(?=\.csv$)/, ""), text };
  }
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
  if (!onApp) {
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
  if (onDesktopApp) return url; // handed to the default browser by the app
  // Android really left the app for another activity (the browser / viewer).
  await expect.poll(async () => !(await adb("dumpsys activity activities | grep -m1 -i 'ResumedActivity'")).includes(ANDROID_PKG), { timeout: 15_000 }).toBe(true);
  await new Promise((r) => setTimeout(r, 2500)); // let the other app finish opening
  // Close the browser completely so it can't jump back in front later (redirects, "open in app" prompts).
  await adb("am force-stop com.android.chrome");
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
  page.on("pageerror", (e) => {
    // Tauri framework quirk (Android): a native reply that lands while a page is being unloaded by a full
    // reload (page.goto) finds no IPC bridge in the departing page. The new page is unaffected, and the
    // app itself navigates without full reloads. Documented in the test report.
    if (onAndroid && /reading 'runCallback'/.test(e.message)) return;
    problems.push(`page error: ${e.message}`);
  });
  // Remember which requests failed, so "Failed to load resource" console errors can name the URL.
  const failed: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.request().method()} ${r.url().split("?")[0]}`);
  });
  page.on("console", (m) => {
    // ERR_NETWORK_CHANGED: the device's network reconnected (emulators do this); not an app error.
    if (m.type() === "error" && !/favicon|Download the React DevTools|\[Fast Refresh\]|ERR_NETWORK_CHANGED/i.test(m.text())) problems.push(`console: ${m.text()}${/Failed to load resource/.test(m.text()) && failed.length ? ` [${failed.at(-1)}]` : ""}`);
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
  // Wait for the sign-in screen itself: on the web version every URL ends in "/", so the URL alone
  // doesn't show that signing out has finished.
  await expect(page.getByRole("heading", { name: "Secure Sign In" })).toBeVisible();
}

export async function expectToast(page: Page, text: string | RegExp, timeout?: number) {
  // The Android emulator's network is slow (sign-in requests take 5-8 s), so allow longer there.
  await expect(page.locator(".fixed.bottom-6").getByText(text).last()).toBeVisible({ timeout: timeout ?? (onAndroid ? 45_000 : undefined) });
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
