// Exports every table in the public schema to JSON, plus an index of stored files.
// Usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/backup.mjs <output-dir>
// The service_role key bypasses row-level security, so only run this in a trusted place (GitHub Actions secrets).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const out = process.argv[2] ?? "backup";
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}` };
mkdirSync(out, { recursive: true });

// Discover tables from the API's OpenAPI description.
const spec = await (await fetch(`${url}/rest/v1/`, { headers })).json();
const tables = Object.keys(spec.definitions ?? {}).sort();
const summary = {};

for (const table of tables) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*`, { headers: { ...headers, Range: `${from}-${from + 999}` } });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) break;
  }
  writeFileSync(join(out, `${table}.json`), JSON.stringify(rows, null, 1));
  summary[table] = rows.length;
}

// Storage: record every file's path and size (the files themselves stay in Supabase).
const buckets = await (await fetch(`${url}/storage/v1/bucket`, { headers })).json();
const files = {};
async function list(bucket, prefix = "") {
  const res = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, limit: 1000 }),
  });
  for (const item of await res.json()) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id) files[bucket].push({ path, size: item.metadata?.size ?? null, updated_at: item.updated_at });
    else await list(bucket, path);
  }
}
for (const b of buckets) {
  files[b.id] = [];
  await list(b.id);
}
writeFileSync(join(out, "_storage-index.json"), JSON.stringify(files, null, 1));
writeFileSync(join(out, "_summary.json"), JSON.stringify({ taken_at: new Date().toISOString(), rows: summary }, null, 1));

console.log(`Backed up ${tables.length} tables:`);
for (const [t, n] of Object.entries(summary)) console.log(`  ${t.padEnd(28)} ${n}`);
console.log(`Storage index: ${Object.values(files).reduce((s, f) => s + f.length, 0)} files`);
