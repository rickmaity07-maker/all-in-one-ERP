// Dry-runs supabase/schema.sql in embedded Postgres with a minimal Supabase stub,
// then security-tests the row-level security rules as different users.
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync } from "node:fs";

const schema = readFileSync(process.argv[2] ?? new URL("../schema.sql", import.meta.url), "utf8");
const db = new PGlite({ extensions: { btree_gist } });

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb, encrypted_password text, updated_at timestamptz);
  create schema extensions;
  create function extensions.gen_salt(text) returns text language sql as $$ select 'salt' $$;
  create function extensions.crypt(text, text) returns text language sql as $$ select 'hash:' || $1 $$;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid default auth.uid());
  alter table storage.objects enable row level security;
  create publication supabase_realtime;
  grant usage on schema public, auth, storage to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant all on storage.objects to authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
`);

let failures = 0;
const results = [];
const check = (name, ok, detail = "") => {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
};

// 1. Schema runs, and runs again (idempotent)
for (const run of [1, 2]) {
  try {
    await db.exec(schema);
    check(`schema.sql executes (run ${run})`, true);
  } catch (e) {
    check(`schema.sql executes (run ${run})`, false, e.message);
    console.log(results.join("\n"));
    process.exit(1);
  }
}

const ids = {
  owner: "00000000-0000-0000-0000-000000000001",
  admin: "00000000-0000-0000-0000-000000000002",
  teacher: "00000000-0000-0000-0000-000000000003",
  alice: "00000000-0000-0000-0000-000000000004",
  bob: "00000000-0000-0000-0000-000000000005",
  eve: "00000000-0000-0000-0000-000000000006",
};
for (const [name, id] of Object.entries(ids)) {
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `${name}@test.local`, { full_name: name }]);
}
const roles = Object.fromEntries((await db.query(`select full_name, role from public.profiles`)).rows.map((r) => [r.full_name, r.role]));
check("first sign-up becomes owner", roles.owner === "owner", JSON.stringify(roles));
check("later sign-ups become students", ["admin", "teacher", "alice", "bob", "eve"].every((n) => roles[n] === "student"));
{
  const p = (await db.query(`select full_name, active, pending from public.profiles`)).rows;
  check("owner is active immediately", p.find((x) => x.full_name === "owner")?.active === true);
  check("later sign-ups wait for approval (inactive + pending)", p.filter((x) => x.full_name !== "owner").every((x) => x.active === false && x.pending === true), JSON.stringify(p));
}
// Administrators approve everyone for the remaining tests.
await db.exec(`update public.profiles set active = true, pending = false`);

// Superuser setup (like the SQL editor)
await db.exec(`
  update public.profiles set role = 'administration' where id = '${ids.admin}';
  update public.profiles set role = 'teacher' where id = '${ids.teacher}';
  insert into public.invoices (student_name, description, amount, student_id) values
    ('alice', 'Tuition', 1000, '${ids.alice}'), ('bob', 'Tuition', 2000, '${ids.bob}');
  insert into public.admissions (applicant_name, program) values ('Secret Applicant', 'MSc');
  insert into public.registrar_records (student_name, major, gpa, profile_id) values ('alice', 'Mech', 3.1, '${ids.alice}'), ('bob', 'Mech', 1.9, '${ids.bob}');
  insert into public.library_books (title, copies_total, copies_available) values ('Only Copy', 1, 1);
  insert into public.chat_messages (sender_id, sender_name, message, channel) values
    ('${ids.alice}', 'alice', 'private hi', 'dm:${ids.alice}:${ids.bob}'),
    ('${ids.teacher}', 'teacher', 'staff only', 'faculty-lounge'),
    ('${ids.alice}', 'alice', 'hello all', 'general');
`);

// Run a statement as a given user (or anon when id is null).
async function as(id, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${id ?? ""}', false);`);
  await db.exec(id ? "set role authenticated" : "set role anon");
  try {
    return { rows: (await db.query(sql, params)).rows, error: null };
  } catch (e) {
    return { rows: [], error: e.message };
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);");
  }
}
const count = async (id, sql) => (await as(id, sql)).rows.length;

// --- Privilege escalation ---
let r = await as(ids.alice, `update public.profiles set role = 'owner' where id = $1 returning id`, [ids.alice]);
check("student cannot make themselves owner", !!r.error, r.error ?? "update succeeded!");
r = await as(ids.alice, `update public.profiles set full_name = 'Alice A' where id = $1 returning id`, [ids.alice]);
check("student can rename themselves", !r.error && r.rows.length === 1, r.error ?? "");
r = await as(ids.alice, `update public.profiles set full_name = 'hacked' where id = $1 returning id`, [ids.bob]);
check("student cannot edit another profile", r.rows.length === 0, r.error ?? "");
r = await as(ids.admin, `update public.profiles set role = 'owner' where id = $1 returning id`, [ids.alice]);
check("administration cannot grant owner", !!r.error, r.error ?? "succeeded!");
r = await as(ids.admin, `update public.profiles set role = 'student' where id = $1 returning id`, [ids.owner]);
check("administration cannot demote the owner", !!r.error, r.error ?? "succeeded!");
r = await as(ids.admin, `update public.profiles set role = 'teacher' where id = $1 returning id`, [ids.eve]);
check("administration can change a student to teacher", !r.error && r.rows.length === 1, r.error ?? "");
await as(ids.admin, `update public.profiles set role = 'student' where id = $1`, [ids.eve]);
r = await as(ids.alice, `insert into public.profiles (id, full_name, role) values (gen_random_uuid(), 'fake', 'owner') returning id`);
check("student cannot insert an owner profile", !!r.error || r.rows.length === 0, r.error ?? "");

// --- Admin-only data ---
check("student cannot read admissions", (await count(ids.alice, "select * from public.admissions")) === 0);
check("teacher cannot read admissions", (await count(ids.teacher, "select * from public.admissions")) === 0);
check("admin can read admissions", (await count(ids.admin, "select * from public.admissions")) === 1);
r = await as(ids.alice, `insert into public.admissions (applicant_name) values ('x')`);
check("student cannot insert admissions", !!r.error, r.error ?? "");
check("student cannot read expenses", (await count(ids.alice, "select * from public.expenses")) === 0);

// --- Invoices ---
r = await as(ids.alice, "select student_name from public.invoices");
check("student sees only own invoices", r.rows.length === 1 && r.rows[0].student_name === "alice", JSON.stringify(r.rows));
r = await as(ids.alice, `update public.invoices set status = 'Paid' returning id`);
check("student cannot mark invoices paid", r.rows.length === 0, r.error ?? "");
check("teacher cannot read invoices", (await count(ids.teacher, "select * from public.invoices")) === 0);
check("admin reads all invoices", (await count(ids.admin, "select * from public.invoices")) === 2);

// --- Registrar ---
r = await as(ids.alice, "select student_name from public.registrar_records");
check("student sees only own academic record", r.rows.length === 1 && r.rows[0].student_name === "alice", JSON.stringify(r.rows));
r = await as(ids.alice, `update public.registrar_records set gpa = 4.0 returning id`);
check("student cannot change own GPA", r.rows.length === 0, r.error ?? "");

// --- Audit log ---
check("student cannot read audit log", (await count(ids.alice, "select * from public.audit_log")) === 0);
check("owner can read audit log", (await count(ids.owner, "select * from public.audit_log")) > 0);
r = await as(ids.admin, `delete from public.audit_log returning id`);
check("admin cannot erase the audit log", r.rows.length === 0, r.error ?? "");

// --- Chat privacy ---
check("DM visible to participant", (await count(ids.bob, `select * from public.chat_messages where channel like 'dm:%'`)) === 1);
check("DM hidden from outsider", (await count(ids.eve, `select * from public.chat_messages where channel like 'dm:%'`)) === 0);
check("faculty-lounge hidden from students", (await count(ids.alice, `select * from public.chat_messages where channel = 'faculty-lounge'`)) === 0);
check("faculty-lounge visible to teachers", (await count(ids.teacher, `select * from public.chat_messages where channel = 'faculty-lounge'`)) === 1);
r = await as(ids.eve, `insert into public.chat_messages (sender_id, sender_name, message, channel) values ($1, 'alice', 'spoof', 'general')`, [ids.alice]);
check("cannot post as another user", !!r.error, r.error ?? "");
r = await as(ids.eve, `insert into public.chat_messages (sender_id, sender_name, message, channel) values ($1, 'eve', 'x', $2)`, [ids.eve, `dm:${ids.alice}:${ids.bob}`]);
check("cannot inject into someone else's DM", !!r.error, r.error ?? "");
r = await as(ids.eve, `delete from public.chat_messages where sender_id = $1 returning id`, [ids.alice]);
check("cannot delete others' messages", r.rows.length === 0, r.error ?? "");

// --- Tickets ---
r = await as(ids.alice, `insert into public.maintenance_tickets (issue_title, reported_by) values ('leak', $1) returning id`, [ids.alice]);
check("student can file a ticket", !r.error, r.error ?? "");
r = await as(ids.alice, `insert into public.maintenance_tickets (issue_title, reported_by) values ('fake', $1) returning id`, [ids.bob]);
check("student cannot file a ticket as someone else", !!r.error, r.error ?? "");
r = await as(ids.bob, `delete from public.maintenance_tickets returning id`);
check("student cannot delete others' tickets", r.rows.length === 0, r.error ?? "");
r = await as(ids.alice, `update public.maintenance_tickets set status = 'Resolved' returning id`);
check("student cannot resolve tickets", r.rows.length === 0, r.error ?? "");

// --- Library ---
const bookId = (await db.query(`select id from public.library_books`)).rows[0].id;
r = await as(ids.alice, `insert into public.library_loans (book_id, borrower_id, due_date) values ($1, $2, current_date + 21) returning id`, [bookId, ids.alice]);
check("student can borrow an available book", !r.error, r.error ?? "");
check("copies_available decremented", (await db.query(`select copies_available from public.library_books`)).rows[0].copies_available === 0);
r = await as(ids.bob, `insert into public.library_loans (book_id, borrower_id, due_date) values ($1, $2, current_date + 21)`, [bookId, ids.bob]);
check("cannot borrow when no copies left", !!r.error, r.error ?? "");
r = await as(ids.alice, `update public.library_loans set returned_at = now() returning id`);
check("student cannot self-check-in a loan", r.rows.length === 0, r.error ?? "");
r = await as(ids.alice, `update public.library_books set copies_available = 99 returning id`);
check("student cannot edit catalog", r.rows.length === 0, r.error ?? "");

// --- Teachers ---
r = await as(ids.teacher, `insert into public.course_materials (title, file_type) values ('Lecture 1', 'Video') returning id`);
check("teacher can publish materials", !r.error, r.error ?? "");
r = await as(ids.alice, `insert into public.course_materials (title, file_type) values ('spam', 'PDF')`);
check("student cannot publish materials", !!r.error, r.error ?? "");
r = await as(ids.alice, `delete from public.course_materials returning id`);
check("student cannot delete materials", r.rows.length === 0, r.error ?? "");


// --- Insert tampering / impersonation ---
const matId = (await db.query(`select id from public.course_materials limit 1`)).rows[0].id;
r = await as(ids.alice, `insert into public.assignment_submissions (material_id, student_id, student_name, grade) values ($1, $2, 'bob', 'A+') returning grade, student_name`, [matId, ids.alice]);
check("student cannot pre-grade own submission", !r.error && r.rows[0]?.grade === null, JSON.stringify(r.rows) + (r.error ?? ""));
check("submission name forced to real name", r.rows[0]?.student_name === "Alice A", JSON.stringify(r.rows));
await db.exec(`insert into public.career_postings (title, company) values ('Intern', 'ACME')`);
const postId = (await db.query(`select id from public.career_postings limit 1`)).rows[0].id;
r = await as(ids.alice, `insert into public.career_applications (posting_id, applicant_id, status) values ($1, $2, 'Offer') returning status`, [postId, ids.alice]);
check("student cannot self-award an offer", r.rows[0]?.status === "Submitted", JSON.stringify(r.rows) + (r.error ?? ""));
await db.exec(`insert into public.library_books (title, copies_total, copies_available) values ('Second', 2, 2)`);
const book2 = (await db.query(`select id from public.library_books where title = 'Second'`)).rows[0].id;
r = await as(ids.bob, `insert into public.library_loans (book_id, borrower_id, due_date) values ($1, $2, '2099-01-01') returning due_date, returned_at`, [book2, ids.bob]);
const due = r.rows[0] && new Date(r.rows[0].due_date);
check("student cannot extend loan to 2099", !!due && due.getFullYear() < 2030, JSON.stringify(r.rows) + (r.error ?? ""));
r = await as(ids.bob, `insert into public.chat_messages (sender_id, sender_name, message, channel) values ($1, 'The Principal', 'fake', 'general') returning sender_name`, [ids.bob]);
check("chat sender name cannot be faked", r.rows[0]?.sender_name === "bob", JSON.stringify(r.rows) + (r.error ?? ""));
r = await as(ids.alice, `insert into public.maintenance_tickets (issue_title, reported_by, status) values ('t', $1, 'Resolved') returning status`, [ids.alice]);
check("student ticket always starts Open", r.rows[0]?.status === "Open", JSON.stringify(r.rows) + (r.error ?? ""));
r = await as(ids.admin, `insert into public.library_loans (book_id, borrower_id, borrower_name, due_date) values ($1, $2, 'bob', current_date + 60) returning borrower_name`, [book2, ids.bob]);
check("staff can still issue loans on behalf of others", r.rows[0]?.borrower_name === "bob", JSON.stringify(r.rows) + (r.error ?? ""));

// --- DM attachments ---
const dmFolder = `dm_${ids.alice}_${ids.bob}`;
r = await as(ids.alice, `insert into storage.objects (bucket_id, name) values ('chat-files', $1)`, [dmFolder + "/secret.pdf"]);
check("DM participant can attach a file", !r.error, r.error ?? "");
check("DM file visible to other participant", (await count(ids.bob, `select * from storage.objects where bucket_id = 'chat-files' and name like 'dm%'`)) === 1);
check("DM file hidden from outsiders", (await count(ids.admin, `select * from storage.objects where bucket_id = 'chat-files' and name like 'dm%'`)) === 0);
r = await as(ids.teacher, `insert into storage.objects (bucket_id, name) values ('chat-files', $1)`, [dmFolder + "/inject.pdf"]);
check("outsider cannot drop files into a DM", !!r.error, r.error ?? "");
r = await as(ids.alice, `insert into storage.objects (bucket_id, name) values ('chat-files', 'faculty-lounge/x.pdf')`);
check("student cannot upload to faculty-lounge", !!r.error, r.error ?? "");


// --- Teaching: classes, attendance, gradebook, announcements, leave ---
{
  const teacher2 = "00000000-0000-0000-0000-000000000007";
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 't2@test.local', '{"full_name":"teacher2"}')`, [teacher2]);
  await db.exec(`update public.profiles set role = 'teacher', active = true, pending = false where id = '${teacher2}'`);

  r = await as(ids.teacher, `insert into public.classes (name, teacher_id) values ('Robotics', $1) returning id, teacher_id, teacher_name`, [teacher2]);
  const classId = r.rows[0]?.id;
  check("teacher creates a class (owner forced to self)", r.rows[0]?.teacher_id === ids.teacher && r.rows[0]?.teacher_name === "teacher", JSON.stringify(r.rows) + (r.error ?? ""));
  r = await as(ids.alice, `insert into public.classes (name) values ('Fake class')`);
  check("student cannot create classes", !!r.error, r.error ?? "");
  r = await as(ids.teacher, `update public.classes set teacher_id = $1 where id = $2 returning id`, [teacher2, classId]);
  check("teacher cannot hand class to another teacher", !!r.error, r.error ?? "");

  r = await as(ids.teacher, `insert into public.class_enrollments (class_id, student_id, student_name) values ($1, $2, 'alice'), ($1, $3, 'bob') returning id`, [classId, ids.alice, ids.bob]);
  check("teacher enrolls students in own class", r.rows.length === 2, r.error ?? "");
  r = await as(teacher2, `insert into public.class_enrollments (class_id, student_id) values ($1, $2)`, [classId, ids.eve]);
  check("other teacher cannot enroll into someone else's class", !!r.error, r.error ?? "");

  r = await as(ids.teacher, `insert into public.attendance (class_id, student_id, session_date, status) values ($1, $2, current_date, 'Absent'), ($1, $3, current_date, 'Present') returning id`, [classId, ids.alice, ids.bob]);
  check("teacher takes attendance for own class", r.rows.length === 2, r.error ?? "");
  r = await as(teacher2, `update public.attendance set status = 'Present' where class_id = $1 returning id`, [classId]);
  check("other teacher cannot change that attendance", r.rows.length === 0, r.error ?? "");
  r = await as(ids.alice, `update public.attendance set status = 'Present' where student_id = $1 returning id`, [ids.alice]);
  check("student cannot mark themselves present", r.rows.length === 0, r.error ?? "");
  check("student sees only own attendance", (await count(ids.alice, `select * from public.attendance`)) === 1);

  r = await as(ids.teacher, `insert into public.assessments (class_id, title, max_points, weight) values ($1, 'Midterm', 50, 2) returning id`, [classId]);
  const assessId = r.rows[0]?.id;
  check("teacher adds an assessment", !!assessId, r.error ?? "");
  check("enrolled student can see class assessments", (await count(ids.alice, `select * from public.assessments`)) === 1);
  check("non-enrolled student cannot see them", (await count(ids.eve, `select * from public.assessments`)) === 0);
  r = await as(ids.teacher, `insert into public.grades (assessment_id, student_id, score) values ($1, $2, 41), ($1, $3, 22) returning id`, [assessId, ids.alice, ids.bob]);
  check("teacher enters grades", r.rows.length === 2, r.error ?? "");
  r = await as(teacher2, `update public.grades set score = 50 returning id`);
  check("other teacher cannot change those grades", r.rows.length === 0, r.error ?? "");
  r = await as(ids.alice, `update public.grades set score = 50 where student_id = $1 returning id`, [ids.alice]);
  check("student cannot change own grade", r.rows.length === 0, r.error ?? "");
  r = await as(ids.alice, `insert into public.grades (assessment_id, student_id, score) values ($1, $2, 50)`, [assessId, ids.eve]);
  check("student cannot insert grades", !!r.error, r.error ?? "");
  r = await as(ids.alice, `select score from public.grades`);
  check("student sees only own grades", r.rows.length === 1 && Number(r.rows[0].score) === 41, JSON.stringify(r.rows));
  check("admin can manage any class grades", (await as(ids.admin, `update public.grades set comment = 'ok' returning id`)).rows.length === 2);

  r = await as(ids.teacher, `insert into public.announcements (title, audience, author_name) values ('Staff meeting', 'staff', 'The Principal') returning author_name`);
  check("announcement author forced to real name", r.rows[0]?.author_name === "teacher", JSON.stringify(r.rows) + (r.error ?? ""));
  await as(ids.teacher, `insert into public.announcements (title, audience) values ('Exam week', 'students')`);
  check("staff-only announcement hidden from students", (await count(ids.alice, `select * from public.announcements where audience = 'staff'`)) === 0);
  check("student announcement visible to students", (await count(ids.alice, `select * from public.announcements where audience = 'students'`)) === 1);
  r = await as(ids.alice, `insert into public.announcements (title) values ('spam')`);
  check("students cannot post announcements", !!r.error, r.error ?? "");
  r = await as(teacher2, `delete from public.announcements returning id`);
  check("teachers cannot delete others' announcements", r.rows.length === 0, r.error ?? "");

  r = await as(ids.teacher, `insert into public.leave_requests (start_date, end_date, status) values (current_date, current_date + 2, 'Approved') returning status`);
  check("leave cannot be self-approved", r.rows[0]?.status === "Pending", JSON.stringify(r.rows) + (r.error ?? ""));
  r = await as(ids.teacher, `update public.leave_requests set status = 'Approved' returning id`);
  check("teacher cannot approve own leave", r.rows.length === 0, r.error ?? "");
  check("others cannot read someone's leave", (await count(ids.alice, `select * from public.leave_requests`)) === 0);
  r = await as(ids.admin, `update public.leave_requests set status = 'Approved' returning id`);
  check("admin approves leave", r.rows.length === 1, r.error ?? "");
}


// --- Privacy: email addresses ---
r = await as(ids.alice, `select email from public.profiles`);
check("students cannot read anyone's email address", !!r.error, r.error ?? JSON.stringify(r.rows));
r = await as(ids.alice, `select id, full_name, role from public.profiles`);
check("students can still see the name directory", !r.error && r.rows.length > 0, r.error ?? "");
r = await as(ids.alice, `select * from public.admin_list_profiles()`);
check("students cannot call the admin directory", !!r.error, r.error ?? "");
r = await as(ids.admin, `select email from public.admin_list_profiles() where email is not null`);
check("admins see email addresses", !r.error && r.rows.length > 0, r.error ?? "");

// --- Account approval ---
await db.exec(`update public.profiles set pending = true, active = false where id = '${ids.eve}'`);
r = await as(ids.eve, `update public.profiles set pending = false, active = true where id = $1 returning id`, [ids.eve]);
await db.exec(`update public.profiles set pending = false, active = true where id = '${ids.eve}'`);
check("users cannot approve themselves", !!r.error, r.error ?? "");
r = await as(ids.alice, `update public.profiles set email = 'hijack@x.com' where id = $1 returning id`, [ids.alice]);
check("users cannot change their own email on the profile", !!r.error, r.error ?? "");

// --- Password resets ---
r = await as(null, `select public.request_password_reset('alice@test.local')`);
check("anyone can request a password reset from the login screen", !r.error, r.error ?? "");
await as(null, `select public.request_password_reset('alice@test.local')`);
await as(null, `select public.request_password_reset('nobody@nowhere.com')`);
const resetRows = (await db.query(`select email from public.password_reset_requests`)).rows;
check("reset requests are rate-limited and ignore unknown emails", resetRows.length === 1, JSON.stringify(resetRows));
check("students cannot see reset requests", (await count(ids.bob, `select * from public.password_reset_requests`)) === 0);
check("admins see reset requests", (await count(ids.admin, `select * from public.password_reset_requests`)) === 1);
r = await as(ids.bob, `select public.admin_reset_password($1, 'Hacked-123')`, [ids.alice]);
check("students cannot reset passwords", !!r.error, r.error ?? "");
r = await as(ids.admin, `select public.admin_reset_password($1, 'short')`, [ids.alice]);
check("temporary password must be 8+ characters", !!r.error, r.error ?? "");
r = await as(ids.admin, `select public.admin_reset_password($1, 'Temp-Pass-123')`, [ids.owner]);
check("administration cannot reset the owner's password", !!r.error, r.error ?? "");
r = await as(ids.admin, `select public.admin_reset_password($1, 'Temp-Pass-123')`, [ids.alice]);
const pw = (await db.query(`select u.encrypted_password, p.must_change_password from auth.users u join public.profiles p on p.id = u.id where u.id = $1`, [ids.alice])).rows[0];
check("admin resets a student's password", !r.error && pw.encrypted_password === "hash:Temp-Pass-123", r.error ?? JSON.stringify(pw));
check("user must change the temporary password", pw.must_change_password === true);
check("reset request marked resolved", (await db.query(`select 1 from public.password_reset_requests where resolved_at is null`)).rows.length === 0);
r = await as(ids.alice, `update public.profiles set must_change_password = false where id = $1 returning id`, [ids.alice]);
check("user clears the flag after changing password", !r.error && r.rows.length === 1, r.error ?? "");

// --- Parents ---
{
  const parent = "00000000-0000-0000-0000-000000000009";
  const teacher2 = "00000000-0000-0000-0000-000000000007";
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'parent@test.local', '{"full_name":"Parent P"}')`, [parent]);
  await db.exec(`update public.profiles set role = 'parent', active = true, pending = false where id = '${parent}'`);
  r = await as(ids.alice, `insert into public.guardian_links (guardian_id, student_id) values ($1, $2)`, [parent, ids.alice]);
  check("students cannot link themselves to parents", !!r.error, r.error ?? "");
  r = await as(ids.admin, `insert into public.guardian_links (guardian_id, student_id, relationship) values ($1, $2, 'Mother') returning id`, [parent, ids.alice]);
  check("admin links a parent to a child", !r.error, r.error ?? "");

  const cls = (await db.query(`select id from public.classes where name = 'Robotics'`)).rows[0].id;
  r = await as(parent, `select student_id from public.attendance`);
  check("parent sees their child's attendance only", r.rows.length > 0 && r.rows.every((x) => x.student_id === ids.alice), JSON.stringify(r.rows));
  r = await as(parent, `select student_id from public.grades`);
  check("parent sees their child's grades only", r.rows.length > 0 && r.rows.every((x) => x.student_id === ids.alice), JSON.stringify(r.rows));
  r = await as(parent, `select student_name from public.invoices`);
  check("parent sees their child's invoices only", r.rows.length === 1 && r.rows[0].student_name === "alice", JSON.stringify(r.rows));
  check("parent sees the child's class assessments", (await count(parent, `select * from public.assessments where class_id = '${cls}'`)) === 1);
  r = await as(parent, `insert into public.leave_requests (start_date, end_date, student_id, reason) values (current_date, current_date, $1, 'flu') returning student_name, requester_role`, [ids.alice]);
  check("parent files an absence note for their child", !r.error && r.rows[0]?.requester_role === "parent", r.error ?? JSON.stringify(r.rows));
  r = await as(parent, `insert into public.leave_requests (start_date, end_date, student_id) values (current_date, current_date, $1)`, [ids.bob]);
  check("parent cannot file notes for someone else's child", !!r.error, r.error ?? "");
  r = await as(parent, `update public.grades set score = 50 returning id`);
  check("parent cannot change grades", r.rows.length === 0, r.error ?? "");
  check("parent cannot see admissions", (await count(parent, `select * from public.admissions`)) === 0);

  // --- Notifications ---
  const aid = (await db.query(`select id from public.assessments where class_id = '${cls}'`)).rows[0].id;
  await as(ids.teacher, `update public.grades set score = 45 where assessment_id = $1 and student_id = $2`, [aid, ids.alice]);
  await as(ids.teacher, `insert into public.attendance (class_id, student_id, student_name, session_date, status) values ($1, $2, 'alice', current_date - 1, 'Absent')`, [cls, ids.alice]);
  r = await as(ids.alice, `select title from public.notifications`);
  check("student is notified of a new grade", r.rows.some((n) => n.title.startsWith("New grade")), JSON.stringify(r.rows));
  r = await as(parent, `select title from public.notifications`);
  check("parent is notified of grades and absences", r.rows.some((n) => /New grade/.test(n.title)) && r.rows.some((n) => /absent/.test(n.title)), JSON.stringify(r.rows));
  check("nobody can read someone else's notifications", (await count(ids.bob, `select * from public.notifications where user_id = '${ids.alice}'`)) === 0);
  r = await as(ids.bob, `insert into public.notifications (user_id, title) values ($1, 'fake')`, [ids.alice]);
  check("users cannot send fake notifications", !!r.error, r.error ?? "");
  await as(ids.teacher, `insert into public.announcements (title, body, audience) values ('Staff only memo', 'x', 'staff')`);
  check("staff-only notice does not notify students", (await count(ids.alice, `select * from public.notifications where title like '%Staff only memo%'`)) === 0);
  check("staff-only notice notifies admins", (await count(ids.admin, `select * from public.notifications where title like '%Staff only memo%'`)) === 1);
  await as(ids.bob, `insert into public.chat_messages (sender_id, message, channel) values ($1, 'hi alice', $2)`, [ids.bob, `dm:${ids.alice}:${ids.bob}`]);
  check("direct message notifies the recipient", (await count(ids.alice, `select * from public.notifications where title like 'Message from%'`)) === 1);
  r = await as(ids.alice, `update public.notifications set read_at = now() returning id`);
  check("users can mark their notifications read", r.rows.length > 0, r.error ?? "");

  // --- Room & teacher double-booking ---
  r = await as(ids.teacher, `insert into public.classes (name, room, days, start_time, end_time, term) values ('Physics', 'A-101', 'Mon,Wed', '09:00', '10:30', 'Fall') returning id`);
  check("teacher schedules a class in a room", !r.error, r.error ?? "");
  r = await as(teacher2, `insert into public.classes (name, room, days, start_time, end_time, term) values ('Chemistry', 'a-101 ', 'Wed', '10:00', '11:00', 'Fall')`);
  check("room double-booking is blocked", !!r.error && /A-101|a-101/i.test(r.error), r.error ?? "");
  r = await as(ids.teacher, `insert into public.classes (name, room, days, start_time, end_time, term) values ('Maths', 'B-2', 'Mon', '10:00', '11:00', 'Fall')`);
  check("teacher double-booking is blocked", !!r.error, r.error ?? "");
  r = await as(teacher2, `insert into public.classes (name, room, days, start_time, end_time, term) values ('Chemistry', 'A-101', 'Wed', '10:30', '11:30', 'Fall') returning id`);
  check("back-to-back classes in the same room are allowed", !r.error, r.error ?? "");
  r = await as(teacher2, `insert into public.classes (name, room, days, start_time, end_time) values ('Bad times', 'C-3', 'Fri', '11:00', '10:00')`);
  check("class that ends before it starts is rejected", !!r.error, r.error ?? "");
}


// --- Section 10: academic core, billing ledger, facilities, exams, credentials, analytics ---
{
  const q1 = async (sql, params = []) => (await db.query(sql, params)).rows;
  const [term] = await q1(`insert into public.terms (name, starts_on, ends_on, add_drop_deadline, is_current)
    values ('Test Term', current_date - 10, current_date + 90, current_date + 5, true) returning id`);
  const [prog] = await q1(`insert into public.programs (name, total_credits) values ('BSc Test', 15) returning id`);
  const [c1] = await q1(`insert into public.courses (code, title, credits) values ('T101', 'Intro', 5) returning id`);
  const [c2] = await q1(`insert into public.courses (code, title, credits, prerequisites) values ('T201', 'Advanced', 5, array['${c1.id}']::uuid[]) returning id`);
  const [c3] = await q1(`insert into public.courses (code, title, credits) values ('T102', 'Elective', 5) returning id`);
  await q1(`insert into public.program_courses (program_id, course_id, recommended_term) values ($1, $2, 1), ($1, $3, 2), ($1, $4, 1)`, [prog.id, c1.id, c2.id, c3.id]);
  await q1(`update public.registrar_records set program_id = $1 where profile_id = $2`, [prog.id, ids.alice]);
  await q1(`insert into public.fee_schedules (term_id, name, per_credit, flat_fee, full_time_credits) values ($1, 'Standard', 100, 50, 10)`, [term.id]);
  const sec = async (name, course, cap) => (await q1(`insert into public.classes (name, teacher_id, teacher_name, course_id, term_id, capacity) values ($1, $2, 'teacher', $3, $4, $5) returning id`, [name, ids.teacher, course, term.id, cap]))[0].id;
  const s1 = await sec('Intro A', c1.id, 1), s2 = await sec('Advanced A', c2.id, 5), s3 = await sec('Elective A', c3.id, 5);
  const bal = async (who) => Number((await as(who, `select balance from public.student_balances where student_id = $1`, [who])).rows[0]?.balance ?? 0);

  r = await as(ids.alice, `select public.register_for_section($1) as s`, [s1]);
  check("student self-registers for a section", r.rows[0]?.s === "enrolled", r.error ?? JSON.stringify(r.rows));
  r = await as(ids.bob, `select public.register_for_section($1) as s`, [s1]);
  check("full section puts the next student on the waitlist", r.rows[0]?.s === "waitlisted", r.error ?? JSON.stringify(r.rows));
  r = await as(ids.alice, `select public.register_for_section($1)`, [s2]);
  check("missing prerequisite blocks registration", !!r.error && /prerequisite/i.test(r.error) && /T101/.test(r.error), r.error ?? "");
  check("tuition charged automatically on enrolment (5 × 100 + 50)", (await bal(ids.alice)) === 550, String(await bal(ids.alice)));
  await as(ids.alice, `select public.register_for_section($1)`, [s3]);
  check("second course adds only the per-credit difference", (await bal(ids.alice)) === 1050, String(await bal(ids.alice)));
  r = await as(ids.alice, `select public.drop_section($1)`, [s3]);
  check("student drops a course", !r.error, r.error ?? "");
  check("drop before the deadline reverses the tuition", (await bal(ids.alice)) === 550, String(await bal(ids.alice)));
  check("dropping below full-time notifies the student", (await count(ids.alice, `select * from public.notifications where title = 'You are now below full-time'`)) === 1);
  check("…and alerts administrators", (await count(ids.admin, `select * from public.notifications where title = 'Student dropped below full-time'`)) >= 1);
  check("the event is recorded for webhooks", (await db.query(`select 1 from public.event_log where event = 'student.below_full_time'`)).rows.length >= 1);

  await as(ids.alice, `select public.drop_section($1)`, [s1]);
  r = await as(ids.bob, `select status from public.class_enrollments where class_id = $1`, [s1]);
  check("freed seat promotes the waitlisted student", r.rows[0]?.status === "enrolled", JSON.stringify(r.rows));
  check("promoted student is notified", (await count(ids.bob, `select * from public.notifications where title = 'You got a seat'`)) === 1);
  check("promoted student is billed", (await bal(ids.bob)) === 550, String(await bal(ids.bob)));

  r = await as(ids.admin, `update public.ledger_entries set amount = 1 returning id`);
  check("ledger entries cannot be edited (append-only)", !!r.error || r.rows.length === 0, r.error ?? "");
  let appendOnly = null;
  try { await db.exec(`delete from public.ledger_entries`); } catch (e) { appendOnly = e.message; }
  check("ledger entries cannot be deleted even by the database owner", !!appendOnly && /cannot be changed/.test(appendOnly), appendOnly ?? "deleted!");
  const [led] = await q1(`select count(*)::int as n, count(*) filter (where debit_account = credit_account)::int as bad from public.ledger_entries`);
  check("every ledger entry is double-entry (distinct debit and credit accounts)", led.n > 0 && led.bad === 0, JSON.stringify(led));
  const acctAlice = (await q1(`select id from public.student_accounts where student_id = $1`, [ids.alice]))[0].id;
  r = await as(ids.alice, `insert into public.ledger_entries (account_id, entry_type, amount, debit_account, credit_account, description) values ($1, 'payment', 999, 'cash:x', 'student:x', 'fake')`, [acctAlice]);
  check("students cannot write to the ledger", !!r.error, r.error ?? "");
  r = await as(ids.alice, `select public.record_payment($1, 550, 'card', 'x')`, [ids.alice]);
  check("students cannot record payments", !!r.error, r.error ?? "");
  const beforePay = await bal(ids.bob);
  r = await as(ids.admin, `select public.record_payment($1, 100, 'card', 'POS-1')`, [ids.bob]);
  check("admin records a payment → balance drops by the amount", !r.error && (await bal(ids.bob)) === beforePay - 100, r.error ?? String(await bal(ids.bob)));
  check("students see only their own ledger", (await count(ids.alice, `select * from public.ledger_entries`)) === (await q1(`select count(*)::int as n from public.ledger_entries where account_id = $1`, [acctAlice]))[0].n);

  await q1(`insert into public.student_accounts (student_id, hold, hold_reason) values ($1, true, 'Test hold') on conflict (student_id) do update set hold = true, hold_reason = 'Test hold'`, [ids.eve]);
  r = await as(ids.eve, `select public.register_for_section($1)`, [s3]);
  check("financial hold blocks registration", !!r.error && /hold/i.test(r.error), r.error ?? "");

  r = await as(ids.admin, `insert into public.aid_awards (student_id, term_id, name, amount) values ($1, $2, 'Merit grant', 200) returning id`, [ids.bob, term.id]);
  const aidId = r.rows[0]?.id;
  r = await as(ids.bob, `update public.aid_awards set amount = 5000 where id = $1 returning id`, [aidId]);
  check("student cannot change an aid amount", !!r.error, r.error ?? "");
  r = await as(ids.bob, `update public.aid_awards set status = 'accepted' where id = $1 returning status`, [aidId]);
  check("student accepts an aid offer", r.rows[0]?.status === "accepted", r.error ?? "");
  await as(ids.admin, `update public.aid_awards set status = 'disbursed' where id = $1`, [aidId]);
  check("disbursed aid is credited to the account automatically", (await bal(ids.bob)) === 250, String(await bal(ids.bob)));

  r = await as(ids.admin, `insert into public.payment_plans (account_id, term_id, total, installments, first_due) values ((select id from public.student_accounts where student_id = $1), $2, 250, 3, current_date + 30) returning id`, [ids.bob, term.id]);
  const inst = await q1(`select amount from public.plan_installments where plan_id = $1 order by seq`, [r.rows[0].id]);
  check("installment plan splits the total exactly", inst.length === 3 && inst.reduce((s, x) => s + Number(x.amount), 0) === 250, JSON.stringify(inst));

  // Degree audit & prerequisites satisfied after completion
  await as(ids.admin, `update public.class_enrollments set status = 'completed', final_grade = 'A' where class_id = $1 and student_id = $2`, [s1, ids.alice]);
  r = await as(ids.alice, `select public.degree_audit($1) as a`, [ids.alice]);
  const audit = r.rows[0]?.a;
  check("degree audit counts completed credits", audit?.completed_credits === 5 && audit?.program?.name === "BSc Test", r.error ?? JSON.stringify(audit));
  check("degree audit lists remaining courses", audit?.courses?.filter((c) => c.state === "remaining").length === 2, JSON.stringify(audit?.courses));
  r = await as(ids.alice, `select public.register_for_section($1) as s`, [s2]);
  check("completed prerequisite unlocks the next course", r.rows[0]?.s === "enrolled", r.error ?? "");
  r = await as(ids.alice, `select public.degree_audit($1)`, [ids.bob]);
  check("students cannot audit someone else", !!r.error, r.error ?? "");
  check("brief's enrollments view shows only your own rows", (await count(ids.alice, `select * from public.enrollments`)) === (await q1(`select count(*)::int as n from public.class_enrollments where student_id = $1`, [ids.alice]))[0].n);

  // Facilities & reservations
  const [hall] = await q1(`insert into public.facilities (name, type, capacity) values ('Test Hall', 'lecture_hall', 3) returning id`);
  const at = (h) => `current_date + time '${h}'`;
  r = await as(ids.alice, `insert into public.reservations (facility_id, title, starts_at, ends_at) values ($1, 'Study', ${at("10:00")}, ${at("11:00")}) returning id, user_id`, [hall.id]);
  const resA = r.rows[0]?.id;
  check("student books a room", !r.error && r.rows[0]?.user_id === ids.alice, r.error ?? "");
  r = await as(ids.bob, `insert into public.reservations (facility_id, title, starts_at, ends_at) values ($1, 'Clash', ${at("10:30")}, ${at("11:30")})`, [hall.id]);
  check("overlapping booking is impossible (exclusion constraint)", !!r.error && /reservations_no_overlap|conflicting/i.test(r.error), r.error ?? "");
  r = await as(ids.bob, `insert into public.reservations (facility_id, title, starts_at, ends_at) values ($1, 'After', ${at("11:00")}, ${at("12:00")})`, [hall.id]);
  check("back-to-back booking is allowed", !r.error, r.error ?? "");
  r = await as(ids.bob, `insert into public.reservations (facility_id, title, starts_at, ends_at) values ($1, 'Marathon', ${at("13:00")}, ${at("19:00")})`, [hall.id]);
  check("students cannot book more than 4 hours", !!r.error, r.error ?? "");
  r = await as(ids.bob, `update public.reservations set status = 'cancelled' where id = $1 returning id`, [resA]);
  check("students cannot cancel someone else's booking", r.rows.length === 0, r.error ?? "");
  await as(ids.alice, `update public.reservations set status = 'cancelled' where id = $1`, [resA]);
  r = await as(ids.bob, `insert into public.reservations (facility_id, title, starts_at, ends_at) values ($1, 'Freed', ${at("10:00")}, ${at("10:30")})`, [hall.id]);
  check("cancelled slot can be booked again", !r.error, r.error ?? "");

  // Assets
  r = await as(ids.teacher, `insert into public.assets (facility_id, name, asset_tag, serial_number, maintenance_interval_days, last_maintained_on) values ($1, 'Projector', 'AT-1', 'SN-9', 30, current_date - 40) returning id`, [hall.id]);
  const assetId = r.rows[0]?.id;
  check("staff register an asset with serial number", !r.error, r.error ?? "");
  check("overdue maintenance is detected", (await count(ids.teacher, `select * from public.assets_due where next_maintenance_on < current_date`)) === 1);
  await as(ids.teacher, `insert into public.asset_maintenance (asset_id, notes) values ($1, 'Lamp replaced')`, [assetId]);
  check("logging maintenance resets the schedule", (await count(ids.teacher, `select * from public.assets_due where next_maintenance_on < current_date`)) === 0);
  check("students cannot see the asset register", (await count(ids.alice, `select * from public.assets`)) === 0);
  r = await as(ids.teacher, `insert into public.assets (name, asset_tag) values ('Dup', 'AT-1')`);
  check("asset tags are unique", !!r.error, r.error ?? "");

  // Exam lifecycle
  const [ex] = await q1(`insert into public.exams (course_name, exam_type, class_id, facility_id) values ('Advanced final', 'Final', $1, $2) returning id`, [s2, hall.id]);
  r = await as(ids.alice, `select public.generate_exam_seating($1)`, [ex.id]);
  check("students cannot generate seating", !!r.error, r.error ?? "");
  r = await as(ids.teacher, `select public.generate_exam_seating($1) as n`, [ex.id]);
  check("teacher generates randomised seating", r.rows[0]?.n >= 1, r.error ?? "");
  const seats = await q1(`select seat_label, candidate_number from public.exam_candidates where exam_id = $1`, [ex.id]);
  check("every candidate gets a unique seat and number", seats.every((s) => s.seat_label && s.candidate_number) && new Set(seats.map((s) => s.seat_label)).size === seats.length, JSON.stringify(seats));
  r = await as(ids.alice, `select * from public.my_hall_tickets()`);
  check("student sees own hall ticket with seat", r.rows.length === 1 && !!r.rows[0].seat_label && r.rows[0].score === null, r.error ?? JSON.stringify(r.rows));
  await as(ids.teacher, `update public.exam_candidates set score = 88 where exam_id = $1`, [ex.id]);
  check("scores stay hidden until release", (await count(ids.alice, `select * from public.exam_candidates`)) === 0 && (await as(ids.alice, `select score from public.my_hall_tickets()`)).rows[0]?.score === null);
  await as(ids.teacher, `update public.exams set results_released = true where id = $1`, [ex.id]);
  check("after release the student sees the score", Number((await as(ids.alice, `select score from public.my_hall_tickets()`)).rows[0]?.score) === 88);
  check("release notifies candidates", (await count(ids.alice, `select * from public.notifications where title = 'Exam results released'`)) === 1);

  // Credentials
  r = await as(ids.teacher, `insert into public.badges (name, skills) values ('Robotics Level 1', array['ROS','Kinematics']) returning id`);
  const badgeId = r.rows[0]?.id;
  check("teacher defines a badge", !r.error, r.error ?? "");
  r = await as(ids.alice, `insert into public.badge_awards (badge_id, student_id) values ($1, $2)`, [badgeId, ids.alice]);
  check("students cannot award themselves badges", !!r.error, r.error ?? "");
  r = await as(ids.teacher, `insert into public.badge_awards (badge_id, student_id) values ($1, $2) returning verification_code`, [badgeId, ids.alice]);
  const code = r.rows[0]?.verification_code;
  check("teacher awards a badge with a verification code", !!code && code.length === 12, r.error ?? "");
  r = await as(null, `select public.verify_credential($1) as v`, [code.toLowerCase()]);
  check("anyone can verify the credential (signed out)", r.rows[0]?.v?.valid === true && r.rows[0]?.v?.badge === "Robotics Level 1", r.error ?? JSON.stringify(r.rows));
  r = await as(null, `select public.verify_credential('NOTAREALCODE') as v`);
  check("unknown codes are reported invalid", r.rows[0]?.v?.valid === false);
  r = await as(null, `select * from public.badge_awards`);
  check("signed-out visitors cannot list awards", r.rows.length === 0);

  // Analytics
  r = await as(ids.alice, `select public.compute_risk_scores()`);
  check("students cannot run risk scoring", !!r.error, r.error ?? "");
  r = await as(ids.teacher, `select public.compute_risk_scores() as n`);
  check("staff compute retention risk scores", r.rows[0]?.n >= 3, r.error ?? "");
  const risk = await q1(`select score, factors from public.student_risk_scores where student_id = $1`, [ids.alice]);
  check("risk factors are explained (attendance, grades, submissions, hold)", risk[0] && "attendance_rate" in risk[0].factors && "financial_hold" in risk[0].factors, JSON.stringify(risk));
  check("students cannot read risk scores", (await count(ids.alice, `select * from public.student_risk_scores`)) === 0);
  await q1(`insert into public.admissions (applicant_name, program, status) values ('A1','BSc Test','Enrolled'), ('A2','BSc Test','Approved'), ('A3','BSc Test','Declined'), ('A4','BSc Test','Under Review')`);
  r = await as(ids.admin, `select * from public.admissions_forecast() where program = 'BSc Test'`);
  check("admissions forecast predicts enrolments per programme", r.rows.length === 1 && Number(r.rows[0].predicted_enrolments) > 1, r.error ?? JSON.stringify(r.rows));
  check("forecast is admin-only", (await count(ids.teacher, `select * from public.admissions_forecast()`)) === 0);

  // Private metadata & integrations
  r = await as(ids.alice, `insert into public.user_metadata (user_id, demographics) values ($1, '{"nationality":"DE"}') returning user_id`, [ids.alice]);
  check("user stores private metadata", !r.error, r.error ?? "");
  check("other users cannot read it", (await count(ids.bob, `select * from public.user_metadata`)) === 0);
  check("teachers cannot read it either", (await count(ids.teacher, `select * from public.user_metadata`)) === 0);
  check("admins can read it", (await count(ids.admin, `select * from public.user_metadata`)) === 1);
  r = await as(ids.teacher, `insert into public.webhook_endpoints (url, events) values ('https://example.com/hook', '{*}')`);
  check("only admins manage webhooks", !!r.error, r.error ?? "");
  r = await as(ids.admin, `insert into public.webhook_endpoints (url, events) values ('http://insecure.example.com', '{*}')`);
  check("webhooks must use https", !!r.error, r.error ?? "");
  check("event log is admin-only", (await count(ids.teacher, `select * from public.event_log`)) === 0 && (await count(ids.admin, `select * from public.event_log`)) > 0);

  // LTI tools
  r = await as(ids.teacher, `insert into public.lti_tools (name, launch_url) values ('X', 'https://tool.example.com/launch')`);
  check("only admins register LTI tools", !!r.error, r.error ?? "");
  r = await as(ids.admin, `insert into public.lti_tools (name, launch_url) values ('X', 'http://tool.example.com/launch')`);
  check("LTI launch URLs must use https", !!r.error, r.error ?? "");
  r = await as(ids.admin, `insert into public.lti_tools (name, launch_url) values ('Virtual Lab', 'https://tool.example.com/launch') returning id`);
  const toolId = r.rows[0]?.id;
  check("admin registers an LTI tool", !!toolId, r.error ?? "");
  check("members can list enabled tools", (await count(ids.alice, `select id from public.lti_tools`)) === 1);
  r = await as(null, `select public.lti_tool_public($1) as t`, [toolId]);
  const pub = r.rows[0]?.t;
  check("public launch lookup reveals only non-secret fields", pub && pub.launch_url && !("secret" in pub) && Object.keys(pub).sort().join() === "client_id,deployment_id,id,launch_url", r.error ?? JSON.stringify(pub));
  await as(ids.admin, `update public.lti_tools set enabled = false where id = $1`, [toolId]);
  check("disabled tools cannot be launched", (await as(null, `select public.lti_tool_public($1) as t`, [toolId])).rows[0]?.t === null);
  check("signed-out visitors cannot list LTI tools", (await count(null, `select * from public.lti_tools`)) === 0);
}

// --- Section 11: research & grants, faculty lifecycle, advancement, procurement, compliance, devices ---
{
  const q1 = async (sql, params = []) => (await db.query(sql, params)).rows;
  const grace = "00000000-0000-0000-0000-000000000099";
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'grace@test.local', '{"full_name":"grace"}')`, [grace]);
  await db.exec(`update public.profiles set active = true, pending = false, role = 'alumni' where id = '${grace}'`);
  const year = new Date().getFullYear();
  const [dept] = await q1(`insert into public.departments (name, code, head_id) values ('Engineering', 'ENG', $1) returning id`, [ids.teacher]);
  await q1(`insert into public.budgets (department_id, fiscal_year, amount) values ($1, $2, 5000)`, [dept.id, year]);
  const today = new Date().toISOString().slice(0, 10);
  const nextYear = `${year + 1}-12-31`;

  // Research & grants
  let r = await as(ids.teacher, `insert into public.grants (title, sponsor_name, principal_investigator, total_amount, start_date, end_date) values ('Robotics', 'NSF', $1, 10000, $2, $3) returning id`, [ids.teacher, `${year}-01-01`, nextYear]);
  const grantId = r.rows[0]?.id;
  check("faculty propose grants with themselves as PI", !!grantId, r.error ?? "");
  r = await as(ids.teacher, `insert into public.grants (title, sponsor_name, principal_investigator, total_amount, start_date, end_date, status) values ('X', 'Y', $1, 5, $2, $3, 'active')`, [ids.teacher, `${year}-01-01`, nextYear]);
  check("faculty cannot create an already-awarded grant", !!r.error, r.error ?? "");
  r = await as(ids.alice, `insert into public.grants (title, sponsor_name, principal_investigator, total_amount, start_date, end_date) values ('X', 'Y', $1, 5, $2, $3)`, [ids.alice, `${year}-01-01`, nextYear]);
  check("students cannot propose grants", !!r.error, r.error ?? "");
  check("PI cannot award their own grant", (await as(ids.teacher, `update public.grants set status = 'active' where id = $1 returning id`, [grantId])).rows.length === 0);
  await as(ids.admin, `update public.grants set status = 'active', restriction_rules = '{"allowed_categories":["equipment","travel"],"category_caps":{"travel":500}}' where id = $1`, [grantId]);
  r = await as(ids.teacher, `insert into public.grant_expenditures (grant_id, category, amount, description) values ($1, 'equipment', 1000, 'Servo motors')`, [grantId]);
  check("PI records allowed spending", !r.error, r.error ?? "");
  r = await as(ids.teacher, `insert into public.grant_expenditures (grant_id, category, amount, description) values ($1, 'catering', 50, 'Lunch')`, [grantId]);
  check("spending outside the sponsor's categories is refused", /does not allow/.test(r.error ?? ""), r.error ?? "accepted!");
  r = await as(ids.teacher, `insert into public.grant_expenditures (grant_id, category, amount, description) values ($1, 'travel', 600, 'Conference')`, [grantId]);
  check("category caps are enforced", /caps "travel"/.test(r.error ?? ""), r.error ?? "accepted!");
  r = await as(ids.teacher, `insert into public.grant_expenditures (grant_id, category, amount, description, spent_on) values ($1, 'equipment', 10, 'Old', '2000-01-01')`, [grantId]);
  check("spending outside the grant period is refused", /outside the grant period/.test(r.error ?? ""), r.error ?? "accepted!");
  r = await as(ids.teacher, `insert into public.grant_expenditures (grant_id, category, amount, description) values ($1, 'equipment', 9500, 'Robot arm')`, [grantId]);
  check("overspending a grant is refused", /overspend/.test(r.error ?? ""), r.error ?? "accepted!");
  r = await as(ids.alice, `insert into public.grant_expenditures (grant_id, category, amount, description) values ($1, 'equipment', 1, 'x')`, [grantId]);
  check("only the PI or admins can spend grant money", !!r.error, r.error ?? "");
  check("grant balance tracks spending", Number((await as(ids.admin, `select remaining from public.grant_balances where grant_id = $1`, [grantId])).rows[0]?.remaining) === 9000);
  check("students cannot see grants", (await count(ids.alice, `select * from public.grants`)) === 0);
  r = await as(ids.teacher, `insert into public.effort_certifications (grant_id, person_id, period, percent_effort) values ($1, $2, '${year}-Q3', 60)`, [grantId, ids.teacher]);
  check("faculty certify their effort", !r.error, r.error ?? "");
  const [grant2] = await q1(`insert into public.grants (title, sponsor_name, principal_investigator, total_amount, start_date, end_date, status) values ('Second', 'NIH', $1, 100, $2, $3, 'active') returning id`, [ids.teacher, `${year}-01-01`, nextYear]);
  r = await as(ids.teacher, `insert into public.effort_certifications (grant_id, person_id, period, percent_effort) values ($1, $2, '${year}-Q3', 50)`, [grant2.id, ids.teacher]);
  check("certified effort can't exceed 100% in a period", /exceed 100/.test(r.error ?? ""), r.error ?? "accepted!");

  // Faculty lifecycle
  const [dossier] = await q1(`insert into public.faculty_dossiers (faculty_id, department_id, tenure_clock_start) values ($1, $2, $3) returning id`, [ids.teacher, dept.id, `${year - 7}-09-01`]);
  r = await as(ids.teacher, `update public.faculty_dossiers set publications = '[{"title":"Kinematics"}]' where faculty_id = $1 returning id`, [ids.teacher]);
  check("faculty update their own publications", r.rows.length === 1, r.error ?? "");
  r = await as(ids.teacher, `update public.faculty_dossiers set rank = 'full' where faculty_id = $1`, [ids.teacher]);
  check("faculty cannot promote themselves", /managed by the administration/.test(r.error ?? ""), r.error ?? "accepted!");
  check("students cannot read dossiers", (await count(ids.alice, `select * from public.faculty_dossiers`)) === 0);
  r = await as(ids.teacher, `select public.open_tenure_review($1)`, [dossier.id]);
  check("only admins open tenure reviews", !!r.error, r.error ?? "");
  await as(ids.admin, `select public.open_tenure_review($1)`, [dossier.id]);
  for (const stage of ["department", "college", "provost"]) {
    await as(ids.admin, `update public.tenure_reviews set decision = 'recommend' where dossier_id = $1 and stage = $2`, [dossier.id, stage]);
  }
  check("tenure review advances stage by stage", (await q1(`select count(*)::int n from public.tenure_reviews where dossier_id = $1`, [dossier.id]))[0].n === 4);
  r = await as(ids.admin, `update public.tenure_reviews set decision = 'recommend' where dossier_id = $1 and stage = 'board'`, [dossier.id]);
  check("the board must approve or deny", !!r.error, r.error ?? "");
  await as(ids.admin, `update public.tenure_reviews set decision = 'approved' where dossier_id = $1 and stage = 'board'`, [dossier.id]);
  const [d2] = await q1(`select tenure_status, rank from public.faculty_dossiers where id = $1`, [dossier.id]);
  check("board approval grants tenure and promotes", d2.tenure_status === "tenured" && d2.rank === "associate", JSON.stringify(d2));
  check("faculty are told the tenure decision", (await count(ids.teacher, `select * from public.notifications where title = 'Tenure decision'`)) === 1);
  check("faculty see their own review steps", (await count(ids.teacher, `select * from public.tenure_reviews`)) === 4);
  r = await as(ids.teacher, `insert into public.sabbaticals (starts_on, ends_on, plan) values ('${year + 1}-01-01', '${year + 1}-06-30', 'Research leave')`);
  check("tenured faculty request a sabbatical", !r.error, r.error ?? "");
  r = await as(ids.teacher, `insert into public.sabbaticals (starts_on, ends_on, plan) values ('${year + 1}-03-01', '${year + 1}-09-30', 'Overlap')`);
  check("overlapping sabbaticals are refused", /sabbaticals_no_overlap|conflicting key/.test(r.error ?? ""), r.error ?? "accepted!");
  r = await as(ids.alice, `insert into public.sabbaticals (starts_on, ends_on, plan) values ('${year + 1}-01-01', '${year + 1}-02-01', 'x')`);
  check("students cannot request sabbaticals", !!r.error, r.error ?? "");
  r = await as(ids.admin, `insert into public.labor_distributions (faculty_id, department_id, percent) values ($1, $2, 60)`, [ids.teacher, dept.id]);
  const r2 = await as(ids.admin, `insert into public.labor_distributions (faculty_id, grant_id, percent) values ($1, $2, 40)`, [ids.teacher, grantId]);
  check("pay can be split across department and grant funds", !r.error && !r2.error, (r.error ?? "") + (r2.error ?? ""));
  r = await as(ids.admin, `insert into public.labor_distributions (faculty_id, department_id, percent) values ($1, $2, 10)`, [ids.teacher, dept.id]);
  check("pay splits can't exceed 100%", /more than 100/.test(r.error ?? ""), r.error ?? "accepted!");
  check("faculty see their own pay split only", (await count(ids.teacher, `select * from public.labor_distributions`)) === 2 && (await count(ids.alice, `select * from public.labor_distributions`)) === 0);

  // Advancement & alumni
  const [camp] = await q1(`insert into public.campaigns (name, goal, fund) values ('New Robotics Lab', 50000, 'Capital Fund') returning id`);
  check("alumni see campaigns", (await count(grace, `select * from public.campaigns`)) === 1);
  check("alumni cannot see internal data (courses, chat, notices)", (await count(grace, `select * from public.courses`)) === 0
    && (await count(grace, `select * from public.chat_messages`)) === 0 && (await count(grace, `select * from public.registrar_records`)) === 0);
  r = await as(grace, `insert into public.alumni_donations (alumni_id, campaign_id, amount, paid_amount, pledge_status) values ($1, $2, 1000, 1000, 'paid') returning id, paid_amount, pledge_status, allocated_fund`, [grace, camp.id]);
  const pledge = r.rows[0];
  check("a new pledge always starts unpaid", pledge && Number(pledge.paid_amount) === 0 && pledge.pledge_status === "pledged" && pledge.allocated_fund === "Capital Fund", r.error ?? JSON.stringify(pledge));
  r = await as(grace, `update public.alumni_donations set paid_amount = 1000 where id = $1`, [pledge.id]);
  check("donors cannot mark their own pledge paid", !!r.error, r.error ?? "accepted!");
  r = await as(grace, `insert into public.pledge_payments (donation_id, amount) values ($1, 400) returning receipt_no`, [pledge.id]);
  check("pledge payments issue a receipt", /^R-/.test(r.rows[0]?.receipt_no ?? ""), r.error ?? "");
  check("partial payment marks the pledge partially paid", (await q1(`select pledge_status from public.alumni_donations where id = $1`, [pledge.id]))[0].pledge_status === "partially_paid");
  r = await as(grace, `insert into public.pledge_payments (donation_id, amount) values ($1, 700)`, [pledge.id]);
  check("payments cannot exceed the pledge", /exceeds the outstanding/.test(r.error ?? ""), r.error ?? "accepted!");
  await as(grace, `insert into public.pledge_payments (donation_id, amount) values ($1, 600)`, [pledge.id]);
  check("paying the rest completes the pledge", (await q1(`select pledge_status from public.alumni_donations where id = $1`, [pledge.id]))[0].pledge_status === "paid");
  check("other people cannot see someone's gifts", (await count(ids.alice, `select * from public.alumni_donations`)) === 0 && (await count(ids.teacher, `select * from public.pledge_payments`)) === 0);
  r = await as(grace, `select * from public.campaign_totals()`);
  check("campaign totals are shown to donors", Number(r.rows[0]?.raised) === 1000 && r.rows[0]?.donors === 1, r.error ?? JSON.stringify(r.rows));
  r = await as(ids.admin, `select * from public.donor_scores()`);
  check("admins see donor engagement scores", r.rows.length === 1 && r.rows[0].score > 40, r.error ?? JSON.stringify(r.rows));
  check("donor scores are admin-only", (await count(grace, `select * from public.donor_scores()`)) === 0);

  // Procurement
  r = await as(ids.teacher, `insert into public.purchase_orders (department_id, vendor, description, amount) values ($1, 'Acme', 'Sensors', 800) returning id`, [dept.id]);
  const po1 = r.rows[0]?.id;
  check("staff raise purchase requests", !!po1, r.error ?? "");
  r = await as(ids.alice, `insert into public.purchase_orders (department_id, vendor, description, amount) values ($1, 'Acme', 'x', 5) returning id`, [dept.id]);
  check("students cannot raise purchase requests", !!r.error, r.error ?? "");
  r = await as(ids.teacher, `update public.purchase_orders set status = 'approved' where id = $1`, [po1]);
  check("requesters cannot approve by editing the record", !!r.error, r.error ?? "accepted!");
  r = await as(ids.teacher, `select public.submit_po($1) as route`, [po1]);
  check("small requests route to the department head only", r.rows[0]?.route === "department", r.error ?? JSON.stringify(r.rows));
  r = await as(ids.teacher, `select public.decide_po($1, true, 'ok')`, [po1]);
  check("nobody approves their own request", /own request/.test(r.error ?? ""), r.error ?? "accepted!");
  r = await as(ids.admin, `select public.decide_po($1, true, 'ok') as outcome`, [po1]);
  check("approval completes a one-step route", r.rows[0]?.outcome === "approved", r.error ?? "");
  const [po2] = (await as(ids.teacher, `insert into public.purchase_orders (department_id, vendor, description, amount) values ($1, 'Bolt', 'Robot kit', 4000) returning id`, [dept.id])).rows;
  r = await as(ids.teacher, `select public.submit_po($1) as route`, [po2.id]);
  check("mid-size requests also need finance", r.rows[0]?.route === "department → finance", r.error ?? JSON.stringify(r.rows));
  const [po3] = (await as(ids.teacher, `insert into public.purchase_orders (department_id, vendor, description, amount) values ($1, 'Bolt', 'Extra', 300) returning id`, [dept.id])).rows;
  r = await as(ids.teacher, `select public.submit_po($1)`, [po3.id]);
  check("requests beyond the remaining budget are refused", /Not enough budget: 200/.test(r.error ?? ""), r.error ?? "accepted!");
  check("budget status shows committed spend", Number((await as(ids.admin, `select available from public.budget_status where department_id = $1`, [dept.id])).rows[0]?.available) === 200);
  await as(ids.admin, `update public.budgets set amount = 60000 where department_id = $1`, [dept.id]);
  const [po4] = (await as(ids.teacher, `insert into public.purchase_orders (department_id, vendor, description, amount) values ($1, 'Big', '3D printer farm', 12000) returning id`, [dept.id])).rows;
  r = await as(ids.teacher, `select public.submit_po($1) as route`, [po4.id]);
  check("large requests route department → finance → owner", r.rows[0]?.route === "department → finance → owner", r.error ?? "");
  await as(ids.admin, `select public.decide_po($1, true, 'dept')`, [po4.id]);
  await as(ids.admin, `select public.decide_po($1, true, 'finance')`, [po4.id]);
  r = await as(ids.admin, `select public.decide_po($1, true, 'owner?')`, [po4.id]);
  check("only the owner signs off the largest requests", /owner step/.test(r.error ?? ""), r.error ?? "accepted!");
  r = await as(ids.owner, `select public.decide_po($1, true, 'fine') as outcome`, [po4.id]);
  const [po4row] = await q1(`select status, routing_history from public.purchase_orders where id = $1`, [po4.id]);
  check("owner approval completes it with a full routing history", r.rows[0]?.outcome === "approved" && po4row.routing_history.length === 4, r.error ?? JSON.stringify(po4row));
  check("department heads see their department's requests", (await count(ids.teacher, `select * from public.purchase_orders`)) === 4);

  // Compliance & accreditation
  r = await as(ids.admin, `insert into public.institutional_documents (document_type, title, standard_reference) values ('policy', 'Lab Safety Policy', 'ISO 45001') returning version`);
  const r3 = await as(ids.admin, `insert into public.institutional_documents (document_type, title, standard_reference, change_note) values ('policy', 'Lab Safety Policy', 'ISO 45001', 'Updated PPE rules') returning version`);
  const versions = await q1(`select version, status from public.institutional_documents where title = 'Lab Safety Policy' order by version`);
  check("a new version supersedes the old one", r.rows[0]?.version === 1 && r3.rows[0]?.version === 2 && versions[0].status === "superseded" && versions[1].status === "current", JSON.stringify(versions));
  check("staff read institutional documents; students cannot", (await count(ids.teacher, `select * from public.institutional_documents`)) === 2 && (await count(ids.alice, `select * from public.institutional_documents`)) === 0);
  r = await as(ids.teacher, `insert into public.institutional_documents (document_type, title) values ('policy', 'Rogue')`);
  check("only admins publish institutional documents", !!r.error, r.error ?? "");
  await q1(`insert into public.institutional_documents (document_type, title, valid_until) values ('accreditation', 'Old Accreditation', '2000-01-01')`);
  await q1(`insert into public.institutional_documents (document_type, title, valid_until) values ('accreditation', 'Expiring Accreditation', current_date + 30)`);
  r = await as(ids.admin, `select public.check_document_validity() as n`);
  check("lapsed documents expire automatically", r.rows[0]?.n === 1 && (await q1(`select status from public.institutional_documents where title = 'Old Accreditation'`))[0].status === "expired", r.error ?? "");
  check("admins are warned before documents expire", (await count(ids.admin, `select * from public.notifications where title = 'Document expiring: Expiring Accreditation'`)) === 1);
  r = await as(ids.admin, `select public.generate_statutory_report('research_activity', '${year}') as id`);
  const [rep] = await q1(`select data from public.statutory_reports where id = $1`, [r.rows[0]?.id]);
  check("statutory reports snapshot the numbers", rep && Number(rep.data.spent) === 1000 && rep.data.active_grants >= 1, r.error ?? JSON.stringify(rep));
  r = await as(ids.teacher, `select public.generate_statutory_report('staffing', '${year}')`);
  check("only admins generate statutory reports", !!r.error, r.error ?? "");

  // Hardware-ready facility devices
  const [lab] = await q1(`insert into public.facilities (name, type, capacity) values ('Robot Lab', 'lab', 10) returning id`);
  const [printer] = await q1(`insert into public.assets (name, asset_tag, facility_id) values ('3D Printer', 'AST-3D-1', $1) returning id`, [lab.id]);
  r = await as(ids.teacher, `select public.register_device('Door', 'rfid_reader', $1, null)`, [lab.id]);
  check("only admins register devices", !!r.error, r.error ?? "");
  const door = (await as(ids.admin, `select public.register_device('Lab door', 'rfid_reader', $1, null) as d`, [lab.id])).rows[0].d;
  const prn = (await as(ids.admin, `select public.register_device('Printer 1', 'printer_3d', $1, $2) as d`, [lab.id, printer.id])).rows[0].d;
  check("devices get a one-time secret key", /^dev_[0-9a-f]{64}$/.test(door.api_key), JSON.stringify(door));
  r = await as(ids.admin, `select key_hash from public.devices`);
  check("device key hashes are never readable", !!r.error, r.error ?? "readable!");
  r = await as(null, `select public.device_webhook('dev_wrong', 'heartbeat', '{}')`);
  check("wrong device keys are rejected", /Unknown or disabled device/.test(r.error ?? ""), r.error ?? "accepted!");
  await q1(`insert into public.access_cards (card_uid, user_id) values ('CARD-ALICE', $1), ('CARD-TEACH', $2)`, [ids.alice, ids.teacher]);
  const scan = async (card) => (await as(null, `select public.device_webhook($1, 'access_request', $2) as res`, [door.api_key, { card_uid: card }])).rows[0]?.res;
  check("unknown cards are refused at the door", (await scan("NOPE")).allow === false);
  check("students without a booking are refused at the door", (await scan("CARD-ALICE")).allow === false);
  await q1(`insert into public.reservations (facility_id, user_id, title, starts_at, ends_at) values ($1, $2, 'Build', now() - interval '5 minutes', now() + interval '1 hour')`, [lab.id, ids.alice]);
  check("students with a current booking are let in", (await scan("CARD-ALICE")).allow === true);
  check("staff cards always open the door", (await scan("CARD-TEACH")).reason === "staff");
  r = await as(null, `select public.device_webhook($1, 'fault', '{"code":"E42","message":"Nozzle jam"}')`, [prn.api_key]);
  check("a device fault puts its asset into maintenance", !r.error && (await q1(`select status from public.assets where id = $1`, [printer.id]))[0].status === "maintenance", r.error ?? "");
  check("staff are alerted to device faults", (await count(ids.teacher, `select * from public.notifications where title = 'Device fault: Printer 1'`)) === 1);
  r = await as(null, `select public.device_webhook($1, 'reboot_everything', '{}')`, [prn.api_key]);
  check("unknown device events are rejected", /Unknown event type/.test(r.error ?? ""), r.error ?? "accepted!");
  check("device events are logged for staff only", (await count(ids.teacher, `select * from public.device_events`)) >= 5 && (await count(ids.alice, `select * from public.device_events`)) === 0);
  await as(ids.admin, `update public.devices set active = false where id = $1`, [door.device_id]);
  check("disabled devices are cut off", /Unknown or disabled device/.test((await as(null, `select public.device_webhook($1, 'heartbeat', '{}')`, [door.api_key])).error ?? ""));
}

// --- Deactivated account ---
await db.exec(`update public.profiles set active = false where id = '${ids.eve}'`);
check("deactivated user sees no general chat", (await count(ids.eve, `select * from public.chat_messages where channel = 'general'`)) === 0);
r = await as(ids.eve, `insert into public.maintenance_tickets (issue_title, reported_by) values ('x', $1)`, [ids.eve]);
check("deactivated user cannot write", !!r.error, r.error ?? "");

// --- Anonymous (not signed in) ---
for (const t of ["profiles", "invoices", "chat_messages", "course_materials", "registrar_records"]) {
  check(`anon cannot read ${t}`, (await count(null, `select * from public.${t}`)) === 0);
}

// --- Storage ---
r = await as(ids.alice, `insert into storage.objects (bucket_id, name) values ('course-files', 'x.pdf')`);
check("student cannot upload course files", !!r.error, r.error ?? "");
r = await as(ids.alice, `insert into storage.objects (bucket_id, name) values ('submissions', 'hw.pdf')`);
check("student can upload a submission", !r.error, r.error ?? "");
check("other student cannot read that submission", (await count(ids.bob, `select * from storage.objects where bucket_id = 'submissions'`)) === 0);
r = await as(ids.bob, `delete from storage.objects where bucket_id = 'submissions' returning id`);
check("other student cannot delete that submission", r.rows.length === 0, r.error ?? "");
r = await as(ids.teacher, `delete from storage.objects where bucket_id = 'submissions' returning id`);
check("teacher can delete submission files when removing an assignment", r.rows.length === 1, r.error ?? "");
await as(ids.alice, `insert into storage.objects (bucket_id, name) values ('submissions', 'hw2.pdf')`);
r = await as(ids.teacher, `delete from storage.objects where bucket_id = 'admission-docs' returning id`);
check("teacher cannot delete admission documents", r.rows.length === 0, r.error ?? "");
await db.exec(`insert into storage.objects (bucket_id, name, owner) values ('admission-docs', 'passport.pdf', '${ids.admin}')`);
check("student cannot read admission documents", (await count(ids.alice, `select * from storage.objects where bucket_id = 'admission-docs'`)) === 0);
check("teacher cannot read admission documents", (await count(ids.teacher, `select * from storage.objects where bucket_id = 'admission-docs'`)) === 0);

console.log(results.join("\n"));
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
