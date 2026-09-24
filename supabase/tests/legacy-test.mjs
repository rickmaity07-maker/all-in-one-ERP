// Simulates the user's live DB: legacy lab_equipment/campus_events exist before schema.sql runs.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const schema = readFileSync(process.argv[2], "utf8");
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create publication supabase_realtime;
  create table public.lab_equipment (id uuid primary key default gen_random_uuid(), equipment_name text not null, category text not null, status text not null default 'Available', location text not null, created_at timestamptz not null default now());
  create table public.campus_events (id uuid primary key default gen_random_uuid(), event_name text not null, organizer text not null, event_date date not null, location text not null, created_at timestamptz not null default now());
  insert into public.lab_equipment (equipment_name, category, location) values ('Old Printer', '3D Printing', 'Lab 1');
`);
for (const run of [1, 2]) await db.exec(schema);
await db.exec(`insert into public.lab_equipment (name, category, status) values ('New Printer', '3D Printing', 'Available')`);
await db.exec(`insert into public.campus_events (title, event_date, location) values ('Hackathon', current_date, 'Hall')`);
console.log((await db.query(`select name, lab from public.lab_equipment order by name`)).rows);
console.log((await db.query(`select title from public.campus_events`)).rows);
console.log("legacy migration OK");
