import { expect } from "@playwright/test";
import { test, owner, hasOwner, login, logout } from "./helpers";

// Security: signing out must really end the session on this device (shared/school computers).
test.skip(!hasOwner, "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD in .env.local");

test("after logging out, reloading does not bring the previous user back", async ({ page }) => {
  await login(page, owner);
  await logout(page);
  for (let i = 0; i < 3; i++) {
    await page.goto("/");
    await page.waitForTimeout(2500);
    await expect(page.getByRole("heading", { name: "Secure Sign In" }), `reload ${i + 1}`).toBeVisible();
    await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toHaveCount(0);
  }
  const stored = await page.evaluate(async () => {
    const ls = Object.keys(localStorage).filter((k) => k.includes("auth-token"));
    const idb = await new Promise<string[]>((resolve) => {
      const r = indexedDB.open("erp-auth", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => { const q = r.result.transaction("kv").objectStore("kv").getAllKeys(); q.onsuccess = () => resolve(q.result.map(String)); };
      r.onerror = () => resolve([]);
    });
    return { ls, idb };
  });
  expect(stored).toEqual({ ls: [], idb: [] });
});
