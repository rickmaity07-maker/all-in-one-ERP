import { supabase } from "./supabase";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const money = (n: number | string | null | undefined) =>
  `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Calendar date (YYYY-MM-DD) in the user's own time zone. toISOString() would give the UTC date,
// which is "yesterday" for a few hours after midnight in time zones ahead of UTC (e.g. Germany).
export const localDate = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : "—");

export const fmtDateTime = (d?: string | null) =>
  d ? new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—";

export const initials = (name?: string | null) =>
  (name || "?").split(" ").map((p) => p[0]).join("").substring(0, 2).toUpperCase();

export const matches = (query: string, ...fields: unknown[]) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => String(f ?? "").toLowerCase().includes(q));
};

const escapeHtml = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export { escapeHtml };

export function downloadCsv(filename: string, rows: Row[], columns: { key: string; label: string }[]) {
  // Prefix values that spreadsheet apps would execute as formulas (CSV injection).
  const cell = (v: unknown) => {
    let t = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(t) && isNaN(Number(t))) t = "'" + t;
    return `"${t.replace(/"/g, '""')}"`;
  };
  const csv = [columns.map((c) => cell(c.label)).join(","), ...rows.map((r) => columns.map((c) => cell(r[c.key])).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Prints a standalone HTML document (invoices, transcripts) through a hidden iframe.
// The system print dialog also offers "Save as PDF".
export function printDocument(title: string, bodyHtml: string) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title><style>
    body{font-family:Segoe UI,Arial,sans-serif;color:#1e293b;margin:40px}
    h1{font-size:24px;margin:0 0 4px} h2{font-size:16px;margin:24px 0 8px;color:#475569}
    .muted{color:#64748b;font-size:12px} table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}
    th,td{text-align:left;padding:8px;border-bottom:1px solid #e2e8f0} th{background:#f8fafc}
    .right{text-align:right} .total{font-size:18px;font-weight:700}
    .page{page-break-after:always;break-after:page} .page:last-child{page-break-after:auto;break-after:auto}
    .brand{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #6441A5;padding-bottom:16px;margin-bottom:24px}
  </style></head><body>${bodyHtml}</body></html>`);
  doc.close();
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 1000);
  }, 250);
}

export async function openExternal(url: string) {
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener");
  }
}

// ---------- Supabase Storage ----------
// Supabase's per-file limit (50 MB on the Free plan). Raise NEXT_PUBLIC_MAX_UPLOAD_MB if the plan allows more.
export const MAX_UPLOAD_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 50);

export async function uploadFile(bucket: string, file: File, folder = "") {
  const sizeMb = file.size / 1024 / 1024;
  if (sizeMb > MAX_UPLOAD_MB) {
    throw new Error(
      `"${file.name}" is ${sizeMb.toFixed(0)} MB, over the ${MAX_UPLOAD_MB} MB file size limit. ` +
        `Compress it, or for long videos upload to YouTube/OneDrive and share the link instead.`
    );
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${folder ? folder + "/" : ""}${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

export async function openStoredFile(bucket: string, path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 10);
  if (error || !data) throw error ?? new Error("Could not open file");
  await openExternal(data.signedUrl);
}

export async function removeStoredFile(bucket: string, path?: string | null) {
  if (path) await supabase.storage.from(bucket).remove([path]);
}

export const errorMessage = (e: unknown) =>
  e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "Something went wrong.";
