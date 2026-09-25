import { expect, request, type Page } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, hasOwner, owner, login, RUN, expectToast, openedUrl } from "./helpers";

// Every upload button: upload through the UI, open it again through the app's own
// Open / Play / Read button, download it, and compare the bytes with what we sent.
test.describe.configure({ mode: "serial" });
test.skip(!hasOwner, "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD in .env.local");
test.setTimeout(240_000);

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

// A tiny but valid PDF, so viewers can actually open it.
const pdf = (label: string) =>
  Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n` +
      `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n` +
      `4 0 obj<</Length 60>>stream\nBT /F1 18 Tf 20 70 Td (${label}) Tj ET\nendstream endobj\n` +
      `5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`
  );

// Clicks something that opens a stored file, grabs the signed URL from the new tab,
// downloads it and checks size, type and exact contents.
async function openAndVerify(page: Page, click: () => Promise<void>, original: Buffer, mime: RegExp) {
  const url = await openedUrl(page, click);
  expect(url, "file opens from Supabase Storage with a signed link").toMatch(/supabase\.co\/storage\/v1\/object\/sign\//);
  // Fetched from the test machine (the Android app's WebView can't share its request context).
  const api = await request.newContext();
  const res = await api.get(url);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toMatch(mime);
  const body = await res.body();
  expect(body.length, "downloaded size matches upload").toBe(original.length);
  expect(sha(body), "downloaded bytes match upload exactly").toBe(sha(original));
  await api.dispose();
  return url;
}

// The signed-in user's access token, read from the app's saved Supabase session.
async function ownerToken(page: Page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    return key ? (JSON.parse(localStorage.getItem(key)!).access_token as string) : "";
  });
}

test.beforeEach(async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, owner);
});

test("E-Learning: lecture video (20 MB) uploads, plays back and matches byte-for-byte", async ({ page }) => {
  const video = randomBytes(20 * 1024 * 1024);
  const title = `E2E lecture video ${RUN}`;
  await page.goto("/e-learning");
  await page.getByRole("button", { name: "Create Module" }).click();
  await page.getByPlaceholder("e.g. Kinematics Final Project").fill(title);
  await page.locator("form select").selectOption("Video");
  await page.locator('form input[type="file"]').setInputFiles({ name: "lecture-week5.mp4", mimeType: "video/mp4", buffer: video });
  await page.getByRole("button", { name: "Publish" }).click();
  // Large files over a phone-speed connection can take a while.
  await expectToast(page, "Resource published.", 120_000);
  const item = page.locator("div.rounded-2xl").filter({ hasText: title });
  await expect(item.getByText("20 MB")).toBeVisible();
  await openAndVerify(page, () => item.locator("button").first().click(), video, /video\/mp4/);
  // The big "play latest lecture" button opens the same file.
  await openAndVerify(page, () => page.getByTitle("Play latest lecture").click(), video, /video\/mp4/);
});

test("E-Learning: PDF study material uploads and downloads intact", async ({ page }) => {
  const file = pdf("Week 5 notes");
  const title = `E2E notes ${RUN}`;
  await page.goto("/e-learning");
  await page.getByRole("button", { name: "Create Module" }).click();
  await page.getByPlaceholder("e.g. Kinematics Final Project").fill(title);
  await page.locator("form select").selectOption("PDF");
  await page.locator('form input[type="file"]').setInputFiles({ name: "week5-notes.pdf", mimeType: "application/pdf", buffer: file });
  await page.getByRole("button", { name: "Publish" }).click();
  // Large files over a phone-speed connection can take a while.
  await expectToast(page, "Resource published.", 120_000);
  const item = page.locator("div.rounded-2xl").filter({ hasText: title });
  await openAndVerify(page, () => item.getByTitle("Download").click(), file, /application\/pdf/);
});

test("E-Learning: a video over the plan's 50 MB limit is refused with a clear message", async ({ page }) => {
  const title = `E2E oversized video ${RUN}`;
  const bigFile = join(tmpdir(), `too-big-${RUN}.mp4`);
  writeFileSync(bigFile, randomBytes(55 * 1024 * 1024));
  await page.goto("/e-learning");
  await page.getByRole("button", { name: "Create Module" }).click();
  await page.getByPlaceholder("e.g. Kinematics Final Project").fill(title);
  await page.locator("form select").selectOption("Video");
  await page.locator('form input[type="file"]').setInputFiles(bigFile);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.locator(".fixed.bottom-6 .bg-red-50").last()).toContainText(/over the 50 MB file size limit/i, { timeout: 5_000 });
  await page.keyboard.press("Escape");
  await page.goto("/e-learning");
  await expect(page.getByText(title)).toHaveCount(0);
});

test("Admissions: applicant documents upload and open intact", async ({ page }) => {
  const passport = pdf("Passport scan");
  const name = `E2E Applicant ${RUN}`;
  await page.goto("/admissions");
  await page.getByRole("button", { name: "New Applicant" }).click();
  await page.getByPlaceholder("e.g. Lukas Weber").fill(name);
  await page.getByRole("button", { name: "Submit Application" }).click();
  await expectToast(page, "Application added.");
  await page.getByRole("button", { name, exact: true }).click();
  await page.locator('input[type="file"][multiple]').setInputFiles({ name: "passport.pdf", mimeType: "application/pdf", buffer: passport });
  await expectToast(page, /1 document\(s\) uploaded/, 60_000);
  await openAndVerify(page, () => page.getByRole("button", { name: "passport.pdf" }).click(), passport, /application\/pdf/);
  await page.getByRole("button", { name: "Delete application" }).click();
  await expectToast(page, "Application deleted.");
});

test("Chat: file attachment uploads and opens intact", async ({ page }) => {
  const file = pdf("Chat handout");
  const fname = `handout-${RUN}.pdf`;
  await page.goto("/chat");
  await page.locator('input[type="file"][hidden]').setInputFiles({ name: fname, mimeType: "application/pdf", buffer: file });
  const msg = page.getByRole("button", { name: new RegExp(fname) });
  await expect(msg).toBeVisible();
  const link = await openAndVerify(page, () => msg.click(), file, /application\/pdf/);
  await msg.locator("xpath=ancestor::div[contains(@class,'group')][1]").hover();
  await page.locator("div.group").filter({ hasText: fname }).locator("button").first().click();
  await expect(msg).toHaveCount(0);
  // Deleting the message must delete the stored file too. (Old signed links can stay cached on the CDN for a
  // short while, so check storage itself rather than the link.)
  const storagePath = decodeURIComponent(new URL(link).pathname.split("/object/sign/chat-files/")[1]);
  const [folder, storedName] = [storagePath.slice(0, storagePath.lastIndexOf("/")), storagePath.slice(storagePath.lastIndexOf("/") + 1)];
  const res = await page.request.post(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/list/chat-files`, {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${await ownerToken(page)}` },
    data: { prefix: folder, limit: 1000 },
  });
  const names = ((await res.json()) as { name: string }[]).map((f) => f.name);
  expect(names, "file removed from storage").not.toContain(storedName);
});

test("Library: e-book uploads and the Read button opens it intact", async ({ page }) => {
  const book = pdf("Kinematics Textbook");
  const title = `E2E eBook ${RUN}`;
  await page.goto("/library");
  await page.getByRole("button", { name: "Add Title" }).click();
  await page.locator("form input").first().fill(title);
  await page.locator('form input[type="file"]').setInputFiles({ name: "kinematics.pdf", mimeType: "application/pdf", buffer: book });
  await page.getByRole("button", { name: "Add to Catalog" }).click();
  await expectToast(page, "Title added to the catalog.");
  const row = page.locator("tr").filter({ hasText: title });
  await openAndVerify(page, () => row.getByRole("button", { name: "Read" }).click(), book, /application\/pdf/);
  await row.getByTitle("Remove").click();
  await expectToast(page, "Title removed.");
});

test("cleanup: remove uploaded course materials", async ({ page }) => {
  await page.goto("/e-learning");
  for (const title of [`E2E lecture video ${RUN}`]) {
    await page.locator("div.rounded-2xl").filter({ hasText: title }).locator("button").last().click({ force: true });
    await expectToast(page, "Resource deleted.");
  }
  await page.getByRole("button", { name: "Study Materials" }).click();
  await page.locator("div.rounded-2xl").filter({ hasText: `E2E notes ${RUN}` }).locator("button").last().click();
  await expectToast(page, "Resource deleted.");
});
