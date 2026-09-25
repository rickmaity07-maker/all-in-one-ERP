import { expect, type Page } from "@playwright/test";
import { test, hasOwner, owner, login, logout, inviteUser, testUser, RUN, expectToast, watchForErrors, capturePrints, printedDocuments, type TestUser } from "./helpers";

// Click-tests every module end to end, from the staff side and the student/parent side.
test.describe.configure({ mode: "serial" });
test.skip(!hasOwner, "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD in .env.local");
test.setTimeout(180_000);

const teacher = testUser("mteacher");
const student = testUser("mstudent");
const parent = testUser("mparent");
const applicant = testUser("applicant");
const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const today = day(0);
const yesterday = day(-1);
const inAWeek = day(7);
const tag = (s: string) => `${s} ${RUN}`;

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  errors = watchForErrors(page);
  await capturePrints(page);
});
test.afterEach(() => {
  // Some tests deliberately trigger refusals (double bookings); the browser logs those 400s.
  const real = errors.filter((e) => !/Failed to load resource: the server responded with a status of 40[09]/.test(e));
  expect(real, real.join("\n")).toEqual([]);
});

const row = (page: Page, text: string) => page.locator("tr").filter({ hasText: text });
const card = (page: Page, text: string) => page.locator("div.rounded-3xl").filter({ hasText: text });
const tab = (page: Page, name: string | RegExp) => page.getByRole("button", { name }).first().click();
const as = async (page: Page, u: TestUser) => login(page, u);

// ---------------------------------------------------------------- accounts
test("owner creates teacher, student and parent accounts", async ({ page }) => {
  await as(page, owner);
  await inviteUser(page, teacher, "teacher");
  await inviteUser(page, student, "student");
  await inviteUser(page, parent, "parent");
  // First sign-in forces a new password.
  await logout(page);
  await as(page, student);
  expect(student.password.endsWith("9")).toBe(true);
});

test("request access → waits for approval → admin approves → can sign in", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Request access/ }).click();
  await page.getByPlaceholder("Full Name").fill(applicant.name);
  await page.getByPlaceholder("Email Address").fill(applicant.email);
  await page.getByPlaceholder("Password").fill(applicant.password);
  await page.getByRole("button", { name: "Request Access", exact: true }).click();
  await expect(page.getByText(/administrator must approve/i)).toBeVisible();

  await page.getByPlaceholder("Email Address").fill(applicant.email);
  await page.getByPlaceholder("Password").fill(applicant.password);
  await page.getByRole("button", { name: /Connect to Database/ }).click();
  await expect(page.getByText(/waiting for an administrator/i)).toBeVisible();

  await as(page, owner);
  await page.goto("/admin");
  await tab(page, /Approvals \(\d+\)/);
  await row(page, applicant.name).getByLabel(/Approve .* as/).selectOption("student");
  await row(page, applicant.name).getByRole("button", { name: "Approve" }).click();
  await expectToast(page, `${applicant.name} approved.`);
  await logout(page);
  await as(page, applicant);
});

test("forgot password → admin sets a temporary one → user must choose a new one", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Forgot password/ }).click();
  await page.getByPlaceholder("Email Address").fill(applicant.email);
  await page.getByRole("button", { name: "Send Reset Request" }).click();
  await expect(page.getByText(/administrator will set a temporary password/i)).toBeVisible();

  await as(page, owner);
  await page.goto("/admin");
  await tab(page, /Password Resets \(\d+\)/);
  await row(page, applicant.email).getByRole("button", { name: /Set temporary password/ }).click();
  const temp = await page.getByLabel("Temporary Password").inputValue();
  expect(temp.length).toBeGreaterThanOrEqual(8);
  await page.getByRole("button", { name: "Set Temporary Password", exact: true }).click();
  await expectToast(page, /Temporary password set/);
  await logout(page);

  applicant.password = temp;
  await as(page, applicant); // forced change happens inside login()
  expect(applicant.password).toBe(`${temp}9`);
});

test("admin: role change, revoke/restore, CSV export, audit log", async ({ page }) => {
  await as(page, owner);
  await page.goto("/admin");
  await page.getByPlaceholder(/Search profiles/).fill(applicant.name);
  await page.getByLabel(`Role for ${applicant.name}`).selectOption("teacher");
  await expectToast(page, `${applicant.name} is now teacher.`);
  await row(page, applicant.name).getByRole("button", { name: /Revoke Access/ }).click();
  await expectToast(page, "Access revoked.");
  await row(page, applicant.name).getByRole("button", { name: /Restore Access/ }).click();
  await expectToast(page, "Access restored.");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export CSV" }).click()]);
  const csv = await (await dl.createReadStream()).toArray().then((c) => Buffer.concat(c).toString());
  expect(csv).toContain(applicant.email);
  await tab(page, "Security Logs");
  await expect(page.getByText("profiles").first()).toBeVisible();
});

// ---------------------------------------------------------------- finance
test("finance: invoice, overdue, mark paid, print, CSV, expenses, cash flow", async ({ page }) => {
  await as(page, owner);
  await page.goto("/finance");
  await tab(page, "Student Tuition Invoices");
  for (const [desc, due] of [[tag("E2E tuition"), yesterday], [tag("E2E lab fee"), inAWeek]]) {
    await page.getByRole("button", { name: "Generate Invoice" }).click();
    await page.getByLabel("Student Account").selectOption({ label: student.name });
    await page.getByLabel("Description").fill(desc);
    await page.getByLabel("Amount ($)").fill(desc.includes("tuition") ? "1200" : "80");
    await page.getByLabel("Due Date").fill(due);
    await page.getByRole("button", { name: "Issue Invoice" }).click();
    await expectToast(page, "Invoice issued.");
  }
  await page.locator("select").filter({ hasText: "Overdue" }).selectOption("Overdue");
  await expect(row(page, tag("E2E tuition")).getByText("Overdue")).toBeVisible();
  await expect(row(page, tag("E2E lab fee"))).toHaveCount(0);
  await page.locator("select").filter({ hasText: "Overdue" }).selectOption("All");
  await row(page, tag("E2E tuition")).getByTitle("Print / Save as PDF").click();
  const printed = await printedDocuments(page);
  expect(printed.at(-1)).toContain(student.name);
  expect(printed.at(-1)).toContain("$1,200.00");
  await row(page, tag("E2E tuition")).getByRole("button", { name: "Mark Paid" }).click();
  await expectToast(page, "Marked as paid.");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export CSV" }).click()]);
  expect(dl.suggestedFilename()).toBe("invoices.csv");

  await tab(page, "Expenses & Payroll");
  await page.getByRole("button", { name: "Record Expense" }).click();
  await page.getByLabel("Description").fill(tag("E2E payroll"));
  await page.getByLabel("Amount ($)").fill("300");
  await page.getByRole("button", { name: "Save Expense" }).click();
  await expectToast(page, "Expense recorded.");
  await tab(page, "Overview & Cash Flow");
  await expect(page.getByText(/Collected Revenue/)).toBeVisible();

  // Student sees only their own invoices
  await logout(page);
  await as(page, student);
  await page.goto("/finance");
  await expect(page.getByRole("heading", { name: "My Invoices" })).toBeVisible();
  await expect(row(page, tag("E2E lab fee"))).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark Paid" })).toHaveCount(0);
});

// ---------------------------------------------------------------- registrar
test("registrar: record, courses, transcript, probation, counseling; student audit & mail request", async ({ page }) => {
  await as(page, owner);
  await page.goto("/registrar");
  await page.getByRole("button", { name: "Add Student" }).click();
  await page.getByLabel("Linked Login Account").selectOption({ label: student.name });
  await page.getByLabel("Student Name").fill(student.name);
  await page.getByLabel("Student Number").fill(`S-${RUN}`);
  await page.getByLabel("Current GPA").fill("1.8");
  await page.getByLabel("Credits Earned").fill("60");
  await page.getByRole("button", { name: "Save Record" }).click();
  await expectToast(page, "Student added.");
  await row(page, student.name).getByTitle("Courses & grades").click();
  await page.getByPlaceholder("Code").fill("MEC-101");
  await page.getByPlaceholder("Course name").fill("Statics");
  await page.getByPlaceholder("Term").fill("Fall");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("MEC-101 Statics")).toBeVisible();
  await page.getByPlaceholder("Grade").first().fill("B+");
  await page.getByPlaceholder("Grade").first().press("Tab");
  await page.keyboard.press("Escape");
  await row(page, student.name).getByTitle("Print transcript").click();
  expect((await printedDocuments(page)).at(-1)).toContain("Statics");
  await row(page, student.name).locator("select").selectOption("Probation");
  await tab(page, "Academic Probation");
  await row(page, student.name).getByRole("button", { name: "Schedule Counseling" }).click();
  await page.getByLabel("Session Date").fill(inAWeek);
  await page.getByRole("button", { name: "Add to Calendar" }).click();
  await expectToast(page, "Counseling session added to the Master Calendar.");
  await row(page, student.name).getByRole("button", { name: "Lift Probation" }).click();
  await expectToast(page, "Probation lifted.");

  await logout(page);
  await as(page, student);
  await page.goto("/registrar");
  await expect(page.getByRole("heading", { name: student.name })).toBeVisible();
  await expect(page.getByText("Statics")).toBeVisible();
  await tab(page, "Request Official Transcript");
  await page.getByRole("button", { name: "Generate PDF" }).click();
  expect((await printedDocuments(page)).at(-1)).toContain(student.name);
  await page.getByRole("button", { name: "Request Mail Delivery" }).click();
  await page.getByLabel("Recipient & Postal Address").fill("ACME GmbH\nMain St 1\nBerlin");
  await page.getByRole("button", { name: "Submit Request" }).click();
  await expectToast(page, "Request sent to the Registrar.");

  await logout(page);
  await as(page, owner);
  await page.goto("/registrar");
  await tab(page, /Transcript Requests/);
  await row(page, student.name).getByRole("button", { name: "Mark Sent" }).click();
  await expectToast(page, "Marked as sent.");
});

// ---------------------------------------------------------------- housing
test("housing: rooms, check-in, meal plan top-up; student sees room and files a ticket; staff resolves", async ({ page }) => {
  const building = tag("E2E Block");
  await as(page, owner);
  await page.goto("/housing");
  await page.getByRole("button", { name: "Add Room" }).click();
  await page.getByLabel("Building").fill(building);
  await page.getByLabel("Room Number").fill("101");
  await page.getByLabel("Beds").fill("2");
  await page.getByRole("button", { name: "Save Room" }).click();
  await expectToast(page, "Room added.");
  await page.getByRole("button", { name: "Assign Resident" }).click();
  const roomSelect = page.getByLabel("Room", { exact: true });
  const roomValue = await roomSelect.locator("option", { hasText: building }).getAttribute("value");
  await roomSelect.selectOption(roomValue!);
  await page.getByLabel("Resident Account").selectOption({ label: student.name });
  await page.getByLabel("Term").fill("Fall 2026");
  await page.getByRole("button", { name: "Check In" }).click();
  await expectToast(page, "Resident checked in.");
  await tab(page, "Meal Plans");
  await page.getByRole("button", { name: "Open Account" }).first().click();
  await page.getByLabel("Account Holder").selectOption({ label: student.name });
  await page.getByLabel("Opening Balance ($)").fill("20");
  await page.locator("form").getByRole("button", { name: "Open Account" }).click();
  await expectToast(page, "Meal account opened.");
  await row(page, student.name).getByRole("button", { name: "Top Up" }).click();
  await page.getByLabel("Amount ($)").fill("30");
  await page.getByRole("button", { name: "Apply" }).click();
  await expectToast(page, "Balance updated.");
  await expect(row(page, student.name).getByText("$50.00")).toBeVisible();

  await logout(page);
  await as(page, student);
  await page.goto("/housing");
  await expect(page.getByText(`${building}, Room 101`)).toBeVisible();
  await tab(page, "Meal Plans");
  await expect(page.getByText("$50.00")).toBeVisible();
  await page.getByRole("button", { name: "New Ticket" }).click();
  await page.getByLabel("Issue Title").fill(tag("E2E leaking tap"));
  await page.getByLabel("Location").fill(`${building} 101`);
  await page.getByRole("button", { name: "Submit Ticket" }).click();
  await expectToast(page, "Ticket submitted.");

  await logout(page);
  await as(page, owner);
  await page.goto("/housing");
  await tab(page, /Maintenance/);
  await page.locator("div.rounded-2xl").filter({ hasText: tag("E2E leaking tap") }).getByTitle("Mark Resolved").click();
  await expectToast(page, "Ticket resolved.");
});

// ---------------------------------------------------------------- exams
test("exams: schedule, status, integrity flag review; student sees schedule only", async ({ page }) => {
  const course = tag("E2E Thermodynamics");
  await as(page, owner);
  await page.goto("/exams");
  await page.getByRole("button", { name: "Schedule Exam" }).click();
  await page.getByLabel("Course Name").fill(course);
  await page.getByLabel("Exam Date & Time").fill(`${inAWeek}T09:00`);
  await page.getByLabel("Location").fill("Hall B");
  await page.getByRole("button", { name: "Publish Exam" }).click();
  await expectToast(page, "Exam published.");
  await page.locator("div.rounded-2xl").filter({ hasText: course }).locator("select").selectOption("In Progress");
  await tab(page, "Plagiarism & Integrity Alerts");
  await page.getByRole("button", { name: "Log Flag" }).click();
  await page.getByLabel("Student", { exact: true }).fill(student.name);
  await page.getByLabel("Assessment / Course").fill(course);
  await page.getByLabel("Similarity %").fill("72");
  await page.getByRole("button", { name: "Save Flag" }).click();
  await expectToast(page, "Flag logged.");
  await row(page, course).getByRole("button", { name: "Review" }).click();
  await page.getByLabel("Investigation Notes").fill("Cited properly on review.");
  await page.getByRole("button", { name: "Cleared" }).click();
  await expectToast(page, "Flag marked cleared.");

  await logout(page);
  await as(page, student);
  await page.goto("/exams");
  await expect(page.getByText(course)).toBeVisible();
  await expect(page.getByRole("button", { name: /Plagiarism/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Schedule Exam" })).toHaveCount(0);
});

// ---------------------------------------------------------------- makerspace
test("makerspace: equipment, booking, clash refused, cancel", async ({ page }) => {
  const machine = tag("E2E Laser Cutter");
  await as(page, owner);
  await page.goto("/makerspace");
  await page.getByRole("button", { name: "Add Equipment" }).click();
  await page.getByLabel("Name").fill(machine);
  await page.getByLabel("Lab / Room").fill("Lab 2");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast(page, "Equipment added.");

  await logout(page);
  await as(page, student);
  await page.goto("/makerspace");
  const book = async () => {
    await card(page, machine).getByRole("button", { name: "Book" }).click();
    await page.getByLabel("Date").fill(inAWeek);
    await page.getByLabel("From").fill("10:00");
    await page.getByLabel("Until").fill("11:00");
    await page.getByLabel("Purpose").fill("Cutting parts");
    await page.getByRole("button", { name: "Confirm Booking" }).click();
  };
  await book();
  await expectToast(page, "Booking confirmed.");
  await book();
  await expect(page.locator(".fixed.bottom-6 .bg-red-50").last()).toContainText("Already booked");
  await page.keyboard.press("Escape");
  await tab(page, /My Bookings/);
  await row(page, machine).getByTitle("Cancel booking").click();
  await expectToast(page, "Booking cancelled.");
});

// ---------------------------------------------------------------- careers
test("careers: post, apply, stage change, portfolio", async ({ page }) => {
  const role = tag("E2E Robotics Intern");
  await as(page, owner);
  await page.goto("/careers");
  await page.getByRole("button", { name: "Post Opportunity" }).click();
  await page.getByLabel("Role Title").fill(role);
  await page.getByLabel("Company").fill("ACME Robotics");
  await page.getByLabel("Deadline").fill(inAWeek);
  await page.getByRole("button", { name: "Publish" }).click();
  await expectToast(page, "Opportunity posted.");

  await logout(page);
  await as(page, student);
  await page.goto("/careers");
  await card(page, role).getByRole("button", { name: "Apply" }).click();
  await expectToast(page, "Application sent.");
  await tab(page, "Portfolio Showcase");
  await page.getByRole("button", { name: "Add Project" }).first().click();
  await page.getByLabel("Project Title").fill(tag("E2E SCARA arm"));
  await page.getByLabel("Link (GitHub, video, website)").fill("github.com/example/scara");
  await page.locator("form").getByRole("button", { name: "Add Project" }).click();
  await expectToast(page, "Project added to your portfolio.");

  await logout(page);
  await as(page, owner);
  await page.goto("/careers");
  await tab(page, "All Applications");
  await row(page, student.name).locator("select").selectOption("Interview");
  await expectToast(page, "Stage updated.");

  await logout(page);
  await as(page, student);
  await page.goto("/careers");
  await tab(page, "My Applications");
  await expect(row(page, role).getByText("Interview")).toBeVisible();
});

// ---------------------------------------------------------------- library
test("library: add title, borrow, no copies left, check in", async ({ page }) => {
  const title = tag("E2E Control Systems");
  await as(page, owner);
  await page.goto("/library");
  await page.getByRole("button", { name: "Add Title" }).click();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Author").fill("Ogata");
  await page.getByLabel("Physical Copies").fill("1");
  await page.getByRole("button", { name: "Add to Catalog" }).click();
  await expectToast(page, "Title added to the catalog.");

  await logout(page);
  await as(page, student);
  await page.goto("/library");
  await row(page, title).getByRole("button", { name: "Borrow" }).click();
  await expectToast(page, /Borrowed — due/);
  await expect(row(page, title).getByText("0/1 copies")).toBeVisible();
  await expect(row(page, title).getByRole("button", { name: "Borrow" })).toBeDisabled();
  await tab(page, /My Loans \(1\)/);
  await expect(row(page, title)).toBeVisible();

  await logout(page);
  await as(page, owner);
  await page.goto("/library");
  await tab(page, /Active Loans/);
  await row(page, title).getByRole("button", { name: "Check In" }).click();
  await expectToast(page, "Returned.");
});

// ---------------------------------------------------------------- student life
test("student life: event RSVP with capacity, club join/leave", async ({ page }) => {
  const event = tag("E2E Hackathon");
  const club = tag("E2E Chess Club");
  await as(page, owner);
  await page.goto("/campus-life");
  await page.getByRole("button", { name: "New Event" }).click();
  await page.getByLabel("Title", { exact: true }).fill(event);
  await page.getByLabel("Date").fill(inAWeek);
  await page.getByLabel("Capacity (blank = unlimited)").fill("1");
  await page.getByRole("button", { name: "Publish Event" }).click();
  await expectToast(page, "Event published.");
  await tab(page, "Clubs & Societies");
  await page.getByRole("button", { name: "New Club" }).click();
  await page.getByLabel("Name").fill(club);
  await page.getByRole("button", { name: "Create Club" }).click();
  await expectToast(page, "Club created.");

  await logout(page);
  await as(page, student);
  await page.goto("/campus-life");
  await card(page, event).getByRole("button", { name: "RSVP" }).click();
  await expectToast(page, "You're on the list!");
  await expect(card(page, event).getByText("1 / 1 attending")).toBeVisible();
  await tab(page, "Clubs & Societies");
  await card(page, club).getByRole("button", { name: "Join" }).click();
  await expectToast(page, `Welcome to ${club}!`);
  await card(page, club).getByRole("button", { name: "Leave" }).click();
  await expectToast(page, `You left ${club}.`);

  // Event is now full for everyone else
  await logout(page);
  await as(page, teacher);
  await page.goto("/campus-life");
  await expect(card(page, event).getByRole("button", { name: "Full" })).toBeDisabled();
});

// ---------------------------------------------------------------- logistics
test("logistics: route, seat reservation, delay status, manifest", async ({ page }) => {
  const route = tag("E2E Line 7");
  await as(page, owner);
  await page.goto("/logistics");
  await page.getByRole("button", { name: "Add Route" }).click();
  await page.getByLabel("Route Name").fill(route);
  await page.getByLabel("Seats").fill("10");
  await page.getByLabel("Stops (in order, comma separated)").fill("Station, Campus");
  await page.getByRole("button", { name: "Save Route" }).click();
  await expectToast(page, "Route added.");

  await logout(page);
  await as(page, student);
  await page.goto("/logistics");
  await card(page, route).getByRole("button", { name: "Reserve Seat" }).click();
  await expectToast(page, `Seat reserved on ${route}.`);

  await logout(page);
  await as(page, owner);
  await page.goto("/logistics");
  await card(page, route).locator("select").selectOption("Delayed");
  await expectToast(page, "Status updated.");
  await card(page, route).getByTitle("Rider manifest").click();
  await expect(page.getByText(student.name)).toBeVisible();
});

// ---------------------------------------------------------------- calendar & tasks & settings
test("calendar: book a slot, see it, delete it", async ({ page }) => {
  const title = tag("E2E Staff meeting");
  await as(page, owner);
  await page.goto("/calendar");
  await page.getByRole("button", { name: "Book Slot" }).click();
  await page.getByLabel("Event Title").fill(title);
  await page.getByLabel("Date").fill(today);
  await page.getByLabel("Start Time").fill("15:00");
  await page.getByLabel("Event Type").selectOption("meeting");
  await page.getByRole("button", { name: "Save to Calendar" }).click();
  await expectToast(page, "Event saved.");
  await page.getByRole("button", { name: new RegExp(title) }).first().click();
  await page.getByRole("button", { name: "Delete event" }).click();
  await expectToast(page, "Event deleted.");
});

test("tasks: create, advance status to done, edit, delete", async ({ page }) => {
  const title = tag("E2E Order servos");
  await as(page, teacher);
  await page.goto("/tasks");
  await page.getByRole("button", { name: "Create Task" }).click();
  await page.getByLabel("Task Title").fill(title);
  await page.getByLabel("Due Date").fill(inAWeek);
  await page.getByRole("button", { name: "Save to Workspace" }).click();
  await expectToast(page, "Task created.");
  const t = page.locator("div.rounded-2xl").filter({ hasText: title });
  await t.getByRole("button", { name: "Pending" }).click();
  await expect(t.getByText("In Progress")).toBeVisible();
  await t.getByRole("button", { name: "In Progress" }).click();
  await page.locator("select").filter({ hasText: "In Progress" }).selectOption("All");
  await expect(t.getByText("Done")).toBeVisible();
  await t.locator("button").nth(1).click({ force: true });
  await page.getByLabel("Notes").fill("Ordered from supplier");
  await page.getByRole("button", { name: "Save to Workspace" }).click();
  await expectToast(page, "Task updated.");
  await t.locator("button").nth(2).click({ force: true });
  await expectToast(page, "Task deleted.");
});

test("settings: rename yourself", async ({ page }) => {
  await as(page, applicant);
  await page.goto("/settings");
  await page.getByLabel("Full Name").fill(`${applicant.name} Renamed`);
  await page.getByRole("button", { name: "Save Profile" }).click();
  await expectToast(page, "Profile updated.");
  await expect(page.getByLabel("Full Name")).toHaveValue(`${applicant.name} Renamed`);
});

// ---------------------------------------------------------------- teaching extras
test("classes: room and teacher double-booking is refused", async ({ page }) => {
  await as(page, teacher);
  await page.goto("/classes");
  const create = async (name: string, room: string, start: string, end: string) => {
    await page.getByRole("button", { name: "New Class" }).click();
    await page.getByLabel("Class Name").fill(name);
    await page.getByRole("group", { name: "Days" }).getByRole("button", { name: "Tue", exact: true }).click();
    await page.getByLabel("Starts").fill(start);
    await page.getByLabel("Ends").fill(end);
    await page.getByLabel("Room").fill(room);
    await page.getByLabel("Term Label").fill(`E2E-${RUN}`);
    await page.getByRole("button", { name: "Save Class" }).click();
  };
  await create(tag("E2E Circuits"), `R-${RUN}`, "09:00", "10:30");
  await expectToast(page, "Class created.");
  await create(tag("E2E Clash"), `R-${RUN}`, "10:00", "11:00");
  await expect(page.locator(".fixed.bottom-6 .bg-red-50").last()).toContainText("already booked");
  await page.keyboard.press("Escape");
  await create(tag("E2E Clash 2"), `Other-${RUN}`, "09:30", "10:00");
  await expect(page.locator(".fixed.bottom-6 .bg-red-50").last()).toContainText("already teaches");
  await page.keyboard.press("Escape");
  // enroll the student for the next tests
  await card(page, tag("E2E Circuits")).getByRole("button", { name: "Roster" }).click();
  await page.locator("select[multiple]").selectOption({ label: student.name });
  await page.getByRole("button", { name: "Enroll" }).click();
  await expectToast(page, /1 student\(s\) enrolled/);
});

test("gradebook: grade → student & parent get notified; whole-class report cards print", async ({ page }) => {
  // Link the parent to the student first so the parent receives the grade notification.
  await as(page, owner);
  await page.goto("/admin");
  await page.getByPlaceholder(/Search profiles/).fill(parent.name);
  await row(page, parent.name).getByTitle("Linked children").click();
  await page.getByLabel("Child", { exact: true }).selectOption({ label: student.name });
  await page.getByLabel("Relationship", { exact: true }).selectOption("Mother");
  await page.getByRole("button", { name: "Link", exact: true }).click();
  await expectToast(page, "Child linked.");
  await logout(page);

  await as(page, teacher);
  await page.goto("/gradebook");
  await page.getByRole("button", { name: tag("E2E Circuits") }).click();
  await page.getByRole("button", { name: "Add Assessment" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Quiz 1");
  await page.getByLabel("Max Points").fill("20");
  await page.getByRole("button", { name: "Add Assessment" }).last().click();
  await expectToast(page, "Assessment added.");
  await page.getByLabel(`${student.name} Quiz 1`).fill("17");
  await page.getByLabel(`${student.name} Quiz 1`).press("Tab");
  await expect(row(page, student.name).getByText("85%")).toBeVisible();
  await page.getByRole("button", { name: "All report cards" }).click();
  const doc = (await printedDocuments(page)).at(-1) ?? "";
  expect(doc).toContain(student.name);
  expect(doc).toContain("page-break-after");

  await logout(page);
  await as(page, student);
  await page.getByRole("button", { name: /Notifications \(\d+ unread\)/ }).last().click();
  await expect(page.getByText("New grade: Quiz 1")).toBeVisible();
  await page.getByText("New grade: Quiz 1").click();
  await expect(page).toHaveURL(/\/gradebook/);
});

test("parent portal: sees child's grades, reports an absence; admin sees who it's for", async ({ page }) => {
  await as(page, parent);
  await page.getByRole("button", { name: /Notifications \(\d+ unread\)/ }).last().click();
  await expect(page.getByText(new RegExp(`New grade for ${student.name}`))).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/family");
  const section = page.getByRole("region", { name: student.name });
  await expect(section.getByText("85%")).toBeVisible();
  await expect(section.getByText(tag("E2E lab fee"))).toBeVisible();
  // Parents don't get staff/student-only menus
  await expect(page.getByRole("link", { name: "Gradebook" })).toHaveCount(0);
  await page.goto("/leave");
  await page.getByRole("button", { name: "Submit Absence Note" }).click();
  await expect(page.getByLabel("Child", { exact: true })).toHaveValue(/.+/);
  await page.getByLabel("Reason").fill(tag("E2E dentist"));
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expectToast(page, "Request submitted for approval.");

  await logout(page);
  await as(page, owner);
  await page.goto("/leave");
  await expect(row(page, tag("E2E dentist")).getByText(student.name)).toBeVisible();
  await expect(row(page, tag("E2E dentist")).getByText(/note from/i)).toBeVisible();
  await row(page, tag("E2E dentist")).getByRole("button", { name: "Approve" }).click();
  await expectToast(page, "Request approved.");
});

test("e-learning: lecture added as a YouTube link opens the link", async ({ page }) => {
  const title = tag("E2E long lecture");
  await as(page, teacher);
  await page.goto("/e-learning");
  await page.getByRole("button", { name: "Create Module" }).click();
  await page.getByLabel("Resource Title").fill(title);
  await page.getByRole("radio", { name: /Link/ }).click();
  await page.getByLabel("Video / Document Link").fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await page.getByRole("button", { name: "Publish" }).click();
  await expectToast(page, "Resource published.");
  const item = page.locator("div.rounded-2xl").filter({ hasText: title });
  await expect(item.getByText("Link")).toBeVisible();
  const [tabPage] = await Promise.all([page.context().waitForEvent("page"), item.locator("button").first().click()]);
  await expect.poll(() => tabPage.url()).toContain("youtube.com");
  await tabPage.close();
  await item.locator("button").last().click({ force: true });
  await expectToast(page, "Resource deleted.");
});
