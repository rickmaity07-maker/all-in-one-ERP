// Removes everything the automated tests create: records labelled "E2E …", test accounts
// (e2e.*@… except the E2E Test Owner) and files they uploaded. Real data is never matched.
// Usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/cleanup-e2e.mjs
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}
const h = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };
const api = (path, init = {}) => fetch(`${url}${path}`, { ...init, headers: { ...h, ...(init.headers ?? {}) } });

// table → column holding the test label
const LABELLED = {
  classes: "name", announcements: "title", course_materials: "title", exams: "course_name", integrity_flags: "assessment",
  invoices: "description", expenses: "description", maintenance_tickets: "issue_title", housing_rooms: "building",
  lab_equipment: "name", career_postings: "title", portfolio_items: "title", library_books: "title", clubs: "name",
  campus_events: "title", transport_routes: "name", calendar_events: "event_title", tasks: "task_title",
  admissions: "applicant_name", leave_requests: "reason", registrar_records: "student_name", chat_messages: "message",
  reservations: "title", assets: "name", badges: "name", fee_schedules: "name", lti_tools: "name", webhook_endpoints: "url",
  purchase_orders: "vendor", grants: "title", campaigns: "name", institutional_documents: "title", devices: "name", access_cards: "card_uid",
};

let total = 0;
const users = (await (await api("/auth/v1/admin/users?per_page=1000")).json()).users ?? [];
const testUsers = users.filter((u) => /^e2e\./.test(u.email ?? "") && u.email !== process.env.E2E_OWNER_EMAIL && !/^e2e\.owner@/.test(u.email));
// Billing rows of test students (the ledger is append-only for everyone except the service role).
for (const u of testUsers) {
  for (const acct of await (await api(`/rest/v1/student_accounts?student_id=eq.${u.id}&select=id`)).json()) {
    await api(`/rest/v1/ledger_entries?account_id=eq.${acct.id}`, { method: "DELETE" });
    await api(`/rest/v1/payment_plans?account_id=eq.${acct.id}`, { method: "DELETE" });
    await api(`/rest/v1/student_accounts?id=eq.${acct.id}`, { method: "DELETE" });
  }
}
for (const [table, col] of Object.entries(LABELLED)) {
  const res = await api(`/rest/v1/${table}?${col}=ilike.*E2E*`, { method: "DELETE" });
  const rows = res.ok ? await res.json() : [];
  if (rows.length) console.log(`${table.padEnd(22)} ${rows.length} removed`);
  total += rows.length;
}
// Catalogue rows (after the classes, exams and ledger entries that point at them).
for (const [table, col] of [["courses", "title"], ["programs", "name"], ["terms", "name"], ["facilities", "name"], ["departments", "name"]]) {
  const res = await api(`/rest/v1/${table}?${col}=ilike.*E2E*`, { method: "DELETE" });
  const rows = res.ok ? await res.json() : [];
  if (!res.ok) console.log(`${table}: ${await res.text()}`);
  if (rows.length) console.log(`${table.padEnd(22)} ${rows.length} removed`);
  total += rows.length;
}
// Chat messages from test runs that don't carry the label.
for (const pattern of ["Hello from the teacher*", "handout-*", "*📎 handout*"]) {
  const res = await api(`/rest/v1/chat_messages?message=like.${encodeURIComponent(pattern)}`, { method: "DELETE" });
  if (res.ok) total += (await res.json()).length;
}

// Test accounts (keeps the E2E Test Owner, which the tests sign in with).
for (const u of testUsers) {
  for (const [table, col] of [["alumni_donations", "alumni_id"], ["purchase_orders", "requester_id"], ["effort_certifications", "person_id"],
    ["labor_distributions", "faculty_id"], ["sabbaticals", "faculty_id"], ["faculty_dossiers", "faculty_id"], ["access_cards", "user_id"], ["aid_awards", "student_id"], ["badge_awards", "student_id"], ["exam_candidates", "student_id"], ["user_metadata", "user_id"],
    ["student_risk_scores", "student_id"], ["reservations", "user_id"], ["notifications", "user_id"], ["guardian_links", "guardian_id"], ["guardian_links", "student_id"], ["class_enrollments", "student_id"],
    ["attendance", "student_id"], ["grades", "student_id"], ["assignment_submissions", "student_id"], ["leave_requests", "requester_id"],
    ["housing_assignments", "resident_id"], ["meal_accounts", "profile_id"], ["password_reset_requests", "profile_id"], ["profiles", "id"]]) {
    await api(`/rest/v1/${table}?${col}=eq.${u.id}`, { method: "DELETE" });
  }
  await api(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
  console.log(`account removed: ${u.email}`);
}

// Stored files no longer referenced by any record.
const refs = new Set();
for (const [t, c] of [["course_materials", "file_path"], ["library_books", "file_path"], ["assignment_submissions", "file_path"], ["chat_messages", "attachment_path"]]) {
  for (const r of await (await api(`/rest/v1/${t}?select=${c}&${c}=not.is.null`)).json()) refs.add(r[c]);
}
for (const r of await (await api("/rest/v1/admissions?select=documents")).json()) for (const d of r.documents ?? []) refs.add(d.path);
async function list(bucket, prefix = "") {
  const out = [];
  const items = await (await api(`/storage/v1/object/list/${bucket}`, { method: "POST", body: JSON.stringify({ prefix, limit: 1000 }) })).json();
  for (const it of items) {
    const p = prefix ? `${prefix}/${it.name}` : it.name;
    if (it.id) out.push(p);
    else out.push(...(await list(bucket, p)));
  }
  return out;
}
for (const bucket of ["course-files", "library-files", "chat-files", "admission-docs", "submissions"]) {
  const orphans = (await list(bucket)).filter((p) => !refs.has(p));
  if (orphans.length) {
    await api(`/storage/v1/object/${bucket}`, { method: "DELETE", body: JSON.stringify({ prefixes: orphans }) });
    console.log(`${bucket.padEnd(15)} ${orphans.length} orphaned file(s) removed`);
  }
}
console.log(`Done. ${total} test records removed.`);
