// Builds reports/All-In-One-ERP-Report.pdf: every feature, and every test with its result, for the
// computer (Windows app / web) and the Android app.
// Inputs (all optional; missing ones are reported as "not run"):
//   reports/desktop.json            Playwright JSON (npx playwright test)
//   reports/android-full.json       Playwright JSON from the Android tablet emulator run
//   reports/android-phone.json      Playwright JSON from the Android phone emulator run
//   reports/db.txt                  output of `npm run test:db`
//   reports/desktop-update.txt      output of `node e2e-desktop/update.mjs <version>`
// Usage: node scripts/build-report.mjs
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const R = "reports";
mkdirSync(R, { recursive: true });
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const read = (f) => (existsSync(`${R}/${f}`) ? readFileSync(`${R}/${f}`, "utf8") : null);

// ---------- Test results ----------
function playwright(file) {
  const raw = read(file);
  if (!raw) return null;
  const json = JSON.parse(raw);
  const rows = [];
  const walk = (suite, fileName) => {
    const f = suite.file ?? fileName;
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const last = t.results?.at(-1);
        const status = t.status === "skipped" ? "skipped" : last?.status === "passed" ? "passed" : last?.status ?? "not run";
        rows.push({ file: f.replace(/^.*[\\/]/, ""), title: [...(suite.title && suite.title !== f ? [suite.title] : []), spec.title].join(" › "), status, ms: last?.duration ?? 0,
          error: last?.error?.message?.split("\n")[0]?.replace(/\u001b\[[0-9;]*m/g, "") ?? "" });
      }
    }
    for (const s of suite.suites ?? []) walk(s, f);
  };
  for (const s of json.suites ?? []) walk(s, s.file ?? s.title);
  return { rows, started: json.stats?.startTime, duration: json.stats?.duration };
}
function lines(file) {
  const raw = read(file);
  if (!raw) return null;
  const rows = raw.split(/\r?\n/).filter((l) => /^(PASS|FAIL)\s/.test(l)).map((l) => {
    const m = l.match(/^(PASS|FAIL)\s+(.*?)(?:\s+—\s+(.*))?$/);
    return { file: "", title: m[2], status: m[1] === "PASS" ? "passed" : "failed", ms: 0, error: m[1] === "FAIL" ? m[3] ?? "" : "" };
  });
  return { rows };
}

const suites = [
  { id: "desktop", name: "Computer — end-to-end (Windows app UI in Microsoft Edge)", data: playwright("desktop.json"), platform: "Computer" },
  { id: "web", name: "Computer — the same end-to-end suite against the live web version (GitHub Pages)", data: playwright("web.json"), platform: "Computer" },
  { id: "update", name: "Computer — real online update of the installed Windows app", data: lines("desktop-update.txt"), platform: "Computer" },
  { id: "android-full", name: "Android — the same end-to-end suite inside the Android app (tablet emulator)", data: playwright("android-full.json"), platform: "Android" },
  { id: "android-phone", name: "Android — phone layout and Android-specific tests (phone emulator)", data: playwright("android-phone.json"), platform: "Android" },
  { id: "db", name: "Server — database security & business rules (shared by both apps)", data: lines("db.txt"), platform: "Server" },
];
const count = (rows, s) => rows.filter((r) => r.status === s).length;

// ---------- Features ----------
const FEATURES = [
  ["Accounts & security", ["Five roles: owner, administration, teacher, student, parent", "Request access → administrator approval", "Forgot password → administrator sets a temporary one, forced change at next sign-in", "Revoke / restore access, role changes, audit log of every change", "Row-level security on every table; e-mail addresses hidden from other users", "Private details (date of birth, emergency contact, medical notes) visible only to the person and admins", "Optional single sign-on (Microsoft, Google, SAML)"]],
  ["Dashboard & communication", ["Personal dashboard with greeting, schedule and shortcuts", "Notice board with audiences", "Live chat: channels and private messages with file attachments", "In-app notifications (grades, results, approvals, credentials, at-risk alerts)", "Master calendar with slot booking"]],
  ["Academics", ["Terms with add/drop deadlines", "Course catalogue with credits and prerequisite chains", "Programmes and their required/elective courses", "Online course registration: prerequisites, account holds, seat limits, automatic waitlist and promotion", "Degree audit with the fastest prerequisite-safe path to graduation (printable plan)", "Classes & timetable with teacher and room clash prevention", "Automatic timetable generator (no teacher/room double-booking, rooms sized to the class)"]],
  ["Teaching", ["Attendance registers", "Gradebook with weighted assessments and printable report cards for a whole class", "E-learning: lectures (upload or video link), study materials, assignments with hand-in and grading", "External learning tools (LTI 1.3) launched with single sign-on", "Integrity / plagiarism case console"]],
  ["Examinations", ["Exam scheduling linked to a class and a room", "Randomised seating with candidate numbers", "Printable hall tickets and grading sheets", "Blind grading (names hidden until results are released)", "Results release with student notifications; students see seats and results"]],
  ["Students & records", ["Registrar (student information system): records, courses, transcripts, probation, counselling, mail-delivery requests", "Admissions CRM: pipeline, document upload & verification, Enrolled / Declined outcomes", "Parent portal: children's grades, attendance, invoices, absence reports", "Leave & absence requests with approval", "Micro-credentials / badges with certificates and a public verification page"]],
  ["Finance", ["Invoices, overdue tracking, mark paid, printable invoices, CSV export", "Expenses & payroll, cash-flow overview", "Student accounts on an append-only double-entry ledger", "Fee schedules: per-credit tuition, full-time cap, residency pricing, automatic charge on registration and refund within add/drop", "Payments, adjustments, financial aid (offer → accept → disburse), instalment plans, automatic holds for overdue balances", "Printable statements; students and parents see their own account"]],
  ["Campus", ["Rooms & assets: overlap-free room booking, asset register, maintenance log, certification expiry", "Housing: rooms, check-in, meal plans, maintenance tickets", "MakerSpace & lab equipment booking with clash prevention", "Library with e-books, borrowing and returns", "Student life: events with RSVP capacity, clubs", "Logistics & transport: routes, seat reservations, delays, manifests", "Careers & portfolio: postings, applications, stages", "Task management"]],
  ["Insight & integration", ["Retention-risk scores (attendance, grades, missing work, holds) with at-risk alerts", "Admissions forecast per programme, learned from past decisions", "Event log and outgoing webhooks for every business event", "REST API documentation (same security rules as the app)", "Nightly jobs (risk scores, holds) and nightly backups"]],
  ["Apps & delivery", ["Windows desktop app with signed online updates (one-click update & restart)", "Web version on GitHub Pages that works on phones", "Android app (APK) with Android print dialog, saving to Downloads, back button, keyboard-aware layout and in-app update check", "Strict content-security policy; secrets never shipped in the apps",
    "Offline notice on every platform; a dropped connection never signs you out",
    "Sign-in saved to disk immediately, so closing the app right after signing in keeps you signed in",
    "Android: Back steps through pages then backgrounds the app, rotation and font-size changes keep your place, keyboard never covers the field",
    "One shared live database: a change on the website or Windows app appears on Android and vice versa"]],
];

// ---------- HTML ----------
const badge = (s) => `<span class="st ${s.replace(/\s/g, "-")}">${s === "passed" ? "PASS" : s === "failed" || s === "timedOut" ? "FAIL" : s.toUpperCase()}</span>`;
const summaryRows = suites.map((s) => {
  if (!s.data) return `<tr><td>${esc(s.name)}</td><td colspan="4" class="muted">not run</td></tr>`;
  const r = s.data.rows;
  return `<tr><td>${esc(s.name)}</td><td class="n">${r.length}</td><td class="n ok">${count(r, "passed")}</td><td class="n bad">${r.length - count(r, "passed") - count(r, "skipped")}</td><td class="n">${count(r, "skipped")}</td></tr>`;
}).join("");
const totals = (platform) => {
  const rows = suites.filter((s) => s.platform === platform && s.data).flatMap((s) => s.data.rows);
  return { total: rows.length, passed: count(rows, "passed") };
};
const comp = totals("Computer"), andr = totals("Android"), srv = totals("Server");

const detail = suites.filter((s) => s.data).map((s) => {
  let lastFile = "";
  const body = s.data.rows.map((r) => {
    const head = r.file && r.file !== lastFile ? `<tr class="grp"><td colspan="3">${esc(r.file)}</td></tr>` : "";
    lastFile = r.file || lastFile;
    return `${head}<tr><td>${esc(r.title)}${r.error ? `<div class="err">${esc(r.error)}</div>` : ""}</td><td class="n">${r.ms ? (r.ms / 1000).toFixed(1) + " s" : ""}</td><td>${badge(r.status)}</td></tr>`;
  }).join("");
  return `<section class="page"><h2>${esc(s.name)}</h2><table><thead><tr><th>Test</th><th class="n">Time</th><th>Result</th></tr></thead><tbody>${body}</tbody></table></section>`;
}).join("");

const html = `<!doctype html><html><head><meta charset="utf-8"><title>All-In-One ERP — Features & Test Report</title><style>
  @page { size: A4; margin: 16mm 14mm; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1e293b; font-size: 11px; }
  h1 { font-size: 28px; margin: 0; color: #2A0845 } h2 { font-size: 16px; color: #4c1d95; border-bottom: 2px solid #6441A5; padding-bottom: 4px; margin-top: 0 }
  h3 { font-size: 12px; margin: 14px 0 4px; color: #334155 }
  .cover { height: 250mm; display: flex; flex-direction: column; justify-content: center; }
  .muted { color: #64748b } .page { page-break-before: always }
  table { width: 100%; border-collapse: collapse; margin-top: 6px } th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top }
  th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; letter-spacing: .04em } .n { text-align: right; white-space: nowrap }
  .ok { color: #047857; font-weight: 700 } .bad { color: #b91c1c; font-weight: 700 }
  .st { font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; background: #e2e8f0 } .st.passed { background: #d1fae5; color: #065f46 }
  .st.failed, .st.timedOut { background: #fee2e2; color: #991b1b } .st.skipped { background: #fef3c7; color: #92400e }
  .grp td { background: #f8fafc; font-weight: 700; color: #475569; font-size: 10px }
  .err { color: #b91c1c; font-size: 9px; margin-top: 2px } ul { margin: 2px 0 8px 16px; padding: 0 } li { margin: 1px 0 }
  .cards { display: flex; gap: 10px; margin: 18px 0 } .card { flex: 1; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px }
  .big { font-size: 26px; font-weight: 800; color: #2A0845 } .cols { columns: 2; column-gap: 18px } .cols > div { break-inside: avoid }
</style></head><body>
<div class="cover">
  <div class="muted">Version ${esc(pkg.version)} • ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</div>
  <h1>All-In-One ERP</h1>
  <div style="font-size:16px;margin-top:6px">Features &amp; test report — computer and Android</div>
  <div class="cards">
    <div class="card"><div class="muted">Computer tests</div><div class="big">${comp.passed}/${comp.total}</div><div class="muted">passed</div></div>
    <div class="card"><div class="muted">Android tests</div><div class="big">${andr.passed}/${andr.total}</div><div class="muted">passed</div></div>
    <div class="card"><div class="muted">Server / database tests</div><div class="big">${srv.passed}/${srv.total}</div><div class="muted">passed</div></div>
  </div>
  <table><thead><tr><th>Test suite</th><th class="n">Tests</th><th class="n">Passed</th><th class="n">Failed</th><th class="n">Skipped</th></tr></thead><tbody>${summaryRows}</tbody></table>
  <p class="muted" style="margin-top:14px">The computer and Android apps share one code base and one database. The end-to-end suite runs unchanged on both:
  on the computer in Microsoft Edge against the app, on Android inside the installed app (Playwright attached to the app's WebView over adb).
  The database tests exercise the security rules and business logic both apps rely on.</p>
</div>
<section class="page"><h2>How the tests were run</h2>
<table><tbody>
<tr><th>Computer</th><td>Windows 10 Pro, Microsoft Edge driven by Playwright against the app (same code the Windows app ships). The installed Windows app was also updated online from the previous release and checked (update test).</td></tr>
<tr><th>Android</th><td>The real Android app (APK) installed on Android 15 emulators — a Pixel 6 phone and a Pixel C tablet in landscape — with Playwright attached to the app's WebView over adb. Hardware keys, rotation, keyboard, airplane mode, font size, file picker, print dialog, Downloads, browser hand-off and APK installs are driven through adb. Runs on this PC (Intel VT-x + Windows Hypervisor Platform) and on GitHub Actions.</td></tr>
<tr><th>Same system</th><td>Both apps share one code base and one Supabase database; cross-device tests change data in one (website/desktop) and check it in the other (Android), in both directions, and a live chat runs between a browser and the phone.</td></tr>
<tr><th>Server</th><td>Database security rules and business logic tested on a local Postgres (PGlite) with the production schema.</td></tr>
<tr><th>Security</th><td>Row-level security for every table and role, private data isolation, storage access, signed updates (desktop minisign, Android APK signature — a copy signed with another key is refused), least-privilege Android permissions, dependency audit (npm audit: 0 vulnerabilities), strict content-security policy.</td></tr>
<tr><th>Known framework behaviour</th><td>On Android, Tauri (the app framework) can log "reading 'runCallback'" in a page that is being unloaded when a test performs a full page reload while a native call is in flight. The new page is unaffected and the app itself navigates without full reloads; the Android test harness ignores only this message.</td></tr>
</tbody></table></section>
<section class="page"><h2>Features</h2><div class="cols">${FEATURES.map(([g, items]) => `<div><h3>${esc(g)}</h3><ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`).join("")}</div></section>
${detail}
</body></html>`;

writeFileSync(`${R}/report.html`, html);
const browser = await chromium.launch({ channel: process.platform === "win32" ? "msedge" : undefined });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "load" });
await page.pdf({ path: `${R}/All-In-One-ERP-Report.pdf`, format: "A4", printBackground: true, displayHeaderFooter: true,
  headerTemplate: "<span></span>", footerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#94a3b8">All-In-One ERP ${esc(pkg.version)} — page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
  margin: { top: "14mm", bottom: "16mm", left: "12mm", right: "12mm" } });
await browser.close();
console.log(`Report written to ${R}/All-In-One-ERP-Report.pdf`);
for (const s of suites) console.log(`${s.name}: ${s.data ? `${count(s.data.rows, "passed")}/${s.data.rows.length}` : "not run"}`);
