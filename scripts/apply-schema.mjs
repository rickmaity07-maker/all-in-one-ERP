// Applies supabase/schema.sql to the live Supabase project through the Management API.
// The schema is safe to re-run: existing tables and data are kept; missing ones are added.
//
// Usage:  node scripts/apply-schema.mjs [--with-extensions]
//   --with-extensions  also enables pg_net (webhooks, SMS sender) and pg_cron (nightly jobs)
// Needs a Supabase personal access token in SUPABASE_ACCESS_TOKEN or ~/.supabase-erp/token
// (supabase.com → Account → Access Tokens). The project comes from NEXT_PUBLIC_SUPABASE_URL in .env.local.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const tokenFile = join(homedir(), ".supabase-erp", "token");
const token = process.env.SUPABASE_ACCESS_TOKEN ?? (existsSync(tokenFile) ? readFileSync(tokenFile, "utf8").trim() : "");
if (!token) {
  console.error("No access token: set SUPABASE_ACCESS_TOKEN or save it in ~/.supabase-erp/token");
  process.exit(1);
}
const env = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^"|"$/g, "");
const ref = url?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
if (!ref) {
  console.error("Could not find the project (NEXT_PUBLIC_SUPABASE_URL).");
  process.exit(1);
}

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${body.slice(0, 800)}`);
  return body ? JSON.parse(body) : null;
}

if (process.argv.includes("--with-extensions")) {
  await query("create extension if not exists pg_net; create extension if not exists pg_cron;");
  console.log("Extensions pg_net and pg_cron are enabled.");
}
await query(readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8"));
console.log("Schema applied.");
const [check] = await query(`select to_regclass('public.app_settings') is not null as latest_section,
  (select string_agg(extname, ', ') from pg_extension where extname in ('pg_net', 'pg_cron')) as extensions`);
console.log(`Latest section present: ${check.latest_section}. Extensions: ${check.extensions ?? "none"}.`);
if (check.extensions?.includes("pg_cron")) {
  const jobs = await query("select string_agg(jobname, ', ') as names from cron.job");
  console.log(`Scheduled jobs: ${jobs[0]?.names ?? "none"}.`);
}
