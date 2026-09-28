import { expect, type Browser, type Page } from "@playwright/test";
import { test, hasOwner, owner, login, logout, inviteUser, testUser, RUN, expectToast, watchForErrors, capturePrints, printedDocuments, exportCsv, onApp, onAndroid, onDesktopApp, type TestUser } from "./helpers";

// The next-level features, click-tested end to end: languages, timetable rules and absence cover,
// QR/code check-in and card-tap registers, the live school bus, interventions, test-mode online
// payments, SMS/WhatsApp opt-in and broadcasts, digitally signed credentials, the AI assistant and
// offline mode (changes saved on the device and synced later).
test.describe.configure({ mode: "serial" });
test.skip(!hasOwner, "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD in .env.local");
test.setTimeout(240_000);

const teacher = testUser("nteacher");
const sub = testUser("nsub");
const student = testUser("nstudent");
const parent = testUser("nparent");
const L = (s: string) => `E2E ${s} ${RUN}`;
const CLASS = L("Physics");
const ROUTE = L("Route");
const CARD = `E2E${RUN}`.toUpperCase();
// A phone number unique to this run, so texts from other runs never match.
const PHONE = `+9198${String(Date.now()).slice(-8)}`;

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const now = new Date();
// Cover needs a school day (the class form offers Mon–Sat): today, or tomorrow when today is Sunday.
const coverDate = new Date(now);
if (coverDate.getDay() === 0) coverDate.setDate(coverDate.getDate() + 1);
const COVER_DAY = coverDate.toLocaleDateString("en-US", { weekday: "short" });
const TODAY_IS_SCHOOL_DAY = now.getDay() !== 0;

// Signs in through the API (for the second person in a step, when the app under test has one window).
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
async function api(u: TestUser) {
  const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SB_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: u.email, password: u.password }),
  });
  const { access_token: token } = (await res.json()) as { access_token: string };
  expect(token, `API sign-in for ${u.email}`).toBeTruthy();
  const h = { apikey: SB_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  return {
    rpc: async (fn: string, args: object) => {
      const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: h, body: JSON.stringify(args) });
      return { ok: r.ok, data: await r.json() };
    },
    get: async (path: string) => (await (await fetch(`${SB_URL}/rest/v1/${path}`, { headers: h })).json()) as Record<string, unknown>[],
  };
}
// A second, independent browser window signed in as someone else (web runs only).
async function secondWindow(browser: Browser, u: TestUser) {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await login(p, u);
  return p;
}

let errors: string[] = [];
let allowed: RegExp[] = [];
test.beforeEach(async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  errors = watchForErrors(page);
  // 400: business rules refusing on purpose.
  allowed = [/status of 400/];
  await capturePrints(page);
});
test.afterEach(() => {
  const real = errors.filter((e) => !allowed.some((a) => a.test(e)));
  expect(real, real.join("\n")).toEqual([]);
});

const row = (page: Page, text: string) => page.locator("tr").filter({ hasText: text });
const tab = (page: Page, name: string | RegExp) => page.getByRole("button", { name }).first().click();
const modal = (page: Page) => page.getByRole("dialog").last();
const as = (page: Page, u: TestUser) => login(page, u);

test("owner creates a teacher, a cover teacher, a student and a parent", async ({ page }) => {
  await as(page, owner);
  await inviteUser(page, teacher, "teacher");
  await inviteUser(page, sub, "teacher");
  await inviteUser(page, student, "student");
  await inviteUser(page, parent, "parent");
  await page.getByPlaceholder(/Search profiles/).fill(parent.name);
  await row(page, parent.name).getByTitle("Linked children").click();
  await page.getByLabel("Child", { exact: true }).selectOption({ label: student.name });
  await page.getByLabel("Relationship", { exact: true }).selectOption("Mother");
  await page.getByRole("button", { name: "Link", exact: true }).click();
  await expectToast(page, "Child linked.");
  await logout(page);
  for (const u of [teacher, sub, student, parent]) {
    await as(page, u);
    await logout(page);
  }
});

test("languages: sign-in screen and the whole app switch to Hindi or Bengali, and the choice follows the account", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Language").first().selectOption("hi");
  await expect(page.getByRole("heading", { name: "सुरक्षित साइन इन" })).toBeVisible();
  await expect(page.getByPlaceholder("ईमेल पता")).toBeVisible();
  await page.getByLabel("भाषा").first().selectOption("en");
  await expect(page.getByRole("heading", { name: "Secure Sign In" })).toBeVisible();

  await as(page, student);
  await page.goto("/settings");
  await page.getByRole("radio", { name: /বাংলা/ }).click();
  await expect(page.getByRole("heading", { name: "সেটিংস" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "bn");
  // The choice is kept in the account too: forget it on this device and it comes back after a reload.
  await page.waitForTimeout(1500);
  await page.evaluate(() => localStorage.removeItem("erp_lang"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "সেটিংস" })).toBeVisible();
  await page.getByRole("radio", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await page.waitForTimeout(1500);
});

test("timetable rules: a teacher blocks a time; an absence gets a free colleague as cover, who is told", async ({ page }) => {
  await as(page, teacher);
  await page.goto("/classes");
  await tab(page, "Availability & Cover");
  await page.getByLabel("Day", { exact: true }).selectOption("Mon");
  await page.getByLabel("From", { exact: true }).fill("07:00");
  await page.getByLabel("To", { exact: true }).fill("08:00");
  await page.getByLabel("Reason", { exact: true }).fill("School run");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expectToast(page, "Saved. The timetable builder will keep this time free.");
  await expect(page.getByText("Mon 07:00–08:00 · School run")).toBeVisible();
  await logout(page);

  await as(page, owner);
  await page.goto("/classes");
  await page.getByRole("button", { name: "New Class" }).click();
  await modal(page).getByLabel("Class Name").fill(CLASS);
  await modal(page).getByLabel("Teacher").selectOption({ label: teacher.name });
  await modal(page).getByRole("group", { name: "Days" }).getByRole("button", { name: COVER_DAY, exact: true }).click();
  await modal(page).getByLabel("Starts").fill("06:00");
  await modal(page).getByLabel("Ends").fill("06:45");
  await modal(page).getByLabel("Room Type Needed").selectOption("lab");
  await modal(page).getByRole("button", { name: "Save Class" }).click();
  await expectToast(page, "Class created.");
  // Enrol the student (used by check-in and card taps below).
  await page.getByPlaceholder(/Search classes/).fill(CLASS);
  await page.getByRole("button", { name: "Roster" }).first().click();
  await modal(page).locator("select[multiple]").selectOption({ label: student.name });
  await modal(page).getByRole("button", { name: "Enroll" }).click();
  await expectToast(page, "1 student(s) enrolled.");
  await modal(page).getByRole("button", { name: "Close" }).click();

  await tab(page, "Availability & Cover");
  await expect(page.getByText(`${teacher.name}`).first()).toBeVisible();
  await page.getByLabel("Absent teacher").selectOption({ label: teacher.name });
  await page.getByLabel("Date", { exact: true }).fill(iso(coverDate));
  await page.getByLabel("Reason", { exact: true }).last().fill("Ill");
  await page.getByRole("button", { name: "Record absence" }).click();
  await expectToast(page, "Absence recorded. Choose cover below.");
  const picker = page.getByLabel(`Cover for ${CLASS}`);
  await picker.selectOption({ label: sub.name });
  await picker.locator("xpath=..").getByRole("button", { name: "Assign" }).click();
  await expectToast(page, `${sub.name} will cover ${CLASS}.`);
  await expect(page.getByText(`covered by ${sub.name}`)).toBeVisible();
  await logout(page);

  await as(page, sub);
  await page.goto("/classes");
  await tab(page, "Availability & Cover");
  await expect(page.getByText("My cover duties")).toBeVisible();
  await expect(page.locator("b", { hasText: CLASS })).toBeVisible();
});

test("check-in: the teacher shows a changing code; the student checks in with it; card taps take the register", async ({ page, browser }) => {
  test.skip(!TODAY_IS_SCHOOL_DAY, "The class meets on school days.");
  await as(page, owner);
  await page.goto("/facilities");
  await tab(page, "Devices & Access");
  await page.getByRole("button", { name: "Assign card" }).click();
  await modal(page).getByLabel("Card Number (UID)").fill(CARD);
  await modal(page).getByLabel("Card Holder").selectOption({ label: student.name });
  await modal(page).getByRole("button", { name: "Assign" }).click();
  await expectToast(page, "Access card assigned.");
  await logout(page);

  await as(page, teacher);
  await page.goto("/attendance");
  await page.getByRole("button", { name: "Check-in code" }).click();
  await modal(page).getByRole("button", { name: /Start check-in/ }).click();
  const code = page.getByTestId("checkin-code");
  await expect(code).toHaveText(/^\d{6}$/);
  await expect(modal(page).getByRole("img", { name: "Check-in QR code" })).toBeVisible();
  await expect(modal(page).getByText("0 checked in")).toBeVisible();

  if (!onApp) {
    const p2 = await secondWindow(browser, student);
    await p2.goto("/attendance");
    await p2.getByLabel("Check-in code").fill(((await code.textContent()) ?? "").trim());
    await p2.getByRole("button", { name: "Check in", exact: true }).click();
    await expect(p2.getByRole("status")).toContainText(`Checked in to ${CLASS} (Present)`);
    await p2.context().close();
  } else {
    const res = await (await api(student)).rpc("checkin", { p_code: ((await code.textContent()) ?? "").trim() });
    expect(res.data, JSON.stringify(res.data)).toMatchObject({ ok: true, status: "Present" });
  }
  await expect(modal(page).getByText("1 checked in")).toBeVisible();
  await modal(page).getByRole("button", { name: "Stop check-in" }).click();

  // Card taps: a USB reader types the number + Enter; on Android the phone's NFC reader sends it.
  await page.getByRole("button", { name: "Tap cards" }).click();
  await modal(page).getByLabel("Card number", { exact: true }).fill(CARD.toLowerCase());
  await modal(page).getByLabel("Card number", { exact: true }).press("Enter");
  await expect(modal(page).getByText(`${student.name} — Present`)).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("erp:nfc", { detail: "0BADC0DE" })));
  await expect(modal(page).getByText(/0BADC0DE: Unknown or blocked card/)).toBeVisible();
  await modal(page).getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("1 students • 1 marked")).toBeVisible();
});

test("live bus: stops with map positions; the driver's phone shares the position; the rider and parent are alerted", async ({ page, browser }) => {
  await as(page, owner);
  await page.goto("/logistics");
  await page.getByRole("button", { name: "Add Route" }).click();
  await modal(page).getByLabel("Route Name").fill(ROUTE);
  await modal(page).getByLabel("Driver's app account (shares the live position)").selectOption({ label: sub.name });
  await modal(page).getByRole("button", { name: "Save Route" }).click();
  await expectToast(page, "Route added.");
  const card = page.locator("div.rounded-3xl").filter({ hasText: ROUTE }).first();
  await card.getByTitle("Stops & map positions").click();
  for (const [name, lat, lng] of [["Park Street", "22.5530", "88.3520"], ["Campus Gate", "22.5800", "88.4000"]]) {
    await modal(page).getByLabel("Stop name").fill(name);
    await modal(page).getByLabel("Latitude").fill(lat);
    await modal(page).getByLabel("Longitude").fill(lng);
    await modal(page).getByRole("button", { name: "Add stop" }).click();
    await expect(modal(page).getByText(name)).toBeVisible();
  }
  await modal(page).getByRole("button", { name: "Close" }).click();
  await logout(page);

  await as(page, student);
  await page.goto("/logistics");
  const mine = page.locator("div.rounded-3xl").filter({ hasText: ROUTE }).first();
  await mine.getByRole("button", { name: "Reserve Seat" }).click();
  await expectToast(page, `Seat reserved on ${ROUTE}.`);
  await mine.getByLabel("My stop").selectOption({ label: "Park Street" });
  await expectToast(page, /Stop saved/);
  await expect(mine.getByText("Not on the road right now.")).toBeVisible();

  // About 1 km from Park Street: roughly 3 minutes away, so the rider and the parent get an alert.
  if (!onApp) {
    const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, geolocation: { latitude: 22.56, longitude: 88.356 }, permissions: ["geolocation"] });
    const driver = await ctx.newPage();
    await login(driver, sub);
    await driver.goto("/logistics");
    const drv = driver.locator("div.rounded-3xl").filter({ hasText: ROUTE }).first();
    await drv.getByRole("button", { name: "Start trip" }).click();
    await expect(drv.getByText(/Last sent .*1 stop alert\(s\) sent/)).toBeVisible({ timeout: 30_000 });
    await expect(mine.getByText(/Live · updated/)).toBeVisible();
    await expect(mine.getByText("your stop")).toBeVisible();
    await expect(mine.getByText(/~\d+ min/).first()).toBeVisible();
    await drv.getByRole("button", { name: "End trip" }).click();
    await expect(driver.locator(".fixed.bottom-6").getByText("Trip ended.").last()).toBeVisible();
    await ctx.close();
  } else {
    const d = await api(sub);
    const [r] = await (await api(student)).get(`transport_routes?name=eq.${encodeURIComponent(ROUTE)}&select=id`);
    expect((await d.rpc("report_bus_location", { p_route: r.id, p_lat: 22.56, p_lng: 88.356, p_speed: 25 })).data).toMatchObject({ ok: true, alerts: 1 });
    await expect(mine.getByText(/Live · updated/)).toBeVisible();
    await expect(mine.getByText(/~\d+ min/).first()).toBeVisible();
    await d.rpc("end_bus_trip", { p_route: r.id });
  }
  for (const u of [student, parent]) {
    const alerts = await (await api(u)).get("notifications?title=eq.Bus%20arriving%20soon&select=body");
    expect(alerts.length, `${u.name} alerted`).toBe(1);
    expect(String(alerts[0].body)).toContain("Park Street");
  }
});

test("interventions: open a case with a mentor, plan a follow-up, see the impact, close it with the outcome", async ({ page }) => {
  await as(page, teacher);
  await page.goto("/interventions");
  await page.getByRole("button", { name: "New case" }).click();
  await modal(page).getByLabel("Student").selectOption({ label: student.name });
  await modal(page).getByLabel("Mentor").selectOption({ label: sub.name });
  await modal(page).getByLabel("Reason").fill(L("Attendance dropping"));
  await modal(page).getByLabel("Goal").fill("Attendance above 90%");
  await modal(page).getByRole("button", { name: "Open intervention" }).click();
  await expectToast(page, "Intervention opened.");
  await tab(page, "Cases");
  await row(page, student.name).getByRole("button", { name: "Open" }).click();
  await expect(modal(page).getByText("Risk score")).toBeVisible();
  await expect(modal(page).getByText("Compares the 30 days before the case opened with the time since.")).toBeVisible();
  await modal(page).getByLabel("Type").selectOption("call");
  await modal(page).getByLabel("What").fill("Call home about absences");
  await modal(page).getByLabel("Who").selectOption({ label: sub.name });
  await modal(page).getByRole("button", { name: "Add" }).click();
  await expectToast(page, "Added to the case.");
  await logout(page);

  await as(page, sub);
  await page.goto("/interventions");
  await tab(page, "My follow-ups");
  await expect(page.getByText("Call home about absences")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).first().click();
  await expectToast(page, "Marked done.");
  await tab(page, "Cases");
  await row(page, student.name).getByRole("button", { name: "Open" }).click();
  await modal(page).getByLabel("Outcome").selectOption("improved");
  await modal(page).getByRole("button", { name: "Close case" }).click();
  await expectToast(page, "Case closed.");
  await modal(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(row(page, student.name)).toContainText("closed");
  await expect(row(page, student.name)).toContainText("improved");
  await logout(page);

  await as(page, student);
  await page.goto("/interventions");
  await expect(page.getByText("Interventions are for staff.")).toBeVisible();
});

test("online payments (test mode): UPI succeeds, a declined card charges nothing, a parent pays by net banking", async ({ page }) => {
  await as(page, owner);
  await page.goto("/finance");
  await tab(page, "Student Accounts");
  await page.getByRole("button", { name: "Open account" }).first().click();
  await modal(page).getByLabel("Student").selectOption({ label: student.name });
  await modal(page).getByRole("button", { name: "Save" }).click();
  await expectToast(page, "Account opened.");
  await row(page, student.name).getByTitle("Open account").click();
  await page.getByRole("button", { name: "Adjustment" }).click();
  await modal(page).getByLabel("Amount ($)").fill("500");
  await modal(page).getByLabel("Direction").selectOption("charge");
  await modal(page).getByLabel("Reason").fill(L("Lab fee"));
  await modal(page).getByRole("button", { name: "Save" }).click();
  await expectToast(page, "Adjustment posted.");
  await logout(page);

  await as(page, student);
  await page.goto("/finance");
  await tab(page, "My Account");
  await expect(page.getByText("Balance $500.00")).toBeVisible();
  await page.getByRole("button", { name: "Pay online" }).click();
  await expect(modal(page).getByText(/Test mode: this is a simulated payment gateway/)).toBeVisible();
  await modal(page).getByLabel("Amount").fill("100");
  await modal(page).getByLabel("UPI ID").fill("student@okaxis");
  await modal(page).getByRole("button", { name: "Pay $100.00" }).click();
  await expect(modal(page).getByText("Approve the request in your UPI app")).toBeVisible();
  await modal(page).getByRole("button", { name: "Approve" }).click();
  await expect(modal(page).getByText("Payment successful")).toBeVisible();
  await expect(modal(page).getByText("$400.00")).toBeVisible();
  if (!onAndroid) {
    await modal(page).getByRole("button", { name: "Receipt" }).click();
    const doc = (await printedDocuments(page)).at(-1) ?? "";
    expect(doc).toContain("Payment Receipt");
    expect(doc).toContain("TEST MODE");
  }
  await modal(page).getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Balance $400.00")).toBeVisible();

  await page.getByRole("button", { name: "Pay online" }).click();
  await modal(page).getByRole("radio", { name: "Card" }).click();
  await modal(page).getByLabel("Amount").fill("50");
  await modal(page).getByLabel("Card Number").fill("4000 0000 0000 0002");
  await modal(page).getByLabel("Expiry (MM/YY)").fill("12/30");
  await modal(page).getByLabel("CVV").fill("123");
  await modal(page).getByRole("button", { name: "Pay $50.00" }).click();
  await expect(modal(page).getByText("Payment failed")).toBeVisible();
  await expect(modal(page).getByText("Nothing was charged.")).toBeVisible();
  await modal(page).getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Balance $400.00")).toBeVisible();
  await expect(page.getByText("Card declined by the issuing bank")).toBeVisible();
  await logout(page);

  await as(page, parent);
  await page.goto("/finance");
  await tab(page, "Family Accounts");
  await page.getByRole("button", { name: "Pay online" }).click();
  await modal(page).getByRole("radio", { name: "Net Banking" }).click();
  await modal(page).getByLabel("Amount").fill("100");
  await modal(page).getByRole("button", { name: "Pay $100.00" }).click();
  await modal(page).getByRole("button", { name: "Approve" }).click();
  await expect(modal(page).getByText("Payment successful")).toBeVisible();
  await modal(page).getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Balance $300.00")).toBeVisible();
  const receipts = await (await api(parent)).get("notifications?title=eq.Payment%20received&select=id");
  expect(receipts.length).toBeGreaterThanOrEqual(2);
  await logout(page);

  // The owner can switch online payments off (and on again).
  await as(page, owner);
  await page.goto("/integrations");
  await expect(page.getByText("Test mode (simulated)")).toBeVisible();
  await page.getByRole("button", { name: "Switch off" }).click();
  await expectToast(page, "Online payments switched off.");
  await page.getByRole("button", { name: "Switch on (test mode)" }).click();
  await expectToast(page, "Online payments switched on (test mode).");
});

test("text messages: a student opts in to SMS and WhatsApp; an administrator messages all students; delivery is logged", async ({ page }) => {
  await as(page, student);
  await page.goto("/settings");
  await page.getByLabel("Mobile Number").fill("12345");
  await page.getByRole("checkbox", { name: "SMS" }).check();
  await page.getByRole("button", { name: "Save Text Settings" }).click();
  await expectToast(page, "Enter the number in international format, e.g. +91 98123 45678.");
  await page.getByLabel("Mobile Number").fill(PHONE);
  await page.getByRole("checkbox", { name: "WhatsApp" }).check();
  await page.getByRole("button", { name: "Save Text Settings" }).click();
  await expectToast(page, "Text message settings saved.");
  await logout(page);

  await as(page, owner);
  await page.goto("/messages");
  await page.getByLabel("To", { exact: true }).selectOption("students");
  await page.getByLabel("Title").fill(L("Trip"));
  await page.getByLabel("Message").fill("Bring a packed lunch on Friday.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expectToast(page, /Message sent to \d+ people\./);
  await tab(page, "Delivery log");
  await page.getByPlaceholder("Search messages...").fill(PHONE);
  await expect(row(page, L("Trip"))).toHaveCount(2);
  await expect(row(page, L("Trip")).first()).toContainText(student.name);
  await logout(page);

  await as(page, student);
  await page.goto("/settings");
  await expect(page.getByText("Recent texts to you")).toBeVisible();
  await expect(page.getByText(new RegExp(`All-In-One ERP: ${L("Trip")}`))).toBeVisible();
});

test("signed credentials: issued, signed automatically, verified publicly by signature, QR on the certificate", async ({ page }) => {
  const BADGE = L("Robotics");
  await as(page, owner);
  await page.goto("/credentials");
  await tab(page, "Badge Catalogue");
  await page.getByRole("button", { name: "New Badge" }).click();
  await modal(page).getByLabel("Name").fill(BADGE);
  await modal(page).getByLabel("Description").fill("Built and programmed a robot arm.");
  await modal(page).getByLabel("Skills (comma separated)").fill("Robotics, Python");
  await modal(page).getByRole("button", { name: "Create" }).click();
  await expectToast(page, "Badge created.");
  await tab(page, "Issued Credentials");
  await page.getByRole("button", { name: "Issue Credential" }).click();
  await modal(page).getByLabel("Badge").selectOption({ label: BADGE });
  await modal(page).getByLabel("Student").selectOption({ label: student.name });
  await modal(page).getByRole("button", { name: "Issue" }).click();
  await expectToast(page, /Credential issued/);
  const r = row(page, BADGE);
  await expect(r.getByText("Signed")).toBeVisible({ timeout: 20_000 });
  const code = ((await r.locator("td.font-mono").textContent()) ?? "").trim();
  expect(code).toMatch(/^[0-9A-F]{12}$/);
  await logout(page);

  // Anyone can verify it, with no account: the page checks the school's digital signature.
  await page.goto(`/verify?code=${code}`);
  await expect(page.getByText("Valid credential")).toBeVisible();
  await expect(page.getByTestId("signature-valid")).toBeVisible();

  await as(page, student);
  await page.goto("/credentials");
  const cardEl = page.locator("div.rounded-3xl").filter({ hasText: BADGE }).first();
  if (!onAndroid) {
    await cardEl.getByRole("button", { name: "Certificate" }).click();
    await expect.poll(async () => (await printedDocuments(page)).at(-1) ?? "").toContain("Digitally signed");
    expect((await printedDocuments(page)).at(-1)).toContain('<img src="data:image/png;base64');
  }
  const file = await exportCsv(page, () => cardEl.getByRole("button", { name: "Digital" }).click(), ".jwt");
  const [, payload] = file.text.trim().split(".");
  const vc = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  expect(vc.type).toContain("OpenBadgeCredential");
  expect(vc.credentialSubject.achievement.name).toBe(BADGE);
  expect(vc.credentialSubject.name).toBe(student.name);
});

test("AI assistant: opens from the sidebar, offers questions for the role, and answers or says it isn't set up", async ({ page }) => {
  await as(page, student);
  await page.getByRole("button", { name: "Ask AI" }).first().click();
  const panel = page.getByRole("dialog", { name: "Ask AI" });
  await expect(panel.getByText("Answers come only from records you're allowed to see. It can read, never change.")).toBeVisible();
  await panel.getByRole("button", { name: "Do I owe any fees?" }).click();
  await expect(panel.getByText("Do I owe any fees?").first()).toBeVisible();
  // Until an AI key is added the assistant says so; with a key it answers from the student's own records.
  await expect(panel.getByText(/isn't set up yet|\$\d/).last()).toBeVisible({ timeout: 90_000 });
  await panel.getByRole("button", { name: "Close" }).last().click();
});

test("offline: changes made without a connection are kept on the device and synced when it's back", async ({ page }) => {
  test.skip(onAndroid, "Android covers this with airplane mode in its own suite.");
  test.skip(onDesktopApp, "Network emulation is not available for the installed app's WebView.");
  allowed.push(/ERR_INTERNET_DISCONNECTED|Failed to fetch|ERR_NAME_NOT_RESOLVED|WebSocket/);
  await as(page, teacher);
  await page.goto("/tasks");
  await expect(page.getByRole("button", { name: "Create Task" })).toBeVisible();
  await page.context().setOffline(true);
  await expect(page.getByText("You're offline — changes are saved on this device and sync when you're back online.")).toBeVisible();
  await page.getByRole("button", { name: "Create Task" }).click();
  await modal(page).getByLabel("Task Title").fill(L("Offline task"));
  await modal(page).getByRole("button", { name: "Save to Workspace" }).click();
  await expectToast(page, "Saved on this device — it will sync when you're back online.");
  await expect(page.getByText(L("Offline task"))).toBeVisible();
  await expect(page.getByText("1 waiting")).toBeVisible();

  await page.context().setOffline(false);
  await expectToast(page, "1 offline change(s) synced.", 30_000);
  await page.reload();
  await expect(page.getByText(L("Offline task"))).toBeVisible();

  // The register works offline too.
  test.skip(!TODAY_IS_SCHOOL_DAY);
  await page.goto("/attendance");
  await expect(page.getByText(/\d+ students • \d+ marked/)).toBeVisible();
  await page.context().setOffline(true);
  await page.getByRole("button", { name: "Mark all present" }).click();
  await page.getByRole("button", { name: "Save register" }).click();
  await expectToast(page, "Saved on this device — it will sync when you're back online.");
  await page.context().setOffline(false);
  await expectToast(page, "1 offline change(s) synced.", 30_000);
});
