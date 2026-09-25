import { expect, type Page } from "@playwright/test";
import { test, hasOwner, owner, login, inviteUser, testUser, RUN, expectToast, watchForErrors, onApp } from "./helpers";

// One full school day, in order: the owner creates staff and a student, the teacher runs a class,
// the student sees the results, and the owner approves an absence note and cleans up.
test.describe.configure({ mode: "serial" });
test.skip(!hasOwner, "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD in .env.local");

const teacher = testUser("teacher");
const student = testUser("student");
const className = `E2E Robotics ${RUN}`;
const notice = `E2E notice ${RUN}`;
const assignment = `E2E worksheet ${RUN}`;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const todayShort = new Date().toLocaleDateString("en-US", { weekday: "short" });

const acceptDialogs = (page: Page) => page.on("dialog", (d) => d.accept());


test("owner creates a teacher and a student account", async ({ page }) => {
  await login(page, owner);
  await inviteUser(page, teacher, "teacher");
  await inviteUser(page, student, "student");
  await page.getByPlaceholder(/Search profiles/).fill(RUN);
  await expect(page.getByText(teacher.name)).toBeVisible();
  await expect(page.getByText(student.name)).toBeVisible();
});

test("teacher creates a class, enrolls the student, takes attendance and grades", async ({ page }) => {
  const errors = watchForErrors(page);
  acceptDialogs(page);
  await login(page, teacher);

  // Class + roster
  await page.goto("/classes");
  await page.getByRole("button", { name: "New Class" }).click();
  await page.getByLabel("Class Name").fill(className);
  await page.getByPlaceholder("MEC-401").fill("E2E-101");
  await page.getByRole("button", { name: WEEKDAYS.includes(todayShort) ? todayShort : "Mon", exact: true }).click();
  await page.getByRole("button", { name: "Save Class" }).click();
  await expectToast(page, "Class created.");
  const card = page.locator("div.rounded-3xl").filter({ hasText: className });
  await card.getByRole("button", { name: "Roster" }).click();
  await page.locator("select[multiple]").selectOption({ label: student.name });
  await page.getByRole("button", { name: "Enroll" }).click();
  await expectToast(page, /1 student\(s\) enrolled/);
  await page.keyboard.press("Escape");

  // Attendance
  await page.goto("/attendance");
  await page.locator("select").first().selectOption({ label: `${className} (E2E-101)` });
  const row = page.locator("div.rounded-2xl").filter({ hasText: student.name });
  await row.getByRole("button", { name: "Absent" }).click();
  await page.getByRole("button", { name: "Save register" }).click();
  await expectToast(page, /Register saved/);

  // Gradebook
  await page.goto("/gradebook");
  await page.getByRole("button", { name: className }).click();
  await page.getByRole("button", { name: "Add Assessment" }).click();
  await page.getByPlaceholder("e.g. Quiz 3").fill("Midterm");
  await page.locator("form").getByRole("spinbutton").nth(0).fill("50");
  await page.locator("form").getByRole("spinbutton").nth(1).fill("2");
  await page.getByRole("button", { name: "Add Assessment" }).last().click();
  await expectToast(page, "Assessment added.");
  const cell = page.getByLabel(`${student.name} Midterm`);
  await cell.fill("41");
  await cell.press("Tab");
  await expect(page.locator("tr").filter({ hasText: student.name }).getByText("82%")).toBeVisible();

  // Notice + assignment
  await page.goto("/announcements");
  await page.getByRole("button", { name: "New Announcement" }).click();
  await page.locator("form input").first().fill(notice);
  await page.locator("form textarea").fill("Robotics lab moves to room B-12 this week.");
  await page.locator("form select").selectOption("students");
  await page.getByText("Pin to top & dashboard").click();
  await page.getByRole("button", { name: "Post" }).click();
  await expectToast(page, "Announcement posted.");

  await page.goto("/e-learning");
  await page.getByRole("button", { name: "Create Module" }).click();
  await page.getByPlaceholder("e.g. Kinematics Final Project").fill(assignment);
  await page.locator("form select").selectOption("Assignment");
  await page.getByRole("button", { name: "Publish" }).click();
  await expectToast(page, "Resource published.");

  expect(errors).toEqual([]);
});

// On Android the student uses the phone app and the teacher a normal browser: a cross-device conversation.
test("teacher and student chat live in a private DM", async ({ browser, page }) => {
  const tCtx = await browser.newContext();
  const sCtx = onApp ? null : await browser.newContext();
  const t = await tCtx.newPage();
  const s = sCtx ? await sCtx.newPage() : page;
  await login(t, teacher);
  await login(s, student);
  await t.goto("/chat");
  await s.goto("/chat");
  await t.getByRole("button", { name: new RegExp(student.name) }).click();
  await s.getByRole("button", { name: new RegExp(teacher.name) }).click();
  const msg = `Hello from the teacher ${RUN}`;
  await t.getByPlaceholder(/Message @/).fill(msg);
  await t.getByPlaceholder(/Message @/).press("Enter");
  // Arrives on the student's screen without a reload (realtime).
  await expect(s.getByText(msg)).toBeVisible({ timeout: 20_000 });
  await tCtx.close();
  await sCtx?.close();
});

test("student sees their class, attendance, grade and notice; admin areas stay locked", async ({ page }) => {
  const errors = watchForErrors(page);
  await login(page, student);
  await expect(page.getByText(notice)).toBeVisible();

  await page.goto("/classes");
  await expect(page.getByText(className)).toBeVisible();

  await page.goto("/attendance");
  await expect(page.getByText("0%")).toBeVisible();

  await page.goto("/gradebook");
  await expect(page.getByText(/82% • B/)).toBeVisible();

  await page.goto("/e-learning");
  await page.getByRole("button", { name: "Assignments" }).click();
  const item = page.locator("div.rounded-2xl").filter({ hasText: assignment });
  await item.getByRole("button", { name: "Submit Work" }).click();
  await page.locator('form input[type="file"]').setInputFiles({ name: "homework.txt", mimeType: "text/plain", buffer: Buffer.from("my answers") });
  await page.getByRole("button", { name: "Hand In" }).click();
  await expectToast(page, "Work submitted.");
  await expect(item.getByText(/Submitted/)).toBeVisible();

  await page.goto("/leave");
  await page.getByRole("button", { name: "Submit Absence Note" }).click();
  await page.locator("form textarea").fill(`Doctor appointment ${RUN}`);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expectToast(page, /submitted for approval/);

  for (const path of ["/admin", "/admissions", "/tasks"]) {
    await page.goto(path);
    await expect(page.getByText("Access Restricted")).toBeVisible();
  }
  await page.goto("/finance");
  await expect(page.getByRole("heading", { name: "My Invoices" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("owner approves the absence note and cleans up test data", async ({ page }) => {
  acceptDialogs(page);
  await login(page, owner);

  await page.goto("/leave");
  const req = page.locator("tr").filter({ hasText: student.name });
  await req.getByRole("button", { name: "Approve" }).click();
  await expectToast(page, "Request approved.");

  await page.goto("/announcements");
  await page.locator("article").filter({ hasText: notice }).getByTitle("Delete").click();
  await expectToast(page, "Announcement deleted.");

  await page.goto("/e-learning");
  await page.getByRole("button", { name: "Assignments" }).click();
  await page.locator("div.rounded-2xl").filter({ hasText: assignment }).locator("button").last().click();
  await expectToast(page, "Resource deleted.");

  await page.goto("/classes");
  await page.locator("div.rounded-3xl").filter({ hasText: className }).getByTitle("Delete").click();
  await expectToast(page, "Class deleted.");

  await page.goto("/admin");
  for (const u of [teacher, student]) {
    await page.locator("tr").filter({ hasText: u.name }).getByRole("button", { name: /Revoke Access/ }).click();
    await expectToast(page, "Access revoked.");
  }
});

test("revoked account can no longer use the app", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("Email Address").fill(student.email);
  await page.getByPlaceholder("Password").fill(student.password);
  await page.getByRole("button", { name: /Connect to Database/ }).click();
  await expect(page.getByText(/deactivated/i)).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});
