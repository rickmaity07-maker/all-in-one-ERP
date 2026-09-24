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
