// Dry-runs supabase/schema.sql in embedded Postgres with a minimal Supabase stub,
// then security-tests the row-level security rules as different users.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const schema = readFileSync(process.argv[2] ?? new URL("../schema.sql", import.meta.url), "utf8");
const db = new PGlite();

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
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
  await db.exec(`update public.profiles set role = 'teacher' where id = '${teacher2}'`);

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
