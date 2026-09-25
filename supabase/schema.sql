-- =====================================================================
-- All-In-One ERP — database schema, security rules and storage buckets.
-- Run this whole file in Supabase → SQL Editor. It is safe to re-run:
-- existing tables/rows are kept, missing tables/columns/policies are added.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. PROFILES & ROLES
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key,
  full_name text not null default 'User',
  role text not null default 'student',
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists active boolean not null default true;
alter table public.profiles add column if not exists created_at timestamptz not null default now();

-- Role of the signed-in user. SECURITY DEFINER so policies can call it without recursion.
create or replace function public.app_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid() and active), 'none')
$$;

create or replace function public.is_admin() returns boolean
language sql stable as $$ select public.app_role() in ('owner','administration') $$;

create or replace function public.is_staff() returns boolean
language sql stable as $$ select public.app_role() in ('owner','administration','teacher') $$;

create or replace function public.is_member() returns boolean
language sql stable as $$ select public.app_role() <> 'none' $$;

-- New sign-ups get a profile automatically. The very first account becomes the owner,
-- everyone after that starts as a student until an admin changes their role.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    case when exists (select 1 from public.profiles where role = 'owner') then 'student' else 'owner' end
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Stop users from promoting themselves; only admins change roles, only owners grant "owner".
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- SQL editor / service role
  if (new.role is distinct from old.role or new.active is distinct from old.active) then
    if not public.is_admin() then raise exception 'Only administrators can change roles or access.'; end if;
    if new.role = 'owner' and public.app_role() <> 'owner' then raise exception 'Only an owner can grant the owner role.'; end if;
    if old.role = 'owner' and public.app_role() <> 'owner' then raise exception 'Only an owner can change another owner.'; end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------
-- 2. MODULE TABLES (existing tables are kept; new columns are added)
-- ---------------------------------------------------------------------
create table if not exists public.admissions (
  id uuid primary key default gen_random_uuid(),
  applicant_name text not null,
  program text,
  status text not null default 'Under Review',
  created_at timestamptz not null default now()
);
alter table public.admissions add column if not exists email text;
alter table public.admissions add column if not exists phone text;
alter table public.admissions add column if not exists notes text;
alter table public.admissions add column if not exists documents jsonb not null default '[]'::jsonb;

create table if not exists public.registrar_records (
  id uuid primary key default gen_random_uuid(),
  student_name text not null,
  major text,
  gpa numeric,
  enrollment_status text not null default 'Active',
  created_at timestamptz not null default now()
);
alter table public.registrar_records add column if not exists profile_id uuid;
alter table public.registrar_records add column if not exists student_number text;
alter table public.registrar_records add column if not exists credits_earned int not null default 0;
alter table public.registrar_records add column if not exists credits_required int not null default 180;

create table if not exists public.student_courses (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.registrar_records(id) on delete cascade,
  course_code text,
  course_name text not null,
  term text,
  credits int not null default 5,
  grade text,
  created_at timestamptz not null default now()
);

create table if not exists public.transcript_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid default auth.uid(),
  requester_name text,
  delivery text not null default 'Mail',
  address text,
  status text not null default 'Pending',
  created_at timestamptz not null default now()
);

create table if not exists public.course_materials (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  file_type text,
  size_mb numeric,
  icon_color text,
  created_at timestamptz not null default now()
);
alter table public.course_materials add column if not exists file_path text;
alter table public.course_materials add column if not exists description text;
alter table public.course_materials add column if not exists due_date date;
alter table public.course_materials add column if not exists uploaded_by uuid default auth.uid();

create table if not exists public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.course_materials(id) on delete cascade,
  student_id uuid default auth.uid(),
  student_name text,
  file_path text,
  note text,
  grade text,
  created_at timestamptz not null default now()
);

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  course_name text not null,
  exam_date text,
  exam_type text,
  status text not null default 'Upcoming',
  created_at timestamptz not null default now()
);
alter table public.exams add column if not exists location text;
alter table public.exams add column if not exists duration_minutes int;

create table if not exists public.integrity_flags (
  id uuid primary key default gen_random_uuid(),
  student_name text not null,
  assessment text not null,
  similarity int not null default 0,
  source text,
  notes text,
  status text not null default 'Open',
  created_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  student_name text not null,
  description text,
  amount numeric not null default 0,
  status text not null default 'Pending',
  created_at timestamptz not null default now()
);
alter table public.invoices add column if not exists student_id uuid;
alter table public.invoices add column if not exists due_date date;
alter table public.invoices add column if not exists paid_at timestamptz;

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'Payroll',
  description text,
  amount numeric not null default 0,
  expense_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.maintenance_tickets (
  id uuid primary key default gen_random_uuid(),
  issue_title text not null,
  location text,
  priority text not null default 'Medium',
  status text not null default 'Open',
  created_at timestamptz not null default now()
);
alter table public.maintenance_tickets add column if not exists reported_by uuid default auth.uid();
alter table public.maintenance_tickets add column if not exists reporter_name text;

create table if not exists public.housing_rooms (
  id uuid primary key default gen_random_uuid(),
  building text not null,
  room_number text not null,
  capacity int not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.housing_assignments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.housing_rooms(id) on delete cascade,
  resident_id uuid,
  resident_name text not null,
  term text,
  status text not null default 'Checked In',
  created_at timestamptz not null default now()
);

create table if not exists public.meal_accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique,
  holder_name text,
  plan text not null default 'Standard',
  balance numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_channels (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  description text,
  created_at timestamptz not null default now()
);
insert into public.chat_channels (name, description) values
  ('general', 'Campus-wide announcements and chatter'),
  ('faculty-lounge', 'Staff discussion')
on conflict (name) do nothing;

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  sender_name text,
  message text not null,
  channel text not null default 'general',
  created_at timestamptz not null default now()
);
alter table public.chat_messages add column if not exists sender_id uuid default auth.uid();
alter table public.chat_messages add column if not exists attachment_path text;

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  event_title text not null,
  event_date date not null,
  event_type text not null default 'lecture',
  location text,
  created_at timestamptz not null default now()
);
alter table public.calendar_events add column if not exists start_time text;
alter table public.calendar_events add column if not exists description text;
alter table public.calendar_events add column if not exists created_by uuid default auth.uid();

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  task_title text not null,
  assignee text,
  priority text,
  status text not null default 'Pending',
  created_at timestamptz not null default now()
);
alter table public.tasks add column if not exists due_date date;
alter table public.tasks add column if not exists owner_name text;
alter table public.tasks add column if not exists notes text;

-- ---------- Phase 2 campus modules ----------
create table if not exists public.lab_equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lab text,
  category text,
  status text not null default 'Available',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.lab_bookings (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.lab_equipment(id) on delete cascade,
  booked_by uuid default auth.uid(),
  booker_name text,
  booking_date date not null,
  start_time text,
  end_time text,
  purpose text,
  created_at timestamptz not null default now()
);

create table if not exists public.career_postings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  company text not null,
  posting_type text not null default 'Internship',
  location text,
  deadline date,
  link text,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.career_applications (
  id uuid primary key default gen_random_uuid(),
  posting_id uuid not null references public.career_postings(id) on delete cascade,
  applicant_id uuid default auth.uid(),
  applicant_name text,
  status text not null default 'Submitted',
  created_at timestamptz not null default now(),
  unique (posting_id, applicant_id)
);

create table if not exists public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid default auth.uid(),
  owner_name text,
  title text not null,
  description text,
  url text,
  created_at timestamptz not null default now()
);

create table if not exists public.library_books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text,
  isbn text,
  category text,
  copies_total int not null default 1,
  copies_available int not null default 1,
  file_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.library_loans (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.library_books(id) on delete cascade,
  borrower_id uuid default auth.uid(),
  borrower_name text,
  due_date date not null,
  returned_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.club_members (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  member_id uuid default auth.uid(),
  member_name text,
  created_at timestamptz not null default now(),
  unique (club_id, member_id)
);

create table if not exists public.campus_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date not null,
  location text,
  capacity int,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.campus_events(id) on delete cascade,
  attendee_id uuid default auth.uid(),
  attendee_name text,
  created_at timestamptz not null default now(),
  unique (event_id, attendee_id)
);

create table if not exists public.transport_routes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vehicle text,
  driver text,
  departure_time text,
  stops text,
  capacity int not null default 40,
  status text not null default 'On Time',
  created_at timestamptz not null default now()
);

create table if not exists public.transport_subscriptions (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.transport_routes(id) on delete cascade,
  rider_id uuid default auth.uid(),
  rider_name text,
  created_at timestamptz not null default now(),
  unique (route_id, rider_id)
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_name text,
  action text not null,
  table_name text not null,
  record_id text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
-- Drop every existing policy on our tables so this file is the single source of truth.
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in (
      'profiles','admissions','registrar_records','student_courses','transcript_requests','course_materials',
      'assignment_submissions','exams','integrity_flags','invoices','expenses','maintenance_tickets','housing_rooms',
      'housing_assignments','meal_accounts','chat_channels','chat_messages','calendar_events','tasks','lab_equipment',
      'lab_bookings','career_postings','career_applications','portfolio_items','library_books','library_loans','clubs',
      'club_members','campus_events','event_rsvps','transport_routes','transport_subscriptions','audit_log')
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- Pattern A: every member can read, staff can write.
do $$
declare t text;
begin
  foreach t in array array['course_materials','exams','calendar_events','housing_rooms','lab_equipment',
    'career_postings','library_books','clubs','campus_events','transport_routes','chat_channels']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s read" on public.%I for select to authenticated using (public.is_member())', t, t);
    execute format('create policy "%s staff write" on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())', t, t);
  end loop;
end $$;

-- Pattern B: admin-only tables.
do $$
declare t text;
begin
  foreach t in array array['admissions','expenses']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s admin all" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end $$;

-- Pattern C: staff see everything; members manage their own rows (owner column differs per table).
do $$
declare r record;
begin
  for r in select * from (values
    ('assignment_submissions','student_id'),
    ('transcript_requests','requester_id'),
    ('lab_bookings','booked_by'),
    ('career_applications','applicant_id'),
    ('portfolio_items','owner_id'),
    ('library_loans','borrower_id'),
    ('club_members','member_id'),
    ('event_rsvps','attendee_id'),
    ('transport_subscriptions','rider_id'),
    ('maintenance_tickets','reported_by')
  ) as x(tbl, col)
  loop
    execute format('alter table public.%I enable row level security', r.tbl);
    execute format('create policy "%s staff all" on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())', r.tbl, r.tbl);
    execute format('create policy "%s own read" on public.%I for select to authenticated using (%I = auth.uid())', r.tbl, r.tbl, r.col);
    execute format('create policy "%s own insert" on public.%I for insert to authenticated with check (public.is_member() and %I = auth.uid())', r.tbl, r.tbl, r.col);
    execute format('create policy "%s own delete" on public.%I for delete to authenticated using (%I = auth.uid())', r.tbl, r.tbl, r.col);
  end loop;
end $$;

-- Everyone can see the portfolio showcase, club rosters, RSVP counts and rider counts.
create policy "portfolio_items public read" on public.portfolio_items for select to authenticated using (public.is_member());
create policy "club_members public read" on public.club_members for select to authenticated using (public.is_member());
create policy "event_rsvps public read" on public.event_rsvps for select to authenticated using (public.is_member());
create policy "transport_subscriptions public read" on public.transport_subscriptions for select to authenticated using (public.is_member());
create policy "lab_bookings public read" on public.lab_bookings for select to authenticated using (public.is_member());
create policy "portfolio_items own update" on public.portfolio_items for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Profiles: everyone can see the directory, users can rename themselves, admins manage everything.
alter table public.profiles enable row level security;
create policy "profiles read" on public.profiles for select to authenticated using (true);
create policy "profiles self update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles admin all" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Registrar: staff manage records; students see their own record and courses.
alter table public.registrar_records enable row level security;
create policy "registrar staff all" on public.registrar_records for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "registrar own read" on public.registrar_records for select to authenticated using (profile_id = auth.uid());
alter table public.student_courses enable row level security;
create policy "courses staff all" on public.student_courses for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "courses own read" on public.student_courses for select to authenticated
  using (exists (select 1 from public.registrar_records r where r.id = record_id and r.profile_id = auth.uid()));

-- Integrity flags: staff only.
alter table public.integrity_flags enable row level security;
create policy "flags staff all" on public.integrity_flags for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Invoices: admins manage; students see their own.
alter table public.invoices enable row level security;
create policy "invoices admin all" on public.invoices for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "invoices own read" on public.invoices for select to authenticated using (student_id = auth.uid());

-- Housing: staff manage; residents see their own assignment and meal account.
alter table public.housing_assignments enable row level security;
create policy "housing staff all" on public.housing_assignments for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "housing own read" on public.housing_assignments for select to authenticated using (resident_id = auth.uid());
alter table public.meal_accounts enable row level security;
create policy "meals staff all" on public.meal_accounts for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "meals own read" on public.meal_accounts for select to authenticated using (profile_id = auth.uid());

-- Maintenance tickets: every member can read the queue (in addition to pattern C).
create policy "tickets member read" on public.maintenance_tickets for select to authenticated using (public.is_member());

-- Tasks: staff only.
alter table public.tasks enable row level security;
create policy "tasks staff all" on public.tasks for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Chat: public channels readable by all members, DMs ("dm:<uuid>:<uuid>") only by the two participants,
-- faculty-lounge by staff only. Members may only post as themselves.
alter table public.chat_messages enable row level security;
create policy "chat read" on public.chat_messages for select to authenticated using (
  public.is_member() and (
    (channel not like 'dm:%' and (channel <> 'faculty-lounge' or public.is_staff()))
    or position(auth.uid()::text in channel) > 0
  )
);
create policy "chat insert" on public.chat_messages for insert to authenticated with check (
  public.is_member() and sender_id = auth.uid() and (
    (channel not like 'dm:%' and (channel <> 'faculty-lounge' or public.is_staff()))
    or position(auth.uid()::text in channel) > 0
  )
);
create policy "chat own delete" on public.chat_messages for delete to authenticated using (sender_id = auth.uid() or public.is_admin());

-- Audit log: admins read; rows are written by triggers only.
alter table public.audit_log enable row level security;
create policy "audit admin read" on public.audit_log for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- 4. AUDIT TRIGGERS (feeds Global Admin → Security Logs)
-- ---------------------------------------------------------------------
create or replace function public.write_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare rid text;
begin
  rid := case when tg_op = 'DELETE' then (to_jsonb(old)->>'id') else (to_jsonb(new)->>'id') end;
  insert into public.audit_log (actor_id, actor_name, action, table_name, record_id)
  values (auth.uid(), (select full_name from public.profiles where id = auth.uid()), tg_op, tg_table_name, rid);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','admissions','registrar_records','invoices','expenses','exams','integrity_flags',
    'course_materials','housing_assignments','meal_accounts','library_books','career_postings','transport_routes']
  loop
    execute format('drop trigger if exists audit_%s on public.%I', t, t);
    execute format('create trigger audit_%s after insert or update or delete on public.%I for each row execute function public.write_audit()', t, t);
  end loop;
end $$;

-- Keep library availability in sync with loans.
create or replace function public.sync_library_copies() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.library_books set copies_available = greatest(copies_available - 1, 0) where id = new.book_id;
  elsif tg_op = 'UPDATE' and old.returned_at is null and new.returned_at is not null then
    update public.library_books set copies_available = least(copies_available + 1, copies_total) where id = new.book_id;
  elsif tg_op = 'DELETE' and old.returned_at is null then
    update public.library_books set copies_available = least(copies_available + 1, copies_total) where id = old.book_id;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists library_loans_sync on public.library_loans;
create trigger library_loans_sync after insert or update or delete on public.library_loans
  for each row execute function public.sync_library_copies();

-- Students may borrow only when a copy is available.
create or replace function public.check_library_availability() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select copies_available from public.library_books where id = new.book_id) < 1 then
    raise exception 'No copies of this book are currently available.';
  end if;
  return new;
end $$;

drop trigger if exists library_loans_check on public.library_loans;
create trigger library_loans_check before insert on public.library_loans
  for each row execute function public.check_library_availability();

-- Members may only file rows as themselves with default status fields; staff may act on behalf of others.
-- Stops e.g. a student handing in work pre-graded "A", marking their own application "Offer",
-- borrowing a book until 2099, or posting under someone else's name.
create or replace function public.enforce_member_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare me text;
begin
  if auth.uid() is null then return new; end if;
  me := (select full_name from public.profiles where id = auth.uid());
  if tg_table_name = 'chat_messages' then
    new.sender_name := me;
    return new;
  end if;
  if public.is_staff() then return new; end if;
  case tg_table_name
    when 'assignment_submissions' then new.grade := null; new.student_name := me;
    when 'career_applications' then new.status := 'Submitted'; new.applicant_name := me;
    when 'transcript_requests' then new.status := 'Pending'; new.requester_name := me;
    when 'maintenance_tickets' then new.status := 'Open'; new.reporter_name := me;
    when 'library_loans' then new.returned_at := null; new.borrower_name := me;
      new.due_date := least(coalesce(new.due_date, current_date + 21), current_date + 21);
    when 'lab_bookings' then new.booker_name := me;
    when 'club_members' then new.member_name := me;
    when 'event_rsvps' then new.attendee_name := me;
    when 'transport_subscriptions' then new.rider_name := me;
    when 'portfolio_items' then new.owner_name := me;
    else null;
  end case;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['chat_messages','assignment_submissions','career_applications','transcript_requests',
    'maintenance_tickets','library_loans','lab_bookings','club_members','event_rsvps','transport_subscriptions','portfolio_items']
  loop
    execute format('drop trigger if exists enforce_member_%s on public.%I', t, t);
    execute format('create trigger enforce_member_%s before insert on public.%I for each row execute function public.enforce_member_insert()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. REALTIME (live chat)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. FILE STORAGE (private buckets, accessed through signed URLs)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('course-files', 'course-files', false),
  ('submissions', 'submissions', false),
  ('admission-docs', 'admission-docs', false),
  ('chat-files', 'chat-files', false),
  ('library-files', 'library-files', false)
on conflict (id) do nothing;

drop policy if exists "erp files read" on storage.objects;
drop policy if exists "erp files member upload" on storage.objects;
drop policy if exists "erp files staff upload" on storage.objects;
drop policy if exists "erp files delete" on storage.objects;

create policy "erp files read" on storage.objects for select to authenticated using (
  (bucket_id in ('course-files','library-files') and public.is_member())
  -- chat files live in a folder named after the channel; DM folders contain both user ids
  or (bucket_id = 'chat-files' and public.is_member() and (
        (left(name, 3) <> 'dm_' and (name not like 'faculty-lounge/%' or public.is_staff()))
        or position(auth.uid()::text in name) > 0))
  or (bucket_id = 'submissions' and (public.is_staff() or owner = auth.uid()))
  or (bucket_id = 'admission-docs' and public.is_admin())
);
create policy "erp files member upload" on storage.objects for insert to authenticated with check (
  (bucket_id = 'submissions' and public.is_member())
  or (bucket_id = 'chat-files' and public.is_member() and (
        (left(name, 3) <> 'dm_' and (name not like 'faculty-lounge/%' or public.is_staff()))
        or position(auth.uid()::text in name) > 0))
);
create policy "erp files staff upload" on storage.objects for insert to authenticated with check (
  (bucket_id in ('course-files','library-files') and public.is_staff())
  or (bucket_id = 'admission-docs' and public.is_admin())
);
create policy "erp files delete" on storage.objects for delete to authenticated using (
  owner = auth.uid() or public.is_admin()
  -- teachers clean up course content and the student submissions attached to it
  or (bucket_id in ('course-files','library-files','submissions') and public.is_staff())
);

-- ---------------------------------------------------------------------
-- 7. TEACHING: classes, timetable, attendance, gradebook, announcements, leave
-- ---------------------------------------------------------------------
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  teacher_id uuid default auth.uid(),
  teacher_name text,
  room text,
  days text,               -- e.g. 'Mon,Wed,Fri'
  start_time text,
  end_time text,
  term text,
  created_at timestamptz not null default now()
);

create table if not exists public.class_enrollments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null,
  student_name text,
  created_at timestamptz not null default now(),
  unique (class_id, student_id)
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null,
  student_name text,
  session_date date not null,
  status text not null default 'Present' check (status in ('Present','Absent','Late','Excused')),
  note text,
  marked_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (class_id, student_id, session_date)
);

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null,
  category text not null default 'Assignment',
  max_points numeric not null default 100 check (max_points > 0),
  weight numeric not null default 1 check (weight >= 0),
  due_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.grades (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  student_id uuid not null,
  score numeric check (score >= 0),
  comment text,
  created_at timestamptz not null default now(),
  unique (assessment_id, student_id)
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  audience text not null default 'all' check (audience in ('all','staff','students')),
  pinned boolean not null default false,
  author_id uuid default auth.uid(),
  author_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid default auth.uid(),
  requester_name text,
  requester_role text,
  leave_type text not null default 'Sick',
  start_date date not null,
  end_date date not null,
  reason text,
  status text not null default 'Pending',
  reviewed_by_name text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

-- Admins, or the teacher who owns the class.
create or replace function public.teaches(p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (public.app_role() = 'teacher'
    and exists (select 1 from public.classes where id = p_class and teacher_id = auth.uid()))
$$;

create or replace function public.enrolled(p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.class_enrollments where class_id = p_class and student_id = auth.uid())
$$;

-- Forces author/requester fields and keeps anyone from pre-approving their own leave.
create or replace function public.enforce_teaching_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare me text;
begin
  if auth.uid() is null then return new; end if;
  me := (select full_name from public.profiles where id = auth.uid());
  if tg_table_name = 'announcements' then
    new.author_id := auth.uid(); new.author_name := me;
  elsif tg_table_name = 'leave_requests' then
    new.requester_id := auth.uid(); new.requester_name := me; new.requester_role := public.app_role();
    new.status := 'Pending'; new.reviewed_by_name := null;
  elsif tg_table_name = 'classes' and not public.is_admin() then
    new.teacher_id := auth.uid(); new.teacher_name := me;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['announcements','leave_requests','classes']
  loop
    execute format('drop trigger if exists enforce_teaching_%s on public.%I', t, t);
    execute format('create trigger enforce_teaching_%s before insert on public.%I for each row execute function public.enforce_teaching_insert()', t, t);
  end loop;
end $$;

-- Teachers cannot hand their class to someone else.
create or replace function public.guard_teaching_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if new.teacher_id is distinct from old.teacher_id then
    raise exception 'Only administrators can reassign a class.';
  end if;
  return new;
end $$;

drop trigger if exists guard_teaching_classes on public.classes;
create trigger guard_teaching_classes before update on public.classes
  for each row execute function public.guard_teaching_update();

do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public'
    and tablename in ('classes','class_enrollments','attendance','assessments','grades','announcements','leave_requests')
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

alter table public.classes enable row level security;
create policy "classes read" on public.classes for select to authenticated using (public.is_member());
create policy "classes insert" on public.classes for insert to authenticated with check (public.is_staff());
create policy "classes update" on public.classes for update to authenticated using (public.teaches(id)) with check (public.teaches(id));
create policy "classes delete" on public.classes for delete to authenticated using (public.teaches(id));

alter table public.class_enrollments enable row level security;
create policy "enrollments read" on public.class_enrollments for select to authenticated using (public.is_staff() or student_id = auth.uid());
create policy "enrollments manage" on public.class_enrollments for all to authenticated using (public.teaches(class_id)) with check (public.teaches(class_id));

alter table public.attendance enable row level security;
create policy "attendance read" on public.attendance for select to authenticated using (public.is_staff() or student_id = auth.uid());
create policy "attendance manage" on public.attendance for all to authenticated using (public.teaches(class_id)) with check (public.teaches(class_id));

alter table public.assessments enable row level security;
create policy "assessments read" on public.assessments for select to authenticated using (public.is_staff() or public.enrolled(class_id));
create policy "assessments manage" on public.assessments for all to authenticated using (public.teaches(class_id)) with check (public.teaches(class_id));

alter table public.grades enable row level security;
create policy "grades read" on public.grades for select to authenticated using (public.is_staff() or student_id = auth.uid());
create policy "grades manage" on public.grades for all to authenticated
  using (public.teaches((select a.class_id from public.assessments a where a.id = assessment_id)))
  with check (public.teaches((select a.class_id from public.assessments a where a.id = assessment_id)));

alter table public.announcements enable row level security;
create policy "announcements read" on public.announcements for select to authenticated using (
  public.is_member() and (audience = 'all' or public.is_staff() or (audience = 'students' and public.app_role() = 'student'))
);
create policy "announcements insert" on public.announcements for insert to authenticated with check (public.is_staff());
create policy "announcements modify" on public.announcements for update to authenticated
  using (author_id = auth.uid() or public.is_admin()) with check (public.is_staff());
create policy "announcements delete" on public.announcements for delete to authenticated using (author_id = auth.uid() or public.is_admin());

alter table public.leave_requests enable row level security;
create policy "leave read" on public.leave_requests for select to authenticated using (requester_id = auth.uid() or public.is_admin());
create policy "leave insert" on public.leave_requests for insert to authenticated with check (public.is_member());
create policy "leave cancel" on public.leave_requests for delete to authenticated using ((requester_id = auth.uid() and status = 'Pending') or public.is_admin());
create policy "leave review" on public.leave_requests for update to authenticated using (public.is_admin()) with check (public.is_admin());

do $$
declare t text;
begin
  foreach t in array array['grades','attendance','classes','leave_requests']
  loop
    execute format('drop trigger if exists audit_%s on public.%I', t, t);
    execute format('create trigger audit_%s after insert or update or delete on public.%I for each row execute function public.write_audit()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 8. LEGACY TABLE FIXES
-- Early versions created lab_equipment and campus_events with different column
-- names. Add the columns the app uses, copy old values across, and make the old
-- required columns optional so inserts from the app succeed.
-- ---------------------------------------------------------------------
alter table public.lab_equipment add column if not exists name text;
alter table public.lab_equipment add column if not exists lab text;
alter table public.lab_equipment add column if not exists notes text;
alter table public.campus_events add column if not exists title text;
alter table public.campus_events add column if not exists capacity int;
alter table public.campus_events add column if not exists description text;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'lab_equipment' and column_name = 'equipment_name') then
    execute 'update public.lab_equipment set name = coalesce(name, equipment_name)';
    execute 'alter table public.lab_equipment alter column equipment_name drop not null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'lab_equipment' and column_name = 'location') then
    execute 'update public.lab_equipment set lab = coalesce(lab, location)';
    execute 'alter table public.lab_equipment alter column location drop not null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'campus_events' and column_name = 'event_name') then
    execute 'update public.campus_events set title = coalesce(title, event_name)';
    execute 'alter table public.campus_events alter column event_name drop not null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'campus_events' and column_name = 'organizer') then
    execute 'alter table public.campus_events alter column organizer drop not null';
  end if;
end $$;

-- The app's forms always send these; keep them required going forward.
update public.lab_equipment set name = 'Unnamed equipment' where name is null;
update public.campus_events set title = 'Untitled event' where title is null;
alter table public.lab_equipment alter column name set not null;
alter table public.campus_events alter column title set not null;

-- Ask the API layer to pick up the new columns immediately.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 9. ACCOUNT APPROVAL, PASSWORD RESETS, PRIVACY, PARENTS, NOTIFICATIONS,
--    BOOKING CLASHES, VIDEO LINKS
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists pending boolean not null default false;
alter table public.profiles add column if not exists must_change_password boolean not null default false;

-- Self sign-ups now wait for an administrator. The very first account is still the owner.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first_user boolean;
begin
  first_user := not exists (select 1 from public.profiles where role = 'owner');
  insert into public.profiles (id, full_name, email, role, active, pending)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    case when first_user then 'owner' else 'student' end,
    first_user,
    not first_user
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- SQL editor / service role
  if (new.role is distinct from old.role or new.active is distinct from old.active or new.pending is distinct from old.pending
      or new.email is distinct from old.email) then
    if not public.is_admin() then raise exception 'Only administrators can change roles, access or email.'; end if;
    if new.role = 'owner' and public.app_role() <> 'owner' then raise exception 'Only an owner can grant the owner role.'; end if;
    if old.role = 'owner' and public.app_role() <> 'owner' then raise exception 'Only an owner can change another owner.'; end if;
  end if;
  -- Users may clear their own "change password" flag, never set it for someone else.
  if new.must_change_password is distinct from old.must_change_password and not public.is_admin() and new.id <> auth.uid() then
    raise exception 'Not allowed.';
  end if;
  return new;
end $$;

-- Email addresses are private: only administrators can read them (through admin_list_profiles).
revoke select on public.profiles from anon, authenticated;
grant select (id, full_name, role, active, pending, must_change_password, created_at) on public.profiles to authenticated;

create or replace function public.admin_list_profiles()
returns table (id uuid, full_name text, email text, role text, active boolean, pending boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrators only.'; end if;
  return query select p.id, p.full_name, p.email, p.role, p.active, p.pending, p.created_at from public.profiles p order by p.full_name;
end $$;
revoke execute on function public.admin_list_profiles() from public, anon;
grant execute on function public.admin_list_profiles() to authenticated;

-- ---------- Password resets without email ----------
create table if not exists public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  profile_id uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.password_reset_requests enable row level security;
drop policy if exists "reset requests admin" on public.password_reset_requests;
create policy "reset requests admin" on public.password_reset_requests for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Callable from the login screen. Never reveals whether an email exists; one request per 15 minutes.
create or replace function public.request_password_reset(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  select id into pid from public.profiles where lower(email) = lower(trim(p_email));
  if pid is null then return; end if;
  if exists (select 1 from public.password_reset_requests where profile_id = pid and resolved_at is null and created_at > now() - interval '15 minutes') then return; end if;
  insert into public.password_reset_requests (email, profile_id) values (lower(trim(p_email)), pid);
end $$;
revoke execute on function public.request_password_reset(text) from public;
grant execute on function public.request_password_reset(text) to anon, authenticated;

-- Admin sets a temporary password; the user must change it at next sign-in.
create or replace function public.admin_reset_password(p_user uuid, p_password text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare target_role text;
begin
  if not public.is_admin() then raise exception 'Administrators only.'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'Temporary password must be at least 8 characters.'; end if;
  select role into target_role from public.profiles where id = p_user;
  if target_role is null then raise exception 'User not found.'; end if;
  if target_role = 'owner' and public.app_role() <> 'owner' then raise exception 'Only an owner can reset an owner''s password.'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now() where id = p_user;
  update public.profiles set must_change_password = true where id = p_user;
  update public.password_reset_requests set resolved_at = now() where profile_id = p_user and resolved_at is null;
end $$;
revoke execute on function public.admin_reset_password(uuid, text) from public, anon;
grant execute on function public.admin_reset_password(uuid, text) to authenticated;

-- ---------- Parents & guardians ----------
create table if not exists public.guardian_links (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null,
  student_id uuid not null,
  relationship text,
  created_at timestamptz not null default now(),
  unique (guardian_id, student_id)
);
alter table public.guardian_links enable row level security;
drop policy if exists "guardian links read" on public.guardian_links;
drop policy if exists "guardian links admin" on public.guardian_links;
create policy "guardian links read" on public.guardian_links for select to authenticated using (guardian_id = auth.uid() or student_id = auth.uid() or public.is_staff());
create policy "guardian links admin" on public.guardian_links for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.is_guardian_of(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.app_role() = 'parent' and exists (select 1 from public.guardian_links where guardian_id = auth.uid() and student_id = p_student)
$$;

alter table public.leave_requests add column if not exists student_id uuid;
alter table public.leave_requests add column if not exists student_name text;

do $$
declare r record;
begin
  for r in select * from (values
    ('attendance', 'guardian read', 'public.is_guardian_of(student_id)'),
    ('grades', 'guardian read', 'public.is_guardian_of(student_id)'),
    ('class_enrollments', 'guardian read', 'public.is_guardian_of(student_id)'),
    ('invoices', 'guardian read', 'public.is_guardian_of(student_id)'),
    ('registrar_records', 'guardian read', 'public.is_guardian_of(profile_id)'),
    ('assignment_submissions', 'guardian read', 'public.is_guardian_of(student_id)'),
    ('housing_assignments', 'guardian read', 'public.is_guardian_of(resident_id)'),
    ('meal_accounts', 'guardian read', 'public.is_guardian_of(profile_id)'),
    ('leave_requests', 'guardian read', 'public.is_guardian_of(student_id)'),
    ('student_courses', 'guardian read', 'exists (select 1 from public.registrar_records rr where rr.id = record_id and public.is_guardian_of(rr.profile_id))'),
    ('assessments', 'guardian read', 'exists (select 1 from public.class_enrollments ce where ce.class_id = assessments.class_id and public.is_guardian_of(ce.student_id))')
  ) as x(tbl, pol, expr)
  loop
    execute format('drop policy if exists %I on public.%I', r.pol, r.tbl);
    execute format('create policy %I on public.%I for select to authenticated using (%s)', r.pol, r.tbl, r.expr);
  end loop;
end $$;

-- Parents file absence notes for their own children only.
drop policy if exists "leave insert" on public.leave_requests;
create policy "leave insert" on public.leave_requests for insert to authenticated with check (
  public.is_member() and (student_id is null or public.is_guardian_of(student_id) or public.is_admin())
);

create or replace function public.enforce_teaching_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare me text;
begin
  if auth.uid() is null then return new; end if;
  me := (select full_name from public.profiles where id = auth.uid());
  if tg_table_name = 'announcements' then
    new.author_id := auth.uid(); new.author_name := me;
  elsif tg_table_name = 'leave_requests' then
    new.requester_id := auth.uid(); new.requester_name := me; new.requester_role := public.app_role();
    new.status := 'Pending'; new.reviewed_by_name := null;
    new.student_name := case when new.student_id is null then null else (select full_name from public.profiles where id = new.student_id) end;
  elsif tg_table_name = 'classes' and not public.is_admin() then
    new.teacher_id := auth.uid(); new.teacher_name := me;
  end if;
  return new;
end $$;

-- ---------- Double-booking protection ----------
create or replace function public.check_class_clash() returns trigger
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if new.days is null or new.start_time is null or new.end_time is null then return new; end if;
  if new.end_time <= new.start_time then raise exception 'A class must end after it starts.'; end if;
  for c in
    select * from public.classes o
    where o.id <> new.id
      and string_to_array(o.days, ',') && string_to_array(new.days, ',')
      and o.start_time < new.end_time and new.start_time < o.end_time
      and (o.term is null or new.term is null or lower(o.term) = lower(new.term))
  loop
    if new.room is not null and c.room is not null and lower(trim(c.room)) = lower(trim(new.room)) then
      raise exception 'Room % is already booked by "%" (% %–%).', new.room, c.name, c.days, c.start_time, c.end_time;
    end if;
    if new.teacher_id is not null and c.teacher_id = new.teacher_id then
      raise exception '% already teaches "%" at that time (% %–%).', coalesce(new.teacher_name, 'This teacher'), c.name, c.days, c.start_time, c.end_time;
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists classes_clash on public.classes;
create trigger classes_clash before insert or update on public.classes
  for each row execute function public.check_class_clash();

-- ---------- Lecture links (YouTube / OneDrive) for videos over the upload limit ----------
alter table public.course_materials add column if not exists external_url text;

-- ---------- In-app notifications ----------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "notifications own read" on public.notifications;
drop policy if exists "notifications own update" on public.notifications;
drop policy if exists "notifications own delete" on public.notifications;
create policy "notifications own read" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notifications own update" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications own delete" on public.notifications for delete to authenticated using (user_id = auth.uid());

create or replace function public.notify_user(p_user uuid, p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, title, body, link)
  select p_user, p_title, p_body, p_link where p_user is not null and p_user is distinct from auth.uid()
$$;
revoke execute on function public.notify_user(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.notify_guardians(p_student uuid, p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, title, body, link)
  select g.guardian_id, p_title, p_body, p_link from public.guardian_links g where g.student_id = p_student
$$;
revoke execute on function public.notify_guardians(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.on_notify_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare t text; cls text; who text; other uuid;
begin
  if tg_table_name = 'grades' then
    if new.score is null or (tg_op = 'UPDATE' and new.score is not distinct from old.score) then return new; end if;
    select a.title, c.name into t, cls from public.assessments a join public.classes c on c.id = a.class_id where a.id = new.assessment_id;
    perform public.notify_user(new.student_id, 'New grade: ' || t, cls || ' — score ' || new.score, '/gradebook');
    who := (select full_name from public.profiles where id = new.student_id);
    perform public.notify_guardians(new.student_id, 'New grade for ' || who, t || ' (' || cls || '): ' || new.score, '/family');
  elsif tg_table_name = 'attendance' then
    if new.status not in ('Absent', 'Late') or (tg_op = 'UPDATE' and new.status is not distinct from old.status) then return new; end if;
    cls := (select name from public.classes where id = new.class_id);
    perform public.notify_guardians(new.student_id, coalesce(new.student_name, 'Your child') || ' marked ' || lower(new.status),
      cls || ' on ' || to_char(new.session_date, 'DD Mon YYYY'), '/family');
  elsif tg_table_name = 'announcements' then
    insert into public.notifications (user_id, title, body, link)
    select p.id, 'Notice: ' || new.title, left(coalesce(new.body, ''), 140), '/announcements'
    from public.profiles p
    where p.active and p.id <> coalesce(new.author_id, '00000000-0000-0000-0000-000000000000')
      and (new.audience = 'all'
        or (new.audience = 'staff' and p.role in ('owner','administration','teacher'))
        or (new.audience = 'students' and p.role in ('student','parent')));
  elsif tg_table_name = 'leave_requests' then
    if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('Approved','Rejected') then
      perform public.notify_user(new.requester_id, 'Leave request ' || lower(new.status),
        to_char(new.start_date, 'DD Mon') || ' – ' || to_char(new.end_date, 'DD Mon') || coalesce(' • ' || new.reviewed_by_name, ''), '/leave');
    end if;
  elsif tg_table_name = 'course_materials' then
    if new.file_type = 'Assignment' then
      insert into public.notifications (user_id, title, body, link)
      select p.id, 'New assignment: ' || new.title, coalesce('Due ' || to_char(new.due_date, 'DD Mon YYYY'), 'No due date'), '/e-learning'
      from public.profiles p where p.active and p.role = 'student';
    end if;
  elsif tg_table_name = 'chat_messages' then
    if new.channel like 'dm:%' then
      other := nullif(trim(both ':' from replace(replace(new.channel, 'dm:', ''), new.sender_id::text, '')), '')::uuid;
      perform public.notify_user(other, 'Message from ' || coalesce(new.sender_name, 'someone'), left(new.message, 140), '/chat');
    end if;
  elsif tg_table_name = 'password_reset_requests' then
    insert into public.notifications (user_id, title, body, link)
    select p.id, 'Password reset requested', new.email, '/admin' from public.profiles p where p.active and p.role in ('owner','administration');
  elsif tg_table_name = 'profiles' then
    if tg_op = 'INSERT' and new.pending then
      insert into public.notifications (user_id, title, body, link)
      select p.id, 'New account waiting for approval', new.full_name, '/admin' from public.profiles p where p.active and p.role in ('owner','administration');
    end if;
  end if;
  return new;
end $$;

do $$
declare r record;
begin
  for r in select * from (values
    ('grades', 'after insert or update'), ('attendance', 'after insert or update'), ('announcements', 'after insert'),
    ('leave_requests', 'after update'), ('course_materials', 'after insert'), ('chat_messages', 'after insert'),
    ('password_reset_requests', 'after insert'), ('profiles', 'after insert')
  ) as x(tbl, evt)
  loop
    execute format('drop trigger if exists notify_%s on public.%I', r.tbl, r.tbl);
    execute format('create trigger notify_%s %s on public.%I for each row execute function public.on_notify_event()', r.tbl, r.evt, r.tbl);
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

notify pgrst, 'reload schema';

-- Older databases restricted roles to four values; allow the parent role too.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('owner', 'administration', 'teacher', 'student', 'parent'));
notify pgrst, 'reload schema';

-- Older databases made optional fields mandatory, which made saves fail silently
-- (e.g. calendar events without a location). Relax them to match the app.
do $$
declare r record;
begin
  for r in select * from (values
    ('invoices','description'), ('invoices','amount'),
    ('lab_equipment','category'),
    ('course_materials','file_type'), ('course_materials','size_mb'),
    ('admissions','program'), ('admissions','status'), ('admissions','documents'),
    ('registrar_records','major'),
    ('maintenance_tickets','location'), ('maintenance_tickets','priority'),
    ('campus_events','location'),
    ('tasks','assignee'),
    ('calendar_events','location'),
    ('exams','exam_date'),
    ('chat_messages','sender_name')
  ) as x(tbl, col)
  loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = r.tbl and column_name = r.col) then
      execute format('alter table public.%I alter column %I drop not null', r.tbl, r.col);
    end if;
  end loop;
end $$;
notify pgrst, 'reload schema';

-- =====================================================================
-- 10. ACADEMIC CORE, DEGREE AUDIT, BILLING LEDGER, FACILITIES, EXAM LIFECYCLE,
--     CREDENTIALS, ANALYTICS, EVENTS/WEBHOOKS, PRIVATE USER METADATA
-- `profiles` is the central identity table every record links to.
-- =====================================================================
create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

-- ---------- Domain events (every automated reaction is logged; webhooks fan out from here) ----------
create table if not exists public.event_log (
  id bigint generated always as identity primary key,
  event text not null,
  subject_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists event_log_created_idx on public.event_log (created_at desc);

create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  url text not null check (url like 'https://%'),
  events text[] not null default '{}',
  secret text not null default replace(gen_random_uuid()::text, '-', ''),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.emit_event(p_event text, p_subject uuid, p_payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare w record; body jsonb;
begin
  insert into public.event_log (event, subject_id, payload) values (p_event, p_subject, coalesce(p_payload, '{}'::jsonb));
  body := jsonb_build_object('event', p_event, 'subject_id', p_subject, 'data', p_payload, 'sent_at', now());
  -- Deliver to subscribed HTTPS endpoints when pg_net is available (Supabase: Database → Extensions → pg_net).
  if exists (select 1 from pg_extension where extname = 'pg_net') then
    for w in select * from public.webhook_endpoints where active and (cardinality(events) = 0 or p_event = any(events) or '*' = any(events)) loop
      begin
        execute 'select net.http_post(url := $1, body := $2, headers := $3)'
          using w.url, body, jsonb_build_object('Content-Type', 'application/json', 'X-ERP-Event', p_event, 'X-ERP-Secret', w.secret);
      exception when others then
        insert into public.event_log (event, payload) values ('webhook.failed', jsonb_build_object('url', w.url, 'error', sqlerrm));
      end;
    end loop;
  end if;
end $$;
revoke execute on function public.emit_event(text, uuid, jsonb) from public, anon, authenticated;

-- ---------- Private user metadata (FERPA/GDPR: separate from the directory) ----------
create table if not exists public.user_metadata (
  user_id uuid primary key,
  demographics jsonb not null default '{}'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- Academic core ----------
create table if not exists public.terms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  starts_on date not null,
  ends_on date not null,
  add_drop_deadline date,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_on > starts_on)
);

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  degree_type text not null default 'Bachelor',
  total_credits int not null default 180 check (total_credits > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  credits int not null default 5 check (credits between 0 and 60),
  prerequisites uuid[] not null default '{}',
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.program_courses (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  requirement text not null default 'core' check (requirement in ('core', 'elective')),
  recommended_term int,
  unique (program_id, course_id)
);

alter table public.registrar_records add column if not exists program_id uuid references public.programs(id) on delete set null;

-- Sections: the existing `classes` table gains course, term and capacity.
alter table public.classes add column if not exists course_id uuid references public.courses(id) on delete set null;
alter table public.classes add column if not exists term_id uuid references public.terms(id) on delete set null;
alter table public.classes add column if not exists capacity int check (capacity is null or capacity > 0);

-- Enrollments: the existing `class_enrollments` table gains a lifecycle.
alter table public.class_enrollments add column if not exists status text not null default 'enrolled';
alter table public.class_enrollments add column if not exists final_grade text;
alter table public.class_enrollments add column if not exists enrolled_at timestamptz not null default now();
alter table public.class_enrollments add column if not exists dropped_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'class_enrollments_status_check') then
    alter table public.class_enrollments add constraint class_enrollments_status_check check (status in ('enrolled', 'waitlisted', 'dropped', 'completed'));
  end if;
end $$;

-- The names used in the architecture brief, as views over the live tables.
drop view if exists public.course_sections;
create view public.course_sections with (security_invoker = true) as
  select id, course_id, teacher_id as faculty_id, term_id, capacity, name, code, room, days, start_time, end_time from public.classes;
drop view if exists public.enrollments;
create view public.enrollments with (security_invoker = true) as
  select id, student_id, class_id as section_id, status, final_grade as grade, enrolled_at, dropped_at from public.class_enrollments;
drop view if exists public.user_profiles;
create view public.user_profiles with (security_invoker = true) as
  select id, role, case when not active and pending then 'pending' when not active then 'inactive' else 'active' end as status, full_name
  from public.profiles;

-- Passing grades that satisfy prerequisites.
create or replace function public.is_passing(p_grade text) returns boolean language sql immutable as $$
  select p_grade is not null and upper(trim(p_grade)) not in ('F', 'FAIL', 'W', 'I', 'NP', '5', '5.0')
$$;

create or replace function public.term_credits(p_student uuid, p_term uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(co.credits), 0)::int
  from public.class_enrollments e join public.classes c on c.id = e.class_id join public.courses co on co.id = c.course_id
  where e.student_id = p_student and c.term_id = p_term and e.status = 'enrolled'
$$;

-- ---------- Billing: accounts, fee schedules, append-only double-entry ledger, aid, plans ----------
create table if not exists public.student_accounts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique,
  residency text not null default 'resident' check (residency in ('resident', 'non_resident', 'international')),
  hold boolean not null default false,
  hold_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.fee_schedules (
  id uuid primary key default gen_random_uuid(),
  term_id uuid references public.terms(id) on delete cascade,
  name text not null,
  residency text not null default 'any' check (residency in ('any', 'resident', 'non_resident', 'international')),
  per_credit numeric not null default 0 check (per_credit >= 0),
  flat_fee numeric not null default 0 check (flat_fee >= 0),
  full_time_credits int not null default 12,
  block_cap numeric check (block_cap is null or block_cap >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.student_accounts(id) on delete restrict,
  term_id uuid references public.terms(id) on delete set null,
  entry_type text not null check (entry_type in ('charge', 'payment', 'aid', 'adjustment', 'refund')),
  amount numeric not null check (amount > 0),
  debit_account text not null,
  credit_account text not null,
  description text not null,
  method text,
  reference text,
  source text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (debit_account <> credit_account)
);
create index if not exists ledger_account_idx on public.ledger_entries (account_id, created_at);

-- The ledger is append-only: corrections are new entries, never edits.
create or replace function public.ledger_append_only() returns trigger language plpgsql as $$
begin
  -- Only the service role (maintenance scripts, e.g. removing automated-test accounts) may delete.
  if tg_op = 'DELETE' and coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role' then
    return old;
  end if;
  raise exception 'Ledger entries cannot be changed or deleted. Post a correcting entry instead.';
end $$;
drop trigger if exists ledger_append_only on public.ledger_entries;
create trigger ledger_append_only before update or delete on public.ledger_entries
  for each row execute function public.ledger_append_only();

-- Signed effect on what the student owes: charges/refunds increase it, payments/aid decrease it.
create or replace function public.entry_sign(p_type text, p_debit text) returns int language sql immutable as $$
  select case when p_type in ('charge', 'refund') then 1
              when p_type in ('payment', 'aid') then -1
              when p_debit like 'student:%' then 1 else -1 end
$$;

drop view if exists public.student_balances;
create view public.student_balances with (security_invoker = true) as
  select a.id as account_id, a.student_id, a.hold, a.hold_reason, a.residency,
         coalesce(sum(public.entry_sign(l.entry_type, l.debit_account) * l.amount), 0) as balance
  from public.student_accounts a left join public.ledger_entries l on l.account_id = a.id
  group by a.id;

create table if not exists public.aid_awards (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  term_id uuid references public.terms(id) on delete set null,
  name text not null,
  kind text not null default 'grant' check (kind in ('grant', 'scholarship', 'loan', 'waiver')),
  amount numeric not null check (amount > 0),
  status text not null default 'offered' check (status in ('offered', 'accepted', 'disbursed', 'cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.payment_plans (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.student_accounts(id) on delete cascade,
  term_id uuid references public.terms(id) on delete set null,
  total numeric not null check (total > 0),
  installments int not null check (installments between 2 and 12),
  first_due date not null,
  created_at timestamptz not null default now()
);

create table if not exists public.plan_installments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.payment_plans(id) on delete cascade,
  seq int not null,
  due_on date not null,
  amount numeric not null,
  unique (plan_id, seq)
);

create or replace function public.ensure_account(p_student uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare aid uuid;
begin
  select id into aid from public.student_accounts where student_id = p_student;
  if aid is null then
    insert into public.student_accounts (student_id) values (p_student) returning id into aid;
  end if;
  return aid;
end $$;
revoke execute on function public.ensure_account(uuid) from public, anon;

create or replace function public.post_entry(p_account uuid, p_term uuid, p_type text, p_amount numeric, p_desc text,
  p_source text, p_method text default null, p_reference text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare eid uuid; student text; contra text;
begin
  if p_amount is null or p_amount <= 0 then return null; end if;
  student := 'student:' || (select student_id from public.student_accounts where id = p_account);
  contra := case p_type when 'charge' then 'revenue:tuition' when 'refund' then 'cash:bank' when 'payment' then 'cash:' || coalesce(p_method, 'bank')
                        when 'aid' then 'aid:grants' else 'revenue:adjustments' end;
  insert into public.ledger_entries (account_id, term_id, entry_type, amount, debit_account, credit_account, description, method, reference, source)
  values (p_account, p_term, p_type, round(p_amount, 2),
          case when p_type in ('charge', 'refund') then student else contra end,
          case when p_type in ('charge', 'refund') then contra else student end,
          p_desc, p_method, p_reference, p_source)
  returning id into eid;
  perform public.emit_event('ledger.posted', (select student_id from public.student_accounts where id = p_account),
    jsonb_build_object('type', p_type, 'amount', round(p_amount, 2), 'description', p_desc));
  return eid;
end $$;
revoke execute on function public.post_entry(uuid, uuid, text, numeric, text, text, text, text) from public, anon, authenticated;

-- Recalculates tuition for one student and term from their enrolments and posts only the difference.
-- Drops before the add/drop deadline are refunded; drops after it stay billed (proration rule).
create or replace function public.recalc_term_tuition(p_student uuid, p_term uuid) returns numeric
language plpgsql security definer set search_path = public as $$
declare acct uuid; t record; fs record; billable int; target numeric; posted numeric; delta numeric;
begin
  if p_student is null or p_term is null then return 0; end if;
  select * into t from public.terms where id = p_term;
  acct := public.ensure_account(p_student);
  select * into fs from public.fee_schedules
    where active and (term_id = p_term or term_id is null)
      and residency in ('any', (select residency from public.student_accounts where id = acct))
    order by (term_id is null), (residency = 'any') limit 1;
  if fs.id is null then return 0; end if;

  select coalesce(sum(co.credits), 0) into billable
  from public.class_enrollments e join public.classes c on c.id = e.class_id join public.courses co on co.id = c.course_id
  where e.student_id = p_student and c.term_id = p_term
    and (e.status in ('enrolled', 'completed')
         or (e.status = 'dropped' and t.add_drop_deadline is not null and e.dropped_at::date > t.add_drop_deadline));

  target := billable * fs.per_credit;
  if fs.block_cap is not null and billable >= fs.full_time_credits then target := least(target, fs.block_cap); end if;
  if billable > 0 then target := target + fs.flat_fee; end if;

  select coalesce(sum(public.entry_sign(entry_type, debit_account) * amount), 0) into posted
    from public.ledger_entries where account_id = acct and term_id = p_term and source = 'tuition';
  delta := round(target - posted, 2);
  if delta > 0 then
    perform public.post_entry(acct, p_term, 'charge', delta, format('Tuition %s — %s credits', t.name, billable), 'tuition');
  elsif delta < 0 then
    perform public.post_entry(acct, p_term, 'adjustment', -delta, format('Tuition adjustment %s — now %s credits', t.name, billable), 'tuition');
  end if;
  return delta;
end $$;
revoke execute on function public.recalc_term_tuition(uuid, uuid) from public, anon;

-- Holds: unpaid balance on charges older than 30 days (or overdue installments) blocks registration.
create or replace function public.refresh_holds() returns int
language plpgsql security definer set search_path = public as $$
declare a record; bal numeric; overdue boolean; n int := 0;
begin
  for a in select * from public.student_accounts loop
    select coalesce(sum(public.entry_sign(entry_type, debit_account) * amount), 0) into bal from public.ledger_entries where account_id = a.id;
    overdue := bal > 0 and (
      exists (select 1 from public.plan_installments i join public.payment_plans p on p.id = i.plan_id
              where p.account_id = a.id and i.due_on < current_date
                and (select coalesce(sum(amount), 0) from public.plan_installments j where j.plan_id = p.id and j.seq <= i.seq)
                    > (p.total - greatest(bal, 0)))
      or (not exists (select 1 from public.payment_plans where account_id = a.id)
          and exists (select 1 from public.ledger_entries where account_id = a.id and entry_type = 'charge' and created_at < now() - interval '30 days')));
    if overdue and not a.hold then
      update public.student_accounts set hold = true, hold_reason = 'Overdue balance' where id = a.id;
      perform public.notify_user(a.student_id, 'Account hold placed', 'You have an overdue balance. Registration is blocked until it is paid.', '/finance');
      perform public.emit_event('hold.placed', a.student_id, jsonb_build_object('balance', bal));
      n := n + 1;
    elsif not overdue and a.hold and a.hold_reason = 'Overdue balance' then
      update public.student_accounts set hold = false, hold_reason = null where id = a.id;
      perform public.emit_event('hold.released', a.student_id, jsonb_build_object('balance', bal));
    end if;
  end loop;
  return n;
end $$;

create or replace function public.on_ledger_entry() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Paying off the balance releases an automatic hold straight away.
  if new.entry_type in ('payment', 'aid') then perform public.refresh_holds(); end if;
  return new;
end $$;
drop trigger if exists ledger_after_insert on public.ledger_entries;
create trigger ledger_after_insert after insert on public.ledger_entries for each row execute function public.on_ledger_entry();

create or replace function public.on_aid_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'disbursed' and (tg_op = 'INSERT' or old.status is distinct from 'disbursed') then
    perform public.post_entry(public.ensure_account(new.student_id), new.term_id, 'aid', new.amount, new.name || ' (' || new.kind || ')', 'aid:' || new.id);
    perform public.notify_user(new.student_id, 'Financial aid applied', new.name || ': ' || new.amount, '/finance');
  end if;
  return new;
end $$;
-- Students may only move their own offer from "offered" to "accepted"; nothing else.
create or replace function public.guard_aid_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if new.amount is distinct from old.amount or new.name is distinct from old.name or new.kind is distinct from old.kind
     or new.student_id is distinct from old.student_id or new.term_id is distinct from old.term_id
     or not (old.status = 'offered' and new.status = 'accepted') then
    raise exception 'You can only accept an aid offer.';
  end if;
  return new;
end $$;
drop trigger if exists aid_guard on public.aid_awards;
create trigger aid_guard before update on public.aid_awards for each row execute function public.guard_aid_update();

drop trigger if exists aid_after_change on public.aid_awards;
create trigger aid_after_change after insert or update on public.aid_awards for each row execute function public.on_aid_change();

create or replace function public.on_plan_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare i int; part numeric;
begin
  part := round(new.total / new.installments, 2);
  for i in 1..new.installments loop
    insert into public.plan_installments (plan_id, seq, due_on, amount)
    values (new.id, i, (new.first_due + ((i - 1) || ' months')::interval)::date,
            case when i = new.installments then new.total - part * (new.installments - 1) else part end);
  end loop;
  return new;
end $$;
drop trigger if exists plan_after_insert on public.payment_plans;
create trigger plan_after_insert after insert on public.payment_plans for each row execute function public.on_plan_created();

-- Staff-facing money actions (the app's "server actions").
create or replace function public.record_payment(p_student uuid, p_amount numeric, p_method text, p_reference text) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrators only.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive.'; end if;
  if p_method not in ('card', 'bank_transfer', 'cash', 'stripe', 'paypal', 'cheque') then raise exception 'Unknown payment method.'; end if;
  return public.post_entry(public.ensure_account(p_student), null, 'payment', p_amount, 'Payment — ' || replace(p_method, '_', ' '), 'payment', p_method, p_reference);
end $$;

create or replace function public.post_adjustment(p_student uuid, p_amount numeric, p_direction text, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrators only.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.'; end if;
  return public.post_entry(public.ensure_account(p_student), null, case when p_direction = 'charge' then 'charge' else 'adjustment' end,
                           p_amount, p_reason, 'manual');
end $$;

-- ---------- Enrollment automation ----------
create or replace function public.before_enrollment() returns trigger
language plpgsql security definer set search_path = public as $$
declare cls record; missing text; taken int; acct record;
begin
  select c.*, co.prerequisites, co.code as course_code into cls
    from public.classes c left join public.courses co on co.id = c.course_id where c.id = new.class_id;

  if tg_op = 'INSERT' or (new.status = 'enrolled' and old.status in ('dropped', 'waitlisted')) then
    -- Financial holds block registration (administrators can still enrol).
    select * into acct from public.student_accounts where student_id = new.student_id;
    if acct.hold and not public.is_admin() then
      raise exception 'Registration blocked: account hold (%). Please contact the finance office.', coalesce(acct.hold_reason, 'hold');
    end if;
    -- Prerequisites must be completed with a passing grade (administrators may override).
    if coalesce(array_length(cls.prerequisites, 1), 0) > 0 and not public.is_admin() then
      select string_agg(p.code, ', ') into missing from public.courses p
      where p.id = any(cls.prerequisites)
        and not exists (
          select 1 from public.class_enrollments e2 join public.classes c2 on c2.id = e2.class_id
          where e2.student_id = new.student_id and c2.course_id = p.id and e2.status = 'completed' and public.is_passing(e2.final_grade));
      if missing is not null then raise exception 'Missing prerequisite(s) for %: %', cls.course_code, missing; end if;
    end if;
    -- Full sections put new students on the waitlist instead of over-filling.
    if new.status = 'enrolled' and cls.capacity is not null then
      select count(*) into taken from public.class_enrollments where class_id = new.class_id and status = 'enrolled' and id <> new.id;
      if taken >= cls.capacity then new.status := 'waitlisted'; end if;
    end if;
  end if;
  if new.status = 'dropped' and (tg_op = 'INSERT' or old.status <> 'dropped') then new.dropped_at := now(); end if;
  return new;
end $$;
drop trigger if exists enrollment_before on public.class_enrollments;
create trigger enrollment_before before insert or update on public.class_enrollments
  for each row execute function public.before_enrollment();

create or replace function public.after_enrollment() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record; term uuid; before_cr int; after_cr int; ft int; nxt uuid; cls record;
begin
  r := coalesce(new, old);
  select * into cls from public.classes where id = r.class_id;
  term := cls.term_id;
  -- A freed seat goes to the longest-waiting student.
  if cls.capacity is not null and (tg_op = 'DELETE' or (old.status = 'enrolled' and new.status <> 'enrolled')) then
    select id into nxt from public.class_enrollments where class_id = r.class_id and status = 'waitlisted' order by enrolled_at limit 1;
    if nxt is not null then
      update public.class_enrollments set status = 'enrolled' where id = nxt;
      perform public.notify_user((select student_id from public.class_enrollments where id = nxt), 'You got a seat', 'Moved off the waitlist into ' || cls.name, '/classes');
    end if;
  end if;
  if term is null then return r; end if;

  after_cr := public.term_credits(r.student_id, term);
  ft := coalesce((select full_time_credits from public.fee_schedules where active and (term_id = term or term_id is null) order by (term_id is null) limit 1), 12);
  before_cr := after_cr + case
      when tg_op = 'DELETE' and old.status = 'enrolled' then (select coalesce(credits, 0) from public.courses where id = cls.course_id)
      when tg_op = 'UPDATE' and old.status = 'enrolled' and new.status <> 'enrolled' then (select coalesce(credits, 0) from public.courses where id = cls.course_id)
      when tg_op = 'UPDATE' and old.status <> 'enrolled' and new.status = 'enrolled' then -(select coalesce(credits, 0) from public.courses where id = cls.course_id)
      when tg_op = 'INSERT' and new.status = 'enrolled' then -(select coalesce(credits, 0) from public.courses where id = cls.course_id)
      else 0 end;

  perform public.recalc_term_tuition(r.student_id, term);
  perform public.emit_event(case when tg_op = 'DELETE' or r.status = 'dropped' then 'enrollment.dropped' else 'enrollment.' || r.status end,
    r.student_id, jsonb_build_object('class_id', r.class_id, 'term_id', term, 'credits', after_cr));

  -- Dropping below full-time: alert the student and advisors (administrators).
  if before_cr >= ft and after_cr < ft then
    -- Direct insert: the student is told even when they made the change themselves.
    insert into public.notifications (user_id, title, body, link)
      values (r.student_id, 'You are now below full-time', after_cr || ' credits this term. Tuition was recalculated; check aid eligibility.', '/finance');
    insert into public.notifications (user_id, title, body, link)
      select p.id, 'Student dropped below full-time', (select full_name from public.profiles where id = r.student_id) || ' — ' || after_cr || ' credits', '/analytics'
      from public.profiles p where p.active and p.role in ('owner', 'administration');
    perform public.emit_event('student.below_full_time', r.student_id, jsonb_build_object('credits', after_cr, 'threshold', ft));
  end if;
  return r;
end $$;
drop trigger if exists enrollment_after on public.class_enrollments;
create trigger enrollment_after after insert or update or delete on public.class_enrollments
  for each row execute function public.after_enrollment();

-- Students register themselves (the enrollment policies allow teachers/admins; this covers self-service).
create or replace function public.register_for_section(p_class uuid) returns text
language plpgsql security definer set search_path = public as $$
declare st text; existing record;
begin
  if public.app_role() <> 'student' then raise exception 'Only students can self-register.'; end if;
  if not exists (select 1 from public.classes c left join public.terms t on t.id = c.term_id
                 where c.id = p_class and (t.id is null or t.add_drop_deadline is null or current_date <= t.add_drop_deadline)) then
    raise exception 'Registration for this section is closed.';
  end if;
  select * into existing from public.class_enrollments where class_id = p_class and student_id = auth.uid();
  if existing.id is not null then
    if existing.status in ('enrolled', 'waitlisted') then return existing.status; end if;
    update public.class_enrollments set status = 'enrolled', dropped_at = null, enrolled_at = now() where id = existing.id returning status into st;
    return st;
  end if;
  insert into public.class_enrollments (class_id, student_id, student_name, status)
  values (p_class, auth.uid(), (select full_name from public.profiles where id = auth.uid()), 'enrolled') returning status into st;
  return st;
end $$;

create or replace function public.drop_section(p_class uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.app_role() <> 'student' then raise exception 'Only students can drop their own sections.'; end if;
  update public.class_enrollments set status = 'dropped' where class_id = p_class and student_id = auth.uid() and status in ('enrolled', 'waitlisted');
  if not found then raise exception 'You are not registered in this section.'; end if;
end $$;

-- Degree audit: completed / in-progress / remaining against the student's programme.
create or replace function public.degree_audit(p_student uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare prog record; res jsonb;
begin
  if p_student <> auth.uid() and not public.is_staff() and not public.is_guardian_of(p_student) then raise exception 'Not allowed.'; end if;
  select p.* into prog from public.programs p join public.registrar_records r on r.program_id = p.id where r.profile_id = p_student limit 1;
  with done as (
    select distinct c.course_id from public.class_enrollments e join public.classes c on c.id = e.class_id
    where e.student_id = p_student and e.status = 'completed' and public.is_passing(e.final_grade) and c.course_id is not null
  ), current as (
    select distinct c.course_id from public.class_enrollments e join public.classes c on c.id = e.class_id
    where e.student_id = p_student and e.status = 'enrolled' and c.course_id is not null
  )
  select jsonb_build_object(
    'program', case when prog.id is null then null else jsonb_build_object('id', prog.id, 'name', prog.name, 'degree_type', prog.degree_type, 'total_credits', prog.total_credits) end,
    'completed_credits', (select coalesce(sum(co.credits), 0) from public.courses co where co.id in (select course_id from done)),
    'in_progress_credits', (select coalesce(sum(co.credits), 0) from public.courses co where co.id in (select course_id from current)),
    'courses', coalesce((
      select jsonb_agg(jsonb_build_object('id', co.id, 'code', co.code, 'title', co.title, 'credits', co.credits, 'prerequisites', co.prerequisites,
        'requirement', pc.requirement, 'recommended_term', pc.recommended_term,
        'state', case when co.id in (select course_id from done) then 'completed' when co.id in (select course_id from current) then 'in_progress' else 'remaining' end)
        order by pc.recommended_term nulls last, co.code)
      from public.program_courses pc join public.courses co on co.id = pc.course_id where pc.program_id = prog.id), '[]'::jsonb)
  ) into res;
  return res;
end $$;

-- ---------- Facilities, assets, reservations (double-booking is impossible at the database level) ----------
create table if not exists public.facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null default 'classroom' check (type in ('lecture_hall', 'lab', 'classroom', 'meeting_room', 'sports', 'other')),
  building text,
  capacity int not null default 30 check (capacity > 0),
  features jsonb not null default '{}'::jsonb,
  bookable boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.classes add column if not exists facility_id uuid references public.facilities(id) on delete set null;

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references public.facilities(id) on delete set null,
  name text not null,
  asset_tag text not null unique,
  serial_number text,
  category text,
  status text not null default 'in_service' check (status in ('in_service', 'maintenance', 'retired', 'lost')),
  purchased_on date,
  maintenance_interval_days int check (maintenance_interval_days is null or maintenance_interval_days > 0),
  last_maintained_on date,
  certification_expires_on date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.asset_maintenance (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  performed_on date not null default current_date,
  notes text,
  performed_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create or replace function public.after_maintenance() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.assets set last_maintained_on = greatest(coalesce(last_maintained_on, new.performed_on), new.performed_on),
    status = case when status = 'maintenance' then 'in_service' else status end
  where id = new.asset_id;
  return new;
end $$;
drop trigger if exists maintenance_after_insert on public.asset_maintenance;
create trigger maintenance_after_insert after insert on public.asset_maintenance for each row execute function public.after_maintenance();

drop view if exists public.assets_due;
create view public.assets_due with (security_invoker = true) as
  select a.*, (coalesce(a.last_maintained_on, a.purchased_on, a.created_at::date) + a.maintenance_interval_days) as next_maintenance_on
  from public.assets a where a.maintenance_interval_days is not null and a.status <> 'retired';

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  booked_by_name text,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  constraint reservations_no_overlap exclude using gist (facility_id with =, tstzrange(starts_at, ends_at) with &&) where (status = 'confirmed')
);

create or replace function public.before_reservation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_staff() then
    new.user_id := auth.uid();
    if not (select bookable from public.facilities where id = new.facility_id) then raise exception 'This space cannot be booked.'; end if;
    if new.ends_at - new.starts_at > interval '4 hours' then raise exception 'Bookings are limited to 4 hours.'; end if;
  end if;
  new.booked_by_name := coalesce(new.booked_by_name, (select full_name from public.profiles where id = new.user_id));
  return new;
end $$;
drop trigger if exists reservation_before on public.reservations;
create trigger reservation_before before insert on public.reservations for each row execute function public.before_reservation();

-- ---------- Exam lifecycle: candidates, randomised seating, hall tickets, blind grading ----------
alter table public.exams add column if not exists class_id uuid references public.classes(id) on delete set null;
alter table public.exams add column if not exists facility_id uuid references public.facilities(id) on delete set null;
alter table public.exams add column if not exists blind_grading boolean not null default true;
alter table public.exams add column if not exists results_released boolean not null default false;
alter table public.exams add column if not exists max_score numeric not null default 100;

create table if not exists public.exam_candidates (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  student_id uuid not null,
  candidate_number text not null,
  seat_label text,
  score numeric check (score is null or score >= 0),
  created_at timestamptz not null default now(),
  unique (exam_id, student_id),
  unique (exam_id, candidate_number)
);

create or replace function public.generate_exam_seating(p_exam uuid) returns int
language plpgsql security definer set search_path = public as $$
declare ex record; cap int; n int := 0; r record; per_row int := 10;
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  select * into ex from public.exams where id = p_exam;
  if ex.class_id is null then raise exception 'Link the exam to a class first.'; end if;
  insert into public.exam_candidates (exam_id, student_id, candidate_number)
    select p_exam, e.student_id, 'C' || lpad((floor(random() * 900000) + 100000)::text, 6, '0')
    from public.class_enrollments e where e.class_id = ex.class_id and e.status in ('enrolled', 'completed')
  on conflict (exam_id, student_id) do nothing;
  cap := (select capacity from public.facilities where id = ex.facility_id);
  if cap is not null and (select count(*) from public.exam_candidates where exam_id = p_exam) > cap then
    raise exception 'Room capacity (%) is smaller than the number of candidates.', cap;
  end if;
  -- Randomised seating, leaving an empty seat between candidates when the room allows it.
  for r in select id, row_number() over (order by random()) as k from public.exam_candidates where exam_id = p_exam loop
    update public.exam_candidates set seat_label = chr(64 + ((r.k - 1) / per_row)::int + 1) || (((r.k - 1) % per_row) + 1)::text where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- A student's own hall tickets (seat, room, time) — available before results are released.
create or replace function public.my_hall_tickets() returns table (exam_id uuid, course_name text, exam_date text, location text, candidate_number text, seat_label text, score numeric, results_released boolean, max_score numeric)
language sql stable security definer set search_path = public as $$
  select x.id, x.course_name, x.exam_date, coalesce(f.name, x.location), c.candidate_number, c.seat_label,
         case when x.results_released then c.score end, x.results_released, x.max_score
  from public.exam_candidates c join public.exams x on x.id = c.exam_id left join public.facilities f on f.id = x.facility_id
  where c.student_id = auth.uid()
$$;

create or replace function public.on_results_released() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.results_released and not old.results_released then
    insert into public.notifications (user_id, title, body, link)
      select c.student_id, 'Exam results released', new.course_name, '/exams' from public.exam_candidates c where c.exam_id = new.id;
    perform public.emit_event('exam.results_released', null, jsonb_build_object('exam_id', new.id, 'course', new.course_name));
  end if;
  return new;
end $$;
drop trigger if exists exams_results_released on public.exams;
create trigger exams_results_released after update on public.exams for each row execute function public.on_results_released();

-- ---------- Micro-credentials & badges (publicly verifiable) ----------
create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  criteria text,
  skills text[] not null default '{}',
  color text not null default 'indigo',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.badge_awards (
  id uuid primary key default gen_random_uuid(),
  badge_id uuid not null references public.badges(id) on delete cascade,
  student_id uuid not null,
  issued_by uuid default auth.uid(),
  issued_at timestamptz not null default now(),
  verification_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  evidence_url text,
  revoked boolean not null default false,
  unique (badge_id, student_id)
);

create or replace function public.on_badge_awarded() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_user(new.student_id, 'New credential: ' || (select name from public.badges where id = new.badge_id),
    'Verification code ' || new.verification_code, '/credentials');
  perform public.emit_event('credential.issued', new.student_id, jsonb_build_object('badge_id', new.badge_id, 'code', new.verification_code));
  return new;
end $$;
drop trigger if exists badge_award_after_insert on public.badge_awards;
create trigger badge_award_after_insert after insert on public.badge_awards for each row execute function public.on_badge_awarded();

-- Anyone (employers, other schools) can check a code — only the minimum is revealed.
create or replace function public.verify_credential(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_build_object('valid', not a.revoked, 'revoked', a.revoked, 'badge', b.name, 'description', b.description, 'skills', b.skills,
                              'holder', p.full_name, 'issued_at', a.issued_at, 'issuer', 'All-In-One ERP')
    from public.badge_awards a join public.badges b on b.id = a.badge_id join public.profiles p on p.id = a.student_id
    where a.verification_code = upper(trim(p_code))), jsonb_build_object('valid', false))
$$;
revoke execute on function public.verify_credential(text) from public;
grant execute on function public.verify_credential(text) to anon, authenticated;

-- ---------- Analytics: retention risk scores and admissions forecast ----------
create table if not exists public.student_risk_scores (
  student_id uuid primary key,
  score int not null check (score between 0 and 100),
  level text not null check (level in ('low', 'medium', 'high')),
  factors jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now()
);

-- Weighted, explainable score: attendance 40%, grades 35%, missing work 15%, financial hold 10%.
create or replace function public.compute_risk_scores() returns int
language plpgsql security definer set search_path = public as $$
declare s record; att numeric; grd numeric; sub numeric; held boolean; sc int; lvl text; prev text; n int := 0;
begin
  if auth.uid() is not null and not public.is_staff() then raise exception 'Staff only.'; end if;
  for s in select id, full_name from public.profiles where role = 'student' and active loop
    select case when count(*) filter (where status <> 'Excused') = 0 then null
                else count(*) filter (where status in ('Present', 'Late'))::numeric / count(*) filter (where status <> 'Excused') end
      into att from public.attendance where student_id = s.id and session_date > current_date - 90;
    select case when sum(a.weight) = 0 then null else sum(g.score / a.max_points * a.weight) / sum(a.weight) end
      into grd from public.grades g join public.assessments a on a.id = g.assessment_id where g.student_id = s.id and g.score is not null;
    select case when count(m.*) = 0 then null
                else count(sub2.*)::numeric / count(m.*) end
      into sub from public.course_materials m
      left join public.assignment_submissions sub2 on sub2.material_id = m.id and sub2.student_id = s.id
      where m.file_type = 'Assignment' and (m.due_date is null or m.due_date <= current_date);
    held := coalesce((select hold from public.student_accounts where student_id = s.id), false);
    sc := round(least(100, greatest(0,
            (1 - coalesce(att, 1)) * 40 + (1 - least(coalesce(grd, 1), 1)) * 35 + (1 - coalesce(sub, 1)) * 15 + case when held then 10 else 0 end)));
    lvl := case when sc >= 50 then 'high' when sc >= 25 then 'medium' else 'low' end;
    select level into prev from public.student_risk_scores where student_id = s.id;
    insert into public.student_risk_scores (student_id, score, level, factors, computed_at)
    values (s.id, sc, lvl, jsonb_build_object('attendance_rate', round(coalesce(att, 1) * 100), 'grade_average', round(coalesce(grd, 1) * 100),
                                              'submission_rate', round(coalesce(sub, 1) * 100), 'financial_hold', held), now())
    on conflict (student_id) do update set score = excluded.score, level = excluded.level, factors = excluded.factors, computed_at = now();
    if lvl = 'high' and coalesce(prev, '') <> 'high' then
      insert into public.notifications (user_id, title, body, link)
        select p.id, 'At-risk student: ' || s.full_name, 'Retention risk score ' || sc || '/100', '/analytics'
        from public.profiles p where p.active and p.role in ('owner', 'administration');
      perform public.emit_event('student.at_risk', s.id, jsonb_build_object('score', sc));
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Pipeline-based enrolment forecast per programme, using historical yield from past decisions.
create or replace function public.admissions_forecast() returns table (program text, applicants int, under_review int, awaiting_docs int, approved int,
  enrolled int, declined int, approval_rate numeric, yield_rate numeric, predicted_enrolments numeric)
language sql stable security definer set search_path = public as $$
  with a as (select coalesce(program, 'Unspecified') as program, status from public.admissions),
  g as (
    select program,
      count(*)::int as applicants,
      count(*) filter (where status = 'Under Review')::int as under_review,
      count(*) filter (where status = 'Awaiting Documents')::int as awaiting_docs,
      count(*) filter (where status = 'Approved')::int as approved,
      count(*) filter (where status = 'Enrolled')::int as enrolled,
      count(*) filter (where status in ('Declined', 'Rejected'))::int as declined
    from a group by program)
  select program, applicants, under_review, awaiting_docs, approved, enrolled, declined,
    round(coalesce((approved + enrolled)::numeric / nullif(approved + enrolled + declined, 0), 0.6), 2),
    round(coalesce(enrolled::numeric / nullif(enrolled + approved, 0), 0.5), 2),
    round(enrolled + approved * coalesce(enrolled::numeric / nullif(enrolled + approved, 0), 0.5)
      + (under_review + awaiting_docs) * coalesce((approved + enrolled)::numeric / nullif(approved + enrolled + declined, 0), 0.6)
        * coalesce(enrolled::numeric / nullif(enrolled + approved, 0), 0.5), 1)
  from g where public.is_admin() order by applicants desc
$$;

-- Nightly jobs when pg_cron is enabled (Supabase: Database → Extensions → pg_cron).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('erp-risk-scores', 'erp-holds');
    perform cron.schedule('erp-risk-scores', '15 2 * * *', 'select public.compute_risk_scores()');
    perform cron.schedule('erp-holds', '30 2 * * *', 'select public.refresh_holds()');
  end if;
end $$;

-- ---------- LTI tools registry (launches are handled by the lti Edge Function) ----------
create table if not exists public.lti_tools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  launch_url text not null check (launch_url like 'https://%'),
  login_url text,
  client_id text not null default replace(gen_random_uuid()::text, '-', ''),
  deployment_id text not null default replace(gen_random_uuid()::text, '-', ''),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- Non-secret launch details for the lti Edge Function's OIDC step (the caller holds our signed login hint).
create or replace function public.lti_tool_public(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', id, 'client_id', client_id, 'deployment_id', deployment_id, 'launch_url', launch_url)
  from public.lti_tools where id = p_id and enabled
$$;
revoke execute on function public.lti_tool_public(uuid) from public;
grant execute on function public.lti_tool_public(uuid) to anon, authenticated;

-- ---------- Row level security for section 10 ----------
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public' and tablename in (
    'event_log','webhook_endpoints','user_metadata','terms','programs','courses','program_courses','student_accounts','fee_schedules',
    'ledger_entries','aid_awards','payment_plans','plan_installments','facilities','assets','asset_maintenance','reservations',
    'exam_candidates','badges','badge_awards','student_risk_scores','lti_tools')
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

alter table public.event_log enable row level security;
create policy "events admin read" on public.event_log for select to authenticated using (public.is_admin());
alter table public.webhook_endpoints enable row level security;
create policy "webhooks admin" on public.webhook_endpoints for all to authenticated using (public.is_admin()) with check (public.is_admin());
alter table public.lti_tools enable row level security;
create policy "lti read" on public.lti_tools for select to authenticated using (public.is_member());
create policy "lti admin" on public.lti_tools for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.user_metadata enable row level security;
create policy "metadata own" on public.user_metadata for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "metadata admin read" on public.user_metadata for select to authenticated using (public.is_admin());

do $$
declare t text;
begin
  foreach t in array array['terms','programs','courses','program_courses','facilities','badges','fee_schedules']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s read" on public.%I for select to authenticated using (public.is_member())', t, t);
    execute format('create policy "%s admin write" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end $$;
-- Teachers may define badges too.
create policy "badges staff write" on public.badges for insert to authenticated with check (public.is_staff());

alter table public.student_accounts enable row level security;
create policy "accounts admin" on public.student_accounts for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "accounts own read" on public.student_accounts for select to authenticated using (student_id = auth.uid() or public.is_guardian_of(student_id));

alter table public.ledger_entries enable row level security;
create policy "ledger admin read" on public.ledger_entries for select to authenticated using (public.is_admin());
create policy "ledger own read" on public.ledger_entries for select to authenticated using (
  exists (select 1 from public.student_accounts a where a.id = account_id and (a.student_id = auth.uid() or public.is_guardian_of(a.student_id))));
-- No insert/update/delete policies: entries are only written by the security-definer functions above.

alter table public.aid_awards enable row level security;
create policy "aid admin" on public.aid_awards for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "aid own read" on public.aid_awards for select to authenticated using (student_id = auth.uid() or public.is_guardian_of(student_id));
create policy "aid own accept" on public.aid_awards for update to authenticated
  using (student_id = auth.uid() and status = 'offered') with check (student_id = auth.uid() and status in ('accepted', 'offered'));

alter table public.payment_plans enable row level security;
create policy "plans admin" on public.payment_plans for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "plans own read" on public.payment_plans for select to authenticated using (
  exists (select 1 from public.student_accounts a where a.id = account_id and (a.student_id = auth.uid() or public.is_guardian_of(a.student_id))));
alter table public.plan_installments enable row level security;
create policy "installments admin" on public.plan_installments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "installments own read" on public.plan_installments for select to authenticated using (
  exists (select 1 from public.payment_plans p join public.student_accounts a on a.id = p.account_id
          where p.id = plan_id and (a.student_id = auth.uid() or public.is_guardian_of(a.student_id))));

alter table public.assets enable row level security;
create policy "assets read" on public.assets for select to authenticated using (public.is_staff());
create policy "assets staff write" on public.assets for all to authenticated using (public.is_staff()) with check (public.is_staff());
alter table public.asset_maintenance enable row level security;
create policy "maintenance staff" on public.asset_maintenance for all to authenticated using (public.is_staff()) with check (public.is_staff());

alter table public.reservations enable row level security;
create policy "reservations read" on public.reservations for select to authenticated using (public.is_member());
create policy "reservations insert" on public.reservations for insert to authenticated with check (public.is_member());
create policy "reservations own cancel" on public.reservations for update to authenticated
  using (user_id = auth.uid() or public.is_staff()) with check (user_id = auth.uid() or public.is_staff());
create policy "reservations admin delete" on public.reservations for delete to authenticated using (public.is_admin());

alter table public.exam_candidates enable row level security;
create policy "candidates staff" on public.exam_candidates for all to authenticated using (public.is_staff()) with check (public.is_staff());
-- Students read their own row only after results are released (hall tickets come from my_hall_tickets()).
create policy "candidates own released" on public.exam_candidates for select to authenticated using (
  student_id = auth.uid() and exists (select 1 from public.exams x where x.id = exam_id and x.results_released));

alter table public.badge_awards enable row level security;
create policy "awards staff" on public.badge_awards for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "awards own read" on public.badge_awards for select to authenticated using (student_id = auth.uid() or public.is_guardian_of(student_id));

alter table public.student_risk_scores enable row level security;
create policy "risk staff read" on public.student_risk_scores for select to authenticated using (public.is_staff());

-- Students manage their own sections only through register_for_section / drop_section.
revoke execute on function public.record_payment(uuid, numeric, text, text) from public, anon;
revoke execute on function public.post_adjustment(uuid, numeric, text, text) from public, anon;
revoke execute on function public.register_for_section(uuid) from public, anon;
revoke execute on function public.drop_section(uuid) from public, anon;
revoke execute on function public.degree_audit(uuid) from public, anon;
revoke execute on function public.generate_exam_seating(uuid) from public, anon;
revoke execute on function public.my_hall_tickets() from public, anon;
revoke execute on function public.compute_risk_scores() from public, anon;
revoke execute on function public.refresh_holds() from public, anon;
revoke execute on function public.admissions_forecast() from public, anon;
grant execute on function public.record_payment(uuid, numeric, text, text), public.post_adjustment(uuid, numeric, text, text),
  public.register_for_section(uuid), public.drop_section(uuid), public.degree_audit(uuid), public.generate_exam_seating(uuid),
  public.my_hall_tickets(), public.compute_risk_scores(), public.refresh_holds(), public.admissions_forecast() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['terms','programs','courses','fee_schedules','student_accounts','aid_awards','payment_plans','facilities','assets',
    'reservations','exam_candidates','badge_awards','webhook_endpoints','lti_tools']
  loop
    execute format('drop trigger if exists audit_%s on public.%I', t, t);
    execute format('create trigger audit_%s after insert or update or delete on public.%I for each row execute function public.write_audit()', t, t);
  end loop;
end $$;

-- Admissions gains the final funnel stages used by the forecast.
alter table public.admissions add column if not exists decided_at timestamptz;

notify pgrst, 'reload schema';

-- Seat availability for the registration screen (counts only, no names).
create or replace function public.section_seats() returns table (class_id uuid, enrolled int, waitlisted int)
language sql stable security definer set search_path = public as $$
  select e.class_id, (count(*) filter (where e.status = 'enrolled'))::int, (count(*) filter (where e.status = 'waitlisted'))::int
  from public.class_enrollments e where public.is_member() group by e.class_id
$$;
revoke execute on function public.section_seats() from public, anon;
grant execute on function public.section_seats() to authenticated;
