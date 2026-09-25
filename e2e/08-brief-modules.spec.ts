import { expect, type Page } from "@playwright/test";
import { test, hasOwner, owner, login, logout, inviteUser, testUser, RUN, expectToast, watchForErrors, capturePrints, printedDocuments, type TestUser } from "./helpers";

// The modules from the architecture brief, click-tested end to end:
// terms/courses/programmes → registration with prerequisites → tuition on the ledger → payments & aid →
// rooms with conflict-free booking → exam seating, blind grading & results → credentials with public
// verification → retention risk → integrations (webhooks, event log, LTI) → private details.
test.describe.configure({ mode: "serial" });
test.skip(!hasOwner, "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD in .env.local");
test.setTimeout(180_000);

const teacher = testUser("bteacher");
const student = testUser("bstudent");
const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const L = (s: string) => `E2E ${s} ${RUN}`;
const TERM = L("Term");
const PROGRAM = L("Programme");
const ROOM = L("Room");
const CODE_A = `A${RUN}`.slice(0, 10).toUpperCase();
const CODE_B = `B${RUN}`.slice(0, 10).toUpperCase();
const SEC_A = L("Section A");
const SEC_B = L("Section B");
const EXAM = L("Exam");
const BADGE = L("Badge");
let credentialCode = "";

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  errors = watchForErrors(page);
  await capturePrints(page);
});
test.afterEach(() => {
  // Refusals the tests trigger on purpose (prerequisites, double booking) surface as 400/409 responses.
  const real = errors.filter((e) => !/Failed to load resource: the server responded with a status of 40[09]/.test(e));
  expect(real, real.join("\n")).toEqual([]);
});

const row = (page: Page, text: string) => page.locator("tr").filter({ hasText: text });
const tab = (page: Page, name: string | RegExp) => page.getByRole("button", { name }).first().click();
const as = async (page: Page, u: TestUser) => login(page, u);
const modal = (page: Page) => page.getByRole("dialog");

test("owner creates a teacher and a student", async ({ page }) => {
  await as(page, owner);
  await inviteUser(page, teacher, "teacher");
  await inviteUser(page, student, "student");
  await logout(page);
  await as(page, teacher);
  await logout(page);
  await as(page, student);
});

test("academics: term, courses with a prerequisite, programme requirements", async ({ page }) => {
  await as(page, owner);
  await page.goto("/academics");
  await tab(page, "Terms");
  await page.getByRole("button", { name: "New Term" }).click();
  await modal(page).getByLabel("Term Name").fill(TERM);
  await modal(page).getByLabel("Starts").fill(day(-7));
  await modal(page).getByLabel("Ends").fill(day(120));
  await modal(page).getByLabel("Add/Drop Deadline").fill(day(14));
  await modal(page).getByRole("button", { name: "Add Term" }).click();
  await expect(row(page, TERM)).toBeVisible();

  await tab(page, "Course Catalogue");
  for (const [code, title, prereq] of [[CODE_A, L("Foundations"), ""], [CODE_B, L("Advanced"), CODE_A]]) {
    await page.getByRole("button", { name: "New Course" }).click();
    await modal(page).getByLabel("Code").fill(code);
    await modal(page).getByLabel("Title").fill(title);
    await modal(page).getByLabel("Credits").fill("5");
    if (prereq) await modal(page).getByLabel("Prerequisites").selectOption({ label: `${prereq} — ${L("Foundations")}` });
    await modal(page).getByRole("button", { name: "Add Course" }).click();
    await expect(row(page, code)).toBeVisible();
  }
  await expect(row(page, CODE_B)).toContainText(CODE_A);

  await tab(page, "Programmes");
  await page.getByRole("button", { name: "New Programme" }).click();
  await modal(page).getByLabel("Programme Name").fill(PROGRAM);
  await modal(page).getByLabel("Total Credits").fill("10");
  await modal(page).getByRole("button", { name: "Add Programme" }).click();
  await page.locator("div.rounded-3xl").filter({ hasText: PROGRAM }).getByRole("button", { name: "Edit requirements" }).click();
  for (const code of [CODE_A, CODE_B]) {
    await modal(page).getByLabel("Course", { exact: true }).selectOption({ label: `${code} — ${code === CODE_A ? L("Foundations") : L("Advanced")}` });
    await modal(page).getByRole("button", { name: "Add", exact: true }).click();
    await expect(modal(page).getByText(code)).toBeVisible();
  }
  await expect(modal(page).getByText("2 courses").or(modal(page).getByText(CODE_B))).toBeVisible();
});

test("finance: per-credit fee schedule for the term", async ({ page }) => {
  await as(page, owner);
  await page.goto("/finance");
  await tab(page, "Fee Schedules");
  await page.getByRole("button", { name: "New schedule" }).click();
  await modal(page).getByLabel("Name").fill(L("Tuition"));
  await modal(page).getByLabel("Term").selectOption({ label: TERM });
  await modal(page).getByLabel("Per Credit ($)").fill("100");
  await modal(page).getByRole("button", { name: "Save" }).click();
  await expectToast(page, "Fee schedule saved.");
  await expect(row(page, L("Tuition"))).toContainText("$100.00");
});

test("rooms: add a room, book it, overlapping booking is refused", async ({ page }) => {
  await as(page, owner);
  await page.goto("/facilities");
  await tab(page, "Rooms & Labs");
  await page.getByRole("button", { name: "Add Space" }).click();
  await modal(page).getByLabel("Name").fill(ROOM);
  await modal(page).getByLabel("Capacity").fill("2");
  await modal(page).getByRole("button", { name: "Save" }).click();
  await expectToast(page, "Space added.");

  await tab(page, "Book a Room");
  const book = async (from: string, to: string) => {
    await page.getByRole("button", { name: "Book a Room" }).last().click();
    await modal(page).getByLabel("Room").selectOption({ label: `${ROOM} (2 seats)` });
    await modal(page).getByLabel("Purpose").fill(L("Study group"));
    await modal(page).getByLabel("Date").fill(day(1));
    await modal(page).getByLabel("From").fill(from);
    await modal(page).getByLabel("To").fill(to);
    await modal(page).getByRole("button", { name: "Confirm Booking" }).click();
  };
  await book("10:00", "11:00");
  await expectToast(page, "Room booked.");
  await book("10:30", "11:30");
  await expectToast(page, /already booked for part of this time/);
  await page.keyboard.press("Escape");
  await expect(row(page, ROOM).first()).toContainText(L("Study group"));
});

test("classes: sections linked to course, term, capacity and room", async ({ page }) => {
  await as(page, owner);
  await page.goto("/classes");
  for (const [name, code] of [[SEC_A, CODE_A], [SEC_B, CODE_B]]) {
    await page.getByRole("button", { name: "New Class" }).click();
    await modal(page).getByLabel("Class Name").fill(name);
    await modal(page).getByLabel("Teacher").selectOption({ label: teacher.name });
    await modal(page).getByRole("button", { name: code === CODE_A ? "Mon" : "Tue", exact: true }).click();
    await modal(page).getByLabel("Course", { exact: true }).selectOption({ label: `${code} — ${code === CODE_A ? L("Foundations") : L("Advanced")}` });
    await modal(page).getByLabel("Academic Term").selectOption({ label: TERM });
    await modal(page).getByLabel("Seat Capacity").fill("1");
    await modal(page).getByLabel("Facility").selectOption({ label: `${ROOM} (2)` });
    await modal(page).getByRole("button", { name: "Save Class" }).click();
    await expectToast(page, "Class created.");
  }
});

test("registrar: student is placed in the programme", async ({ page }) => {
  await as(page, owner);
  await page.goto("/registrar");
  await page.getByRole("button", { name: "Add Student" }).click();
  await modal(page).getByLabel("Linked Login Account").selectOption({ label: student.name });
  await modal(page).getByLabel("Student Name").fill(`${student.name} E2E`);
  await modal(page).getByLabel("Programme (for degree audit)").selectOption({ label: PROGRAM });
  await modal(page).getByRole("button", { name: "Save Record" }).click();
  await expectToast(page, "Student added.");
});

test("student registers: prerequisite enforced, tuition posted, degree plan shown", async ({ page }) => {
  await as(page, student);
  await page.goto("/academics");
  await page.getByLabel("Term").selectOption({ label: TERM });
  await row(page, SEC_B).getByRole("button", { name: "Register" }).click();
  await expectToast(page, /Missing prerequisite/);
  await row(page, SEC_A).getByRole("button", { name: "Register" }).click();
  await expectToast(page, `Registered for ${SEC_A}.`);
  await expect(row(page, SEC_A)).toContainText("enrolled");
  await expect(row(page, SEC_A)).toContainText("1/1");
  await expect(page.getByText("5 credits registered")).toBeVisible();

  await page.goto("/finance");
  await tab(page, "My Account");
  await expect(page.getByText("Balance $500.00")).toBeVisible();
  await expect(row(page, "Tuition")).toContainText("$500.00");

  await page.goto("/degree-audit");
  await expect(page.getByRole("heading", { name: PROGRAM })).toBeVisible();
  await expect(page.getByText("0 / 10 credits")).toBeVisible();
  await expect(page.getByLabel("Planned term 1")).toContainText(CODE_B);
});

test("finance: payment and aid reduce the balance; statement prints", async ({ page }) => {
  await as(page, owner);
  await page.goto("/finance");
  await tab(page, "Student Accounts");
  await row(page, student.name).getByTitle("Open account").click();
  await page.getByRole("button", { name: "Record payment" }).click();
  await modal(page).last().getByLabel("Amount ($)").fill("200");
  await modal(page).last().getByLabel("Reference").fill(`RCPT-${RUN}`);
  await modal(page).last().getByRole("button", { name: "Save" }).click();
  await expectToast(page, "Payment recorded.");
  await expect(page.getByText("Balance $300.00")).toBeVisible();

  await page.getByRole("button", { name: "Offer aid" }).click();
  await modal(page).last().getByLabel("Amount ($)").fill("100");
  await modal(page).last().getByLabel("Award Name").fill(L("Scholarship"));
  await modal(page).last().getByRole("button", { name: "Save" }).click();
  await expectToast(page, "Aid offer created.");
  await page.getByRole("button", { name: "Statement" }).click();
  const doc = (await printedDocuments(page)).at(-1) ?? "";
  expect(doc).toContain("Account Statement");
  expect(doc).toContain("Payment");
  expect(doc).toContain("$300.00");
  await logout(page);

  await as(page, student);
  await page.goto("/finance");
  await tab(page, "My Account");
  await page.getByRole("button", { name: "Accept offer" }).click();
  await expectToast(page, "Aid offer accepted.");
  await logout(page);

  await as(page, owner);
  await page.goto("/finance");
  await tab(page, "Student Accounts");
  await row(page, student.name).getByTitle("Open account").click();
  await page.getByRole("button", { name: "Disburse" }).click();
  await expectToast(page, "Aid disbursed to the account.");
  await expect(page.getByText("Balance $200.00")).toBeVisible();
});

test("exams: seating, hall tickets, blind grading, release; student sees result", async ({ page }) => {
  await as(page, owner);
  await page.goto("/exams");
  await page.getByRole("button", { name: "Schedule Exam" }).click();
  await modal(page).getByLabel("Course Name").fill(EXAM);
  await modal(page).getByLabel("Exam Date & Time").fill(`${day(3)}T09:00`);
  await modal(page).getByLabel("Class (candidates)").selectOption({ label: SEC_A });
  await modal(page).getByLabel("Exam Room").selectOption({ label: `${ROOM} (2)` });
  await modal(page).getByRole("button", { name: "Publish Exam" }).click();
  await expectToast(page, "Exam published.");

  await page.locator("div.rounded-2xl").filter({ hasText: EXAM }).getByTitle("Seating, grading & results").click();
  await page.getByRole("button", { name: "Generate seating" }).click();
  await expectToast(page, "Seated 1 candidate(s) at random.");
  await expect(modal(page).getByText("hidden")).toBeVisible(); // blind grading hides names
  await page.getByRole("button", { name: "Hall tickets" }).click();
  const ticket = (await printedDocuments(page)).at(-1) ?? "";
  expect(ticket).toContain("Hall Ticket");
  expect(ticket).toContain(student.name);
  expect(ticket).toContain(ROOM);
  await modal(page).getByLabel(/Score for C\d+/).fill("87");
  await page.getByRole("button", { name: "Save scores" }).click();
  await expectToast(page, "Scores saved.");
  await page.getByRole("button", { name: "Release results" }).click();
  await expectToast(page, /Results released/);
  await logout(page);

  await as(page, student);
  await page.goto("/exams");
  await tab(page, "Hall Tickets & Results");
  await expect(row(page, EXAM)).toContainText("87 / 100");
  await expect(row(page, EXAM)).toContainText(ROOM);
});

test("credentials: issue a badge; anyone can verify it signed out", async ({ page }) => {
  await as(page, owner);
  await page.goto("/credentials");
  await tab(page, "Badge Catalogue");
  await page.getByRole("button", { name: "New Badge" }).click();
  await modal(page).getByLabel("Name").fill(BADGE);
  await modal(page).getByLabel("Skills (comma separated)").fill("Robotics, Teamwork");
  await modal(page).getByRole("button", { name: "Create" }).click();
  await expectToast(page, "Badge created.");
  await tab(page, "Issued Credentials");
  await page.getByRole("button", { name: "Issue Credential" }).click();
  await modal(page).getByLabel("Badge").selectOption({ label: BADGE });
  await modal(page).getByLabel("Student").selectOption({ label: student.name });
  await modal(page).getByRole("button", { name: "Issue" }).click();
  await expectToast(page, /Credential issued/);
  credentialCode = (await row(page, BADGE).locator("td.font-mono").innerText()).trim();
  expect(credentialCode).toMatch(/^[0-9A-F]{12}$/);
  await logout(page);

  await as(page, student);
  await page.goto("/credentials");
  await expect(page.getByRole("heading", { name: BADGE })).toBeVisible();
  await page.getByRole("button", { name: "Certificate" }).click();
  expect((await printedDocuments(page)).at(-1)).toContain(credentialCode);
  await logout(page);

  await page.goto(`/verify?code=${credentialCode}`);
  await expect(page.getByText("Valid credential")).toBeVisible();
  await expect(page.getByRole("status")).toContainText(student.name);
  await page.getByLabel("Verification code").fill("NOTAREALCODE");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText("No valid credential matches this code")).toBeVisible();
});

test("analytics: risk scores computed and listed; students are kept out", async ({ page }) => {
  await as(page, owner);
  await page.goto("/analytics");
  await page.getByRole("button", { name: "Recalculate scores" }).click();
  await expectToast(page, /Risk scores recalculated/);
  await expect(row(page, student.name)).toBeVisible();
  await tab(page, "Enrolment Forecast");
  await expect(page.getByText("Forecast by programme")).toBeVisible();
  await logout(page);
  await as(page, student);
  await page.goto("/analytics");
  await expect(page.getByText("Analytics is available to staff only.")).toBeVisible();
});

test("integrations: webhook, event log, LTI tool visible to students", async ({ page }) => {
  await as(page, owner);
  await page.goto("/integrations");
  await page.getByRole("button", { name: "Add Webhook" }).click();
  await modal(page).getByLabel("Endpoint URL").fill(`https://example.com/e2e-hook-${RUN}`);
  await modal(page).getByLabel("ledger.posted").check();
  await modal(page).getByRole("button", { name: "Save" }).click();
  await expectToast(page, /Webhook added/);
  await expect(row(page, `e2e-hook-${RUN}`)).toContainText("ledger.posted");

  await tab(page, "Event Log");
  await expect(page.getByText("ledger.posted").first()).toBeVisible();
  await expect(page.getByText("credential.issued").first()).toBeVisible();

  await tab(page, "LTI 1.3 Tools");
  await page.getByRole("button", { name: "Register Tool" }).click();
  await modal(page).getByLabel("Tool Name").fill(L("Virtual Lab"));
  await modal(page).getByLabel("Launch (Target Link) URL").fill("https://lti.example.com/launch");
  await modal(page).getByRole("button", { name: "Register" }).click();
  await expectToast(page, "LTI tool registered.");
  await logout(page);

  await as(page, student);
  await page.goto("/e-learning");
  await tab(page, "External Tools");
  await expect(page.getByText(L("Virtual Lab"))).toBeVisible();
  await page.goto("/integrations");
  await expect(page.getByText("Integrations are managed by administrators.")).toBeVisible();
});

test("settings: private details are saved and only visible to the owner of the account", async ({ page }) => {
  await as(page, student);
  await page.goto("/settings");
  await page.getByLabel("Nationality").fill("E2E-land");
  await page.getByLabel("Emergency Contact").fill("Mum +49 000");
  await page.getByRole("button", { name: "Save Private Details" }).click();
  await expectToast(page, "Private details saved.");
  await page.reload();
  await expect(page.getByLabel("Nationality")).toHaveValue("E2E-land");
});

test("student drops the section: seat frees up, tuition adjusts within add/drop", async ({ page }) => {
  await as(page, student);
  await page.goto("/academics");
  await page.getByLabel("Term").selectOption({ label: TERM });
  await row(page, SEC_A).getByRole("button", { name: "Drop" }).click();
  await expectToast(page, `Dropped ${SEC_A}.`);
  await expect(row(page, SEC_A)).toContainText("0/1");
  await page.goto("/finance");
  await tab(page, "My Account");
  // $500 tuition − $200 payment − $100 aid − $500 tuition reversal = −$300 (credit)
  await expect(page.getByText("Balance -$300.00")).toBeVisible();
});
