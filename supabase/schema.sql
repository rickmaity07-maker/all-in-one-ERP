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
