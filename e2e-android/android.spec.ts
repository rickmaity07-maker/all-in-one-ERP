import { expect, type Locator, type Page } from "@playwright/test";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { test, hasOwner, owner, login, adb, androidDevice, androidPage, returnToApp, ANDROID_PKG, onAndroid } from "../e2e/helpers";

// Tests that only make sense inside the Android app: hardware keys, rotation, the on-screen keyboard,
// system pickers and dialogs, app lifecycle, connectivity, permissions and the APK itself.
// Run with: E2E_ANDROID_PKG=com.allinoneerp.app.debug npx playwright test -c playwright.android.config.ts
test.describe.configure({ mode: "serial" });
test.skip(!onAndroid, "Set E2E_ANDROID_PKG and connect an emulator or phone (adb devices).");
test.skip(!hasOwner, "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD");
test.setTimeout(180_000);

const APP_VERSION = JSON.parse(readFileSync("package.json", "utf8")).version as string;
const resumed = async () => adb("dumpsys activity activities | grep -m1 -E 'mResumedActivity|topResumedActivity|ResumedActivity'");
const appInFront = async () => (await resumed()).includes(ANDROID_PKG);
const greeting = (page: Page) => page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ });
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

// Screen bounds of the app's WebView (from the accessibility tree), for real finger taps.
async function webViewBounds() {
  await adb("uiautomator dump /sdcard/ui.xml");
  const xml = await adb("cat /sdcard/ui.xml");
  const m = xml.match(/class="android\.webkit\.WebView"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!m) throw new Error("WebView not found in the UI tree");
  const [x1, y1, x2, y2] = m.slice(1).map(Number);
  return { x1, y1, x2, y2 };
}
async function screenSize() {
  const m = (await adb("wm size")).match(/(\d+)x(\d+)\s*$/m)!;
  return { w: Number(m[1]), h: Number(m[2]) };
}
// A genuine touch on the element (adb input tap), not a script click.
async function tap(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  const wv = await webViewBounds();
  await adb(`input tap ${Math.round(wv.x1 + (box.x + box.width / 2) * dpr)} ${Math.round(wv.y1 + (box.y + box.height / 2) * dpr)}`);
}

test.afterEach(async () => {
  // Leave the device as we found it.
  await adb("cmd connectivity airplane-mode disable").catch(() => {});
  await adb("settings put system font_scale 1.0").catch(() => {});
  await adb("settings put system user_rotation 0").catch(() => {});
  if (!(await appInFront().catch(() => true))) await returnToApp();
});

test("the APK: package, version, launcher entry and only harmless permissions", async () => {
  const info = await adb(`dumpsys package ${ANDROID_PKG}`);
  expect(info, "installed").toContain(`Package [${ANDROID_PKG}]`);
  expect(info.match(/versionName=([\d.]+)/)?.[1], "version matches the release").toBe(process.env.E2E_ANDROID_VERSION ?? APP_VERSION);
  expect(await adb(`cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER ${ANDROID_PKG}`)).toContain("MainActivity");
  const requested = [...info.matchAll(/(android\.permission\.[A-Z_]+)/g)].map((m) => m[1]);
  const risky = requested.filter((p) => /CAMERA|LOCATION|CONTACTS|SMS|CALL|RECORD_AUDIO|READ_EXTERNAL|WRITE_EXTERNAL|MEDIA|PHONE|CALENDAR|BODY_SENSORS/.test(p));
  expect(risky, "no access to camera, location, contacts, files, etc.").toEqual([]);
  expect(requested).toContain("android.permission.INTERNET");
});

test("cold start: opens to the login screen quickly", async () => {
  await adb(`am force-stop ${ANDROID_PKG}`);
  const out = await adb(`am start -W -n ${ANDROID_PKG}/com.allinoneerp.app.MainActivity`);
  const total = Number(out.match(/TotalTime:\s*(\d+)/)?.[1] ?? 99999);
  expect(total, `launch took ${total} ms`).toBeLessThan(15_000);
  const page = await androidPage();
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Secure Sign In" })).toBeVisible();
});

test("content is not drawn under the status bar or navigation bar", async () => {
  const wv = await webViewBounds();
  const { h } = await screenSize();
  expect(wv.y1, "WebView starts below the status bar").toBeGreaterThan(0);
  expect(wv.y2, "WebView ends above the navigation bar").toBeLessThanOrEqual(h);
});

test("hardware back button goes back through pages, then leaves the app", async ({ page }) => {
  await adb("logcat -c -b crash");
  await login(page, owner);
  await page.goto("/announcements");
  await page.goto("/finance");
  await adb("input keyevent KEYCODE_BACK");
  await expect(page).toHaveURL(/\/announcements/);
  await adb("input keyevent KEYCODE_BACK");
  await expect(page).toHaveURL(/\/dashboard/);
  // Keep pressing until history runs out: the app then goes to the background instead of showing a blank page.
  for (let i = 0; i < 6 && (await appInFront()); i++) await adb("input keyevent KEYCODE_BACK");
  expect(await appInFront(), "app left the foreground").toBe(false);
  // It goes to the background rather than crashing or being torn down.
  await page.waitForTimeout(3000);
  expect((await adb(`pidof ${ANDROID_PKG}`)).trim(), "app process still alive").not.toBe("");
  expect(await adb("logcat -d -b crash"), "no crash while leaving").not.toContain(ANDROID_PKG);
  await returnToApp();
  await expect(greeting(page)).toBeVisible();
});

test("rotation keeps the page and what was typed, and the layout still fits", async ({ page }) => {
  await page.getByPlaceholder("Email Address").fill("rotate@example.com");
  await adb("settings put system accelerometer_rotation 0");
  await adb("settings put system user_rotation 1");
  await expect.poll(() => page.evaluate(() => window.innerWidth > window.innerHeight), { timeout: 15_000 }).toBe(true);
  await expect(page.getByPlaceholder("Email Address")).toHaveValue("rotate@example.com");
  expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(1);
  await adb("settings put system user_rotation 0");
  await expect.poll(() => page.evaluate(() => window.innerWidth < window.innerHeight), { timeout: 15_000 }).toBe(true);
  await expect(page.getByPlaceholder("Email Address")).toHaveValue("rotate@example.com");
});

test("tapping a field opens the keyboard without covering the field", async ({ page }) => {
  const password = page.getByPlaceholder("Password");
  const before = await page.evaluate(() => window.innerHeight);
  await tap(page, password);
  await expect.poll(async () => (await adb("dumpsys input_method")).includes("mInputShown=true"), { timeout: 15_000 }).toBe(true);
  // The app shrinks to the space above the keyboard, so the focused field stays visible.
  await expect.poll(() => page.evaluate(() => window.innerHeight), { timeout: 10_000 }).toBeLessThan(before);
  await expect(password).toBeFocused();
  const box = (await password.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight));
  await adb("input text Hello123");
  await expect(password).toHaveValue("Hello123");
  await adb("input keyevent KEYCODE_BACK"); // hides the keyboard, stays in the app
  expect(await appInFront()).toBe(true);
});

test("upload fields open Android's file picker", async ({ page }) => {
  await login(page, owner);
  await page.goto("/e-learning");
  await page.getByRole("button", { name: "Create Module" }).click();
  await tap(page, page.getByRole("dialog").locator('input[type="file"]'));
  await expect.poll(async () => /documentsui|DocumentsUI|files/i.test(await resumed()), { timeout: 15_000 }).toBe(true);
  await adb("input keyevent KEYCODE_BACK");
  await expect.poll(appInFront, { timeout: 15_000 }).toBe(true);
});

test("printing opens Android's print dialog", async ({ page }) => {
  await login(page, owner);
  await page.evaluate(() => (window as unknown as { AndroidBridge: { print(h: string, t: string): void } }).AndroidBridge.print("<h1>Invoice test</h1>", "Invoice test"));
  await expect.poll(async () => /printspooler/i.test(await resumed()), { timeout: 20_000 }).toBe(true);
  await adb("input keyevent KEYCODE_BACK");
  await expect.poll(appInFront, { timeout: 15_000 }).toBe(true);
});

test("CSV exports are real files in the phone's Downloads folder", async ({ page }) => {
  await login(page, owner);
  const name = `e2e-${Date.now()}.csv`;
  const where = await page.evaluate(
    (n) => (window as unknown as { AndroidBridge: { saveFile(a: string, b: string, c: string): string } }).AndroidBridge.saveFile(n, "text/csv", btoa("a,b\r\n1,2")),
    name
  );
  expect(where).toContain(name);
  await expect.poll(() => adb(`cat /sdcard/Download/${name}`)).toBe("a,b\r\n1,2");
  expect(await adb("content query --uri content://media/external/downloads --projection _display_name")).toContain(name);
  await adb(`rm /sdcard/Download/${name}`);
});

test("going to the background and coming back keeps you signed in", async ({ page }) => {
  await login(page, owner);
  await page.goto("/finance");
  await adb("input keyevent KEYCODE_HOME");
  await expect.poll(appInFront).toBe(false);
  await page.waitForTimeout(3000);
  await returnToApp();
  await expect.poll(appInFront).toBe(true);
  await expect(page).toHaveURL(/\/finance/);
  await expect(page.getByRole("heading", { name: "Financial Dashboard" })).toBeVisible();
});

test("after the app is closed completely it reopens already signed in", async ({ page }) => {
  await login(page, owner);
  await adb(`am force-stop ${ANDROID_PKG}`);
  await adb(`am start -W -n ${ANDROID_PKG}/com.allinoneerp.app.MainActivity`);
  const fresh = await androidPage();
  await expect(greeting(fresh)).toBeVisible({ timeout: 30_000 });
});

test("offline: a clear message instead of a crash, and it recovers when back online", async ({ page }) => {
  await login(page, owner);
  await adb("cmd connectivity airplane-mode enable");
  await page.waitForTimeout(3000);
  // The screens themselves are bundled in the app, so they still open; the data calls fail.
  await page.goto("/announcements");
  await expect(page.getByText(/You're offline/)).toBeVisible({ timeout: 30_000 });
  // Still signed in (a dropped connection must not look like a locked or unapproved account).
  await expect(page.getByText(/waiting for an administrator|deactivated/i)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Secure Sign In" })).toHaveCount(0);
  expect(await appInFront(), "app is still running").toBe(true);
  await adb("cmd connectivity airplane-mode disable");
  await page.waitForTimeout(5000);
  await page.goto("/announcements");
  await expect(page.getByRole("heading", { name: /Notice Board/ }).first()).toBeVisible({ timeout: 30_000 });
});

test("large system font size: pages still fit the screen", async ({ page }) => {
  await login(page, owner);
  await adb("settings put system font_scale 1.3");
  await page.waitForTimeout(2000);
  for (const route of ["/dashboard", "/finance", "/academics", "/settings"]) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    expect(await noHorizontalScroll(page), `${route} scrolls sideways`).toBeLessThanOrEqual(1);
  }
});

test("links and files open in the phone's browser, not inside the app", async ({ page }) => {
  await login(page, owner);
  await page.evaluate(() => (window as unknown as { __TAURI_INTERNALS__: { invoke(c: string, a: unknown): Promise<unknown> } }).__TAURI_INTERNALS__.invoke("plugin:opener|open_url", { url: "https://example.com/" }));
  await expect.poll(async () => !(await appInFront()), { timeout: 15_000 }).toBe(true);
  expect(await resumed()).toMatch(/chrome|browser/i);
  await returnToApp();
  await expect.poll(appInFront).toBe(true);
});

test("Settings shows the Android version and checks GitHub for a newer APK", async ({ page }) => {
  await login(page, owner);
  await page.goto("/settings");
  await expect(page.getByText(process.env.E2E_ANDROID_VERSION ?? APP_VERSION).first()).toBeVisible();
  await page.getByRole("button", { name: /Check for updates/i }).click();
  // The test build is numbered below the published release, so an update must be offered as an APK download.
  if (process.env.E2E_ANDROID_VERSION === "0.0.1") {
    const download = page.getByRole("button", { name: "Download update" }).first();
    await expect(download).toBeVisible({ timeout: 30_000 });
    await download.click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __opened?: string[] }).__opened ?? []), { timeout: 15_000 })
      .toContainEqual(expect.stringMatching(/\.apk$/));
    await expect(page.getByText(/downloading in your browser/i).first()).toBeVisible();
    await returnToApp();
  } else {
    await expect(page.getByText(/latest version|ready to install/i).first()).toBeVisible({ timeout: 30_000 });
  }
});

// ---------- Installing and updating the APK ----------
const TEST_APK = process.env.E2E_TEST_APK ?? "";
const RELEASE_APK = process.env.E2E_RELEASE_APK ?? "";
const APKSIGNER = process.env.E2E_APKSIGNER ?? "";

test("updating the app over an installed copy keeps the user signed in", async ({ page }) => {
  test.skip(!TEST_APK, "E2E_TEST_APK not set");
  await login(page, owner);
  await (await androidDevice()).installApk(TEST_APK, { args: ["-r"] });
  await adb(`am start -W -n ${ANDROID_PKG}/com.allinoneerp.app.MainActivity`);
  const fresh = await androidPage();
  await expect(greeting(fresh)).toBeVisible({ timeout: 30_000 });
});

test("a copy signed with someone else's key is refused (no hijacked updates)", async () => {
  test.skip(!TEST_APK || !APKSIGNER, "E2E_TEST_APK / E2E_APKSIGNER not set");
  const dir = mkdtempSync(join(tmpdir(), "apk-"));
  const ks = join(dir, "attacker.jks");
  execSync(`keytool -genkeypair -keystore "${ks}" -alias x -keyalg RSA -keysize 2048 -validity 1 -storepass attacker -keypass attacker -dname CN=Attacker`, { stdio: "ignore" });
  const forged = join(dir, "forged.apk");
  copyFileSync(TEST_APK, forged);
  execSync(`"${APKSIGNER}" sign --ks "${ks}" --ks-pass pass:attacker "${forged}"`, { stdio: "ignore" });
  const err = await (await androidDevice()).installApk(forged, { args: ["-r"] }).then(() => "", (e: Error) => e.message);
  expect(err).toMatch(/INSTALL_FAILED_UPDATE_INCOMPATIBLE|signatures do not match/i);
  expect(await adb(`dumpsys package ${ANDROID_PKG}`)).toContain(`Package [${ANDROID_PKG}]`);
});

test("the release APK is signed with the release key and starts without crashing", async () => {
  test.skip(!RELEASE_APK || !APKSIGNER, "E2E_RELEASE_APK / E2E_APKSIGNER not set");
  const certs = execSync(`"${APKSIGNER}" verify --verbose --print-certs "${RELEASE_APK}"`).toString();
  expect(certs).toMatch(/Verified using v2 scheme \(APK Signature Scheme v2\): true/);
  expect(certs).toContain("CN=All-In-One ERP");
  const releasePkg = ANDROID_PKG.replace(/\.debug$/, "");
  await (await androidDevice()).installApk(RELEASE_APK, { args: ["-r"] });
  await adb("logcat -c");
  await adb(`am start -W -n ${releasePkg}/com.allinoneerp.app.MainActivity`);
  await expect.poll(async () => (await resumed()).includes(releasePkg), { timeout: 20_000 }).toBe(true);
  await new Promise((r) => setTimeout(r, 5000));
  expect(await adb("logcat -d -b crash")).not.toContain(releasePkg);
  await adb(`am force-stop ${releasePkg}`);
  await returnToApp();
});
