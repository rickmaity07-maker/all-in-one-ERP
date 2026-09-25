import { expect } from "@playwright/test";
import { test, watchForErrors } from "./helpers";

test.describe("Login & route protection", () => {
  test("login screen renders and reports the database as configured", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Secure Sign In" })).toBeVisible();
    await expect(page.getByText("Configured", { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("wrong password shows an error and stays on the login screen", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("Email Address").fill("nobody.e2e@gmail.com");
    await page.getByPlaceholder("Password").fill("definitely-wrong-1");
    await page.getByRole("button", { name: /Connect to Database/ }).click();
    await expect(page.getByText(/Invalid login credentials/i)).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("password shorter than 8 characters is rejected by the form", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Request access/ }).click();
    await page.getByPlaceholder("Full Name").fill("Short Pw");
    await page.getByPlaceholder("Email Address").fill("short.pw.e2e@gmail.com");
    await page.getByPlaceholder("Password").fill("abc");
    await page.getByRole("button", { name: "Request Access", exact: true }).click();
    const valid = await page.getByPlaceholder("Password").evaluate((el: HTMLInputElement) => el.checkValidity());
    expect(valid).toBe(false);
  });

  for (const path of ["/dashboard", "/admin", "/finance", "/gradebook", "/chat"]) {
    test(`signed-out visitor is sent from ${path} back to login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole("heading", { name: "Secure Sign In" })).toBeVisible();
    });
  }
});
