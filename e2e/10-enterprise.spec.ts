import { expect, request, type Page } from "@playwright/test";
import { test, hasOwner, owner, login, logout, inviteUser, testUser, RUN, expectToast, watchForErrors, capturePrints, onApp, type TestUser } from "./helpers";

// Institutional & enterprise modules, click-tested end to end: procurement with amount-based routing,
// research grants with sponsor rules, faculty tenure workflow and sabbaticals, alumni giving,
// versioned compliance documents and statutory reports, lab hardware devices, and chat presence.
test.describe.configure({ mode: "serial" });
test.skip(!hasOwner, "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD in .env.local");
test.setTimeout(180_000);

const teacher = testUser("eteacher");
const alumnus = testUser("ealumni");
const student = testUser("estudent");
const L = (s: string) => `E2E ${s} ${RUN}`;
const DEPT = L("Engineering");
const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  page.on("dialog", (d) => d.accept(d.type() === "prompt" ? "Over budget" : undefined));
  errors = watchForErrors(page);
  await capturePrints(page);
});
test.afterEach(() => {
  // Business rules refused on purpose (sponsor restrictions) answer 400.
  const real = errors.filter((e) => !/Failed to load resource: the server responded with a status of 400/.test(e));
  expect(real, real.join("\n")).toEqual([]);
});

const row = (page: Page, text: string) => page.locator("tr").filter({ hasText: text });
const tab = (page: Page, name: string | RegExp) => page.getByRole("button", { name }).first().click();
const modal = (page: Page) => page.getByRole("dialog");
const as = (page: Page, u: TestUser) => login(page, u);

test("owner creates a teacher, a student and an alumni account", async ({ page }) => {
  await as(page, owner);
  await inviteUser(page, teacher, "teacher");
  await inviteUser(page, student, "student");
  await inviteUser(page, alumnus, "alumni");
  await logout(page);
  await as(page, teacher);
  await logout(page);
  await as(page, alumnus);
  // Alumni get the giving portal, not the school's internal modules.
  await expect(page.getByText("Give or view my giving")).toBeVisible();
  await page.goto("/advancement");
  await expect(page.getByRole("heading", { name: "Advancement" }).first()).toBeVisible();
});

test("procurement: department, budget, request routed and approved with a full history", async ({ page }) => {
  await as(page, owner);
  await page.goto("/procurement");
  await tab(page, "Departments & Budgets");
  await page.getByRole("button", { name: "Add Department" }).click();
  await modal(page).getByLabel("Name").fill(DEPT);
  await modal(page).getByLabel("Head (approves requests)").selectOption({ label: teacher.name });
  await modal(page).getByRole("button", { name: "Add" }).click();
  await expectToast(page, "Department added.");
  await page.getByRole("button", { name: "Set budget" }).click();
  await modal(page).getByLabel("Department").selectOption({ label: DEPT });
  await modal(page).getByLabel("Budget ($)").fill("5000");
  await modal(page).getByRole("button", { name: "Save Budget" }).click();
  await expectToast(page, "Budget saved.");
  await expect(row(page, DEPT)).toContainText("$5,000.00");
  await logout(page);

  await as(page, teacher);
  await page.goto("/procurement");
  await page.getByRole("button", { name: "New Request" }).click();
  await modal(page).getByLabel("Department").selectOption({ label: DEPT });
  await modal(page).getByLabel("Vendor").fill(L("Acme"));
  await modal(page).getByLabel("What is it for?").fill("Servo motors");
  await modal(page).getByLabel("Amount ($)").fill("2500");
  await modal(page).getByRole("button", { name: "Save Draft" }).click();
  await expectToast(page, /Draft saved/);
  await row(page, L("Acme")).getByRole("button", { name: /Submit/ }).click();
  await expectToast(page, "Submitted. Approval route: Department head → Finance.");
  // The head can't approve their own request.
  await tab(page, /Approvals \(0\)/);
  await expect(page.getByText("Nothing waiting for you.")).toBeVisible();
  await logout(page);

  await as(page, owner);
  await page.goto("/procurement");
  await tab(page, /Approvals \(\d+\)/);
  await row(page, L("Acme")).getByRole("button", { name: /Approve/ }).click();
  await expectToast(page, "Approved — now with Finance.");
  await row(page, L("Acme")).getByRole("button", { name: /Approve/ }).click();
  await expectToast(page, "Request fully approved.");
  await tab(page, "All Requests");
  await expect(row(page, L("Acme"))).toContainText("approved");
  await row(page, L("Acme")).getByTitle("Approval history").click();
  await expect(modal(page).getByText(/submitted/i).first()).toBeVisible();
  await expect(modal(page).getByText(/approved — Finance/i)).toBeVisible();
  await page.keyboard.press("Escape");
  await tab(page, "Departments & Budgets");
  await expect(row(page, DEPT)).toContainText("$2,500.00");
});

test("research: grant proposal, award with sponsor rules, allowed and refused spending", async ({ page }) => {
  await as(page, teacher);
  await page.goto("/research");
  await page.getByRole("button", { name: "Propose Grant" }).click();
  await modal(page).getByLabel("Project Title").fill(L("Robot Arm"));
  await modal(page).getByLabel("Sponsor", { exact: true }).fill("NSF");
  await modal(page).getByLabel("Total Award ($)").fill("20000");
  await modal(page).getByLabel("Starts").fill(day(-30));
  await modal(page).getByLabel("Ends").fill(day(365));
  await modal(page).getByLabel("equipment").check();
  await modal(page).getByLabel("personnel").check();
  await modal(page).getByRole("button", { name: "Submit Proposal" }).click();
  await expectToast(page, "Proposal submitted to the research office.");
  await logout(page);

  await as(page, owner);
  await page.goto("/research");
  await row(page, L("Robot Arm")).click();
  await modal(page).getByRole("button", { name: "Mark active" }).click();
  await expectToast(page, "Grant marked active.");
  await page.keyboard.press("Escape");
  await logout(page);

  await as(page, teacher);
  await page.goto("/research");
  await row(page, L("Robot Arm")).click();
  const spend = async (category: string, amount: string) => {
    await modal(page).getByRole("button", { name: "Record expense" }).click();
    await modal(page).getByLabel("Category").selectOption(category);
    await modal(page).getByLabel("Amount ($)").fill(amount);
    await modal(page).getByLabel("Description").fill(`${category} purchase`);
    await modal(page).getByRole("button", { name: "Record Expense" }).click();
  };
  await spend("equipment", "4000");
  await expectToast(page, "Expense recorded against the grant.");
  // The grant's window comes back with the new balance.
  await expect(modal(page).getByText("$16,000.00")).toBeVisible();
  await spend("travel", "100");
  await expectToast(page, /does not allow spending on "travel"/);
  await page.keyboard.press("Escape"); // expense form
  await page.keyboard.press("Escape"); // grant window
  await tab(page, "Effort Certification");
  await page.getByRole("button", { name: "Certify Effort" }).click();
  await modal(page).getByLabel("Grant").selectOption({ label: L("Robot Arm") });
  await modal(page).getByLabel("Effort (%)").fill("40");
  await modal(page).getByRole("button", { name: "Certify" }).click();
  await expectToast(page, "Effort certified.");
});

test("faculty: dossier, four-stage tenure review, sabbatical request", async ({ page }) => {
  await as(page, owner);
  await page.goto("/faculty");
  await page.getByRole("button", { name: "New Dossier" }).click();
  await modal(page).getByLabel("Faculty Member").selectOption({ label: teacher.name });
  await modal(page).getByLabel("Department").selectOption({ label: DEPT });
  await modal(page).getByLabel("Tenure Clock Start").fill(day(-365 * 7));
  await modal(page).getByRole("button", { name: "Create Dossier" }).click();
  await expectToast(page, "Dossier created.");
  await row(page, teacher.name).click();
  await modal(page).getByRole("button", { name: "Open tenure review" }).click();
  await expectToast(page, "Tenure review opened at department level.");
  for (const stage of ["department", "college", "provost"]) {
    await modal(page).getByRole("button", { name: "recommend", exact: true }).click();
    await expectToast(page, `${stage} decision recorded.`);
  }
  await modal(page).getByRole("button", { name: "approved", exact: true }).click();
  await expectToast(page, "board decision recorded.");
  await expect(modal(page).getByText("tenured")).toBeVisible();
  await page.keyboard.press("Escape");
  await logout(page);

  await as(page, teacher);
  await page.getByRole("button", { name: /Notifications/ }).first().click();
  await expect(page.getByText("Tenure decision")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/faculty");
  await expect(page.getByText("tenured").first()).toBeVisible();
  await tab(page, "Sabbaticals");
  await page.getByRole("button", { name: "Request Sabbatical" }).click();
  await modal(page).getByLabel("From").fill(day(200));
  await modal(page).getByLabel("To").fill(day(380));
  await modal(page).getByLabel("Research / Leave Plan").fill("Write a robotics textbook");
  await modal(page).getByRole("button", { name: "Submit Request" }).click();
  await expectToast(page, "Sabbatical requested.");
  await expect(row(page, "Write a robotics textbook")).toContainText("requested");
});

test("advancement: campaign, alumni pledge paid in instalments with receipts, donor score", async ({ page }) => {
  await as(page, owner);
  await page.goto("/advancement");
  await page.getByRole("button", { name: "New Campaign" }).click();
  await modal(page).getByLabel("Campaign Name").fill(L("Robotics Lab Fund"));
  await modal(page).getByLabel("Goal ($)").fill("100000");
  await modal(page).getByRole("button", { name: "Launch" }).click();
  await expectToast(page, "Campaign launched.");
  await logout(page);

  await as(page, alumnus);
  await expect(page.getByText(L("Robotics Lab Fund"))).toBeVisible();
  await page.goto("/advancement");
  await page.locator("div.rounded-3xl").filter({ hasText: L("Robotics Lab Fund") }).getByRole("button", { name: "Give to this campaign" }).click();
  await modal(page).getByLabel("Pledge Amount ($)").fill("500");
  await modal(page).getByRole("button", { name: "Pledge" }).click();
  await expectToast(page, "Thank you — your pledge is recorded.");
  await tab(page, "My Giving");
  await row(page, L("Robotics Lab Fund")).getByRole("button", { name: "Pay" }).click();
  await modal(page).getByLabel("Amount ($)").fill("200");
  await modal(page).getByRole("button", { name: "Pay" }).click();
  await expectToast(page, /Payment received\. Receipt R-/);
  await expect(row(page, L("Robotics Lab Fund"))).toContainText("partially paid");
  await row(page, L("Robotics Lab Fund")).getByRole("button", { name: "Pay" }).click();
  await modal(page).getByRole("button", { name: "Pay" }).click(); // pre-filled with the rest
  await expectToast(page, /Payment received/);
  await expect(row(page, L("Robotics Lab Fund"))).toContainText("paid");
  await expect(page.getByText(/^R-[0-9A-F]{10}/).first()).toBeVisible();
  await logout(page);

  await as(page, owner);
  await page.goto("/advancement");
  await tab(page, "Donor Engagement");
  await expect(row(page, alumnus.name)).toBeVisible();
});

test("compliance: versioned documents and a statutory report with CSV", async ({ page }) => {
  await as(page, owner);
  await page.goto("/compliance");
  const title = L("Lab Safety Policy");
  await page.getByRole("button", { name: "Publish Document" }).click();
  await modal(page).getByLabel("Title").fill(title);
  await modal(page).getByLabel("Standard / Regulation").fill("ISO 45001");
  await modal(page).getByRole("button", { name: "Publish" }).click();
  await expectToast(page, /Document published/);
  await row(page, title).getByRole("button", { name: /New version/ }).click();
  await modal(page).getByLabel("What changed").fill("Updated PPE rules");
  await modal(page).getByRole("button", { name: "Publish" }).click();
  await expectToast(page, /Document published/);
  await expect(row(page, title)).toContainText("v2");
  await page.getByLabel("Show old versions").check();
  await expect(row(page, title).filter({ hasText: "v1" })).toContainText("superseded");
  await tab(page, "Statutory Reports");
  await page.getByRole("button", { name: "Generate Report" }).click();
  await modal(page).getByLabel("Report").selectOption("research_activity");
  await modal(page).getByRole("button", { name: "Generate" }).click();
  await expectToast(page, "Report generated and filed.");
  await row(page, "Research activity").first().click();
  await expect(modal(page).getByText(/active grants/i)).toBeVisible();
});

test("devices: register a lab door, it reports over the API, access card and activity log", async ({ page }) => {
  await as(page, owner);
  await page.goto("/facilities");
  await tab(page, "Devices & Access");
  await page.getByRole("button", { name: "Register device" }).click();
  await modal(page).getByLabel("Device Name").fill(L("Lab door"));
  await modal(page).getByRole("button", { name: "Register" }).click();
  const key = (await modal(page).locator("button.font-mono").innerText()).trim();
  expect(key).toMatch(/^dev_[0-9a-f]{64}$/);
  await page.keyboard.press("Escape");

  // The device itself calls the public endpoint with its key (as real hardware would).
  const api = await request.newContext();
  const call = (event: string, payload: object) =>
    api.post(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/device_webhook`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "Content-Type": "application/json" },
      data: { p_key: key, p_event: event, p_payload: payload },
    });
  expect((await call("heartbeat", { temp: 21 })).status()).toBe(200);
  const denied = await (await call("access_request", { card_uid: `E2E-${RUN}` })).json();
  expect(denied).toEqual({ allow: false, reason: "unknown card" });
  const forged = await api.post(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/device_webhook`, {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "Content-Type": "application/json" },
    data: { p_key: "dev_forged", p_event: "heartbeat", p_payload: {} },
  });
  expect(forged.status(), "a wrong device key is rejected").toBeGreaterThanOrEqual(400);

  await page.getByRole("button", { name: "Assign card" }).click();
  await modal(page).getByLabel("Card Number (UID)").fill(`E2E-${RUN}`);
  await modal(page).getByLabel("Card Holder").selectOption({ label: teacher.name });
  await modal(page).getByRole("button", { name: "Assign" }).click();
  await expectToast(page, "Access card assigned.");
  const allowed = await (await call("access_request", { card_uid: `E2E-${RUN}` })).json();
  expect(allowed).toEqual({ allow: true, reason: "staff" });
  await api.dispose();

  await page.reload();
  await tab(page, "Devices & Access");
  await expect(row(page, L("Lab door")).first()).not.toContainText("never");
  await expect(page.getByText("denied — unknown card").first()).toBeVisible();
  await expect(page.getByText("allowed").first()).toBeVisible();
});

test("chat shows who is online right now", async ({ page, browser }) => {
  test.skip(onApp, "needs two independent browsers; presence is exercised by the web and desktop runs");
  const tCtx = await browser.newContext();
  const t = await tCtx.newPage();
  await login(t, teacher);
  await t.goto("/chat");
  await as(page, student);
  await page.goto("/chat");
  const teacherEntry = page.getByRole("button", { name: new RegExp(teacher.name) });
  await expect(teacherEntry).toContainText("online", { timeout: 20_000 });
  await tCtx.close();
  await expect(teacherEntry).not.toContainText("online", { timeout: 30_000 });
});
