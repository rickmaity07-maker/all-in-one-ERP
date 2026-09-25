// Real auto-update test for the installed Windows app.
// 1. Starts the installed app with WebView2 remote debugging, 2. waits for the "Update & restart" banner,
// 3. clicks it, 4. waits for the new version to install and relaunch, 5. checks Settings shows the new version
// and that the Content-Security-Policy blocks nothing while signing in and browsing.
// Usage: node e2e-desktop/update.mjs <expected-new-version>
import { chromium } from "@playwright/test";
import { execSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const expected = process.argv[2];
if (!expected) throw new Error("Usage: node e2e-desktop/update.mjs <expected-version>");
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]));
const exe = join(process.env.LOCALAPPDATA, "all-in-one-erp", "app.exe");
const PORT = 9333;
const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const installedVersion = () =>
  execSync(`powershell -NoProfile -Command "(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' | Where-Object DisplayName -eq 'all-in-one-erp').DisplayVersion"`)
    .toString().trim();
const killApp = () => {
  try { execSync(`powershell -NoProfile -Command "Get-Process app -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*all-in-one-erp*' } | Stop-Process -Force"`); } catch {}
};

async function connect(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
      const page = browser.contexts()[0]?.pages().find((p) => !p.url().startsWith("devtools"));
      if (page) return { browser, page };
      await browser.close();
    } catch {}
    await sleep(1000);
  }
  throw new Error("Could not connect to the app's WebView");
}

function watchCsp(page, bucket) {
  page.on("console", (m) => /Content Security Policy|Refused to (load|connect|execute|apply)/i.test(m.text()) && bucket.push(m.text()));
}

async function signIn(page) {
  if (await page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }).isVisible().catch(() => false)) return;
  if (!(await page.getByPlaceholder("Email Address").isVisible().catch(() => false))) {
    await page.evaluate(() => (window.location.href = "/"));
    await page.getByPlaceholder("Email Address").waitFor();
  }
  await page.getByPlaceholder("Email Address").fill(env.E2E_OWNER_EMAIL);
  await page.getByPlaceholder("Password").fill(env.E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: /Connect to Database/ }).click();
  await page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }).waitFor({ timeout: 30000 });
}

const before = installedVersion();
check(`installed version before update is older than ${expected}`, before && before !== expected, before);

killApp();
const launchEnv = { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` };
spawn(exe, [], { env: launchEnv, detached: true, stdio: "ignore" }).unref();
let { browser, page } = await connect();
const cspBefore = [];
watchCsp(page, cspBefore);

// The banner appears ~3 seconds after start once latest.json on GitHub reports a newer version.
const banner = page.getByText(new RegExp(`Version ${expected.replace(/\./g, "\\.")} is available`));
await banner.waitFor({ timeout: 60000 });
check("update banner offers the new version", true);
await page.getByRole("button", { name: /Update & restart/ }).click();
check("clicked Update & restart", true);
await browser.close().catch(() => {});

// Download, passive install, relaunch.
const start = Date.now();
while (Date.now() - start < 240000 && installedVersion() !== expected) await sleep(3000);
const after = installedVersion();
check("Windows now reports the new version installed", after === expected, after);

// Make sure an instance is running with remote debugging so we can inspect it.
await sleep(8000);
killApp();
spawn(exe, [], { env: launchEnv, detached: true, stdio: "ignore" }).unref();
({ browser, page } = await connect());
const cspAfter = [];
watchCsp(page, cspAfter);
await signIn(page);
check("signs in after the update (strict CSP allows Supabase)", true);
for (const path of ["/announcements", "/classes", "/chat", "/settings"]) {
  await page.evaluate((p) => (window.location.href = p), path);
  await page.waitForLoadState("networkidle").catch(() => {});
  await sleep(1500);
}
const shown = await page.getByText(/^\d+\.\d+\.\d+$/).first().textContent().catch(() => "");
check("Settings shows the new version", shown?.trim() === expected, shown ?? "");
check("no Content-Security-Policy violations", cspAfter.length === 0, cspAfter.slice(0, 3).join(" | "));
await browser.close().catch(() => {});
killApp();

console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
