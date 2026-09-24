# All-In-One ERP

A campus management desktop app (Windows) built with **Next.js** (static export) inside **Tauri 2**, backed by **Supabase** (Postgres, Auth, Storage, Realtime).

Installed copies update themselves: on start-up and every 4 hours the app checks GitHub Releases for a newer signed build, then shows an **Update & restart** banner. Users can also check manually under **Settings & Updates**.

## Modules

| Module | Who | What it does |
| --- | --- | --- |
| Dashboard | everyone | Greeting, key numbers, upcoming events and exams |
| E-Learning | staff manage / students consume | Upload lectures & materials (Supabase Storage), assignments with due dates, student submissions and grading, class roster |
| Examinations | staff manage / students view | Exam schedule with room, time and status; plagiarism & integrity case console |
| Registrar (SIS) | staff manage / students view own | Student records linked to login accounts, courses & grades, printable transcripts, transcript mail requests, probation queue with counseling bookings |
| Housing & Facilities | everyone | Rooms & occupancy, resident check-in/out, maintenance tickets, meal-plan balances |
| Communications | everyone | Live (realtime) channels, private DMs, file attachments, emoji |
| Master Calendar | staff edit / everyone views | Real month grid, filters, event details |
| MakerSpace & Labs | everyone books / staff manage | Equipment inventory and clash-checked time-slot bookings |
| Career & Portfolio | everyone | Job/internship board, applications with hiring stages, project showcase |
| Digital Library | everyone borrows / staff manage | Catalog, e-books, loans with automatic availability and overdue tracking |
| Student Life | everyone | Clubs (join/leave) and campus events with RSVP & capacity |
| Logistics & Transport | everyone | Shuttle routes, live status, seat reservations, rider manifests |
| Task Management | staff | Categorised tasks with owners, due dates and status |
| Admissions CRM | admins | Kanban pipeline, applicant documents, verification queue, CSV export |
| Finance & Billing | admins / students see own | Invoices (print/PDF, CSV), overdue tracking, expenses & payroll, 6-month cash-flow chart |
| Global Admin | admins | Create real user accounts, change roles, revoke access, audit log |

Roles: `owner`, `administration`, `teacher`, `student`. Permissions are enforced **in the database** with row-level security (see `supabase/schema.sql`), not just hidden in the UI.

## Setup

1. **Rotate your Supabase keys.** An earlier version of this repo shipped the `service_role` key in `lib/supabase.ts`, and anyone can still read it in the git history. In Supabase go to *Project Settings → API* and roll the keys / JWT secret.
2. **Create the database.** Open *Supabase → SQL Editor*, paste the whole of [`supabase/schema.sql`](supabase/schema.sql) and run it. It is safe to re-run: it keeps existing tables and data, then adds missing tables, columns, security policies, storage buckets and the realtime chat feed.
3. **Configure the app.** Copy `.env.example` to `.env.local` and fill in your project URL and **anon** key.
4. **Run it.**
   ```bash
   npm install
   npm run tauri dev     # desktop window
   # or: npm run dev     # browser at http://localhost:3000
   ```
5. **First account = owner.** The first person to sign up becomes the `owner`. Everyone after that starts as a `student` until an admin changes their role in *Global Admin*. If you don't want public sign-ups, turn them off in *Supabase → Authentication → Providers → Email*, then create accounts from *Global Admin → Invite User*.

## Online updates

### One-time setup (already done in this repo, except the secrets)

- The updater public key is in `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`.
- The matching **private key** was generated at `~/.tauri/all-in-one-erp.key`, and its password is in `~/.tauri/all-in-one-erp.key.password`. **Back both up somewhere safe.** If they are lost, installed apps can never be updated again, and every user will have to reinstall by hand.
- Add these **repository secrets** on GitHub (*Settings → Secrets and variables → Actions*):

  | Secret | Value |
  | --- | --- |
  | `TAURI_SIGNING_PRIVATE_KEY` | contents of `~/.tauri/all-in-one-erp.key` |
  | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | contents of `~/.tauri/all-in-one-erp.key.password` |
  | `NEXT_PUBLIC_SUPABASE_URL` | your Supabase URL |
  | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your Supabase **anon** key |

### Releasing an update

```bash
npm run release:version -- 0.3.0      # bumps package.json, tauri.conf.json and Cargo.toml
git commit -am "Release v0.3.0"
git tag v0.3.0
git push origin main --tags
```

The **Release** GitHub Action builds the Windows installer, signs it, and publishes a GitHub Release with `latest.json`. Every installed copy (v0.2.0 or newer) then offers the update automatically.

> **Users on v0.1.0** (the first build) do not have the updater yet. They need to install v0.2.0 manually **once**, by downloading the `.exe` installer from the GitHub Releases page and running it over the old version (their settings are kept). After that, all future updates arrive automatically.

## Project layout

```
app/                 one folder per module (static client pages)
components/ui.tsx    shared building blocks (modal, tables, cards, toasts…)
components/UpdateBanner.tsx
lib/session.tsx      auth session, profile/role, route guard
lib/useTable.ts      CRUD hook for a Supabase table
lib/updater.ts       Tauri updater wrapper
lib/utils.ts         CSV export, printing, file storage helpers
supabase/schema.sql  database, RLS policies, storage buckets
src-tauri/           desktop shell (updater, process, opener plugins)
.github/workflows/release.yml
```
