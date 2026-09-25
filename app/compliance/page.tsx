"use client";

import { useState } from "react";
import { FileCheck2, Plus, FileText, AlertTriangle, BarChart3, Download, Printer, Upload, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, isAdmin, isStaff } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import { ModuleShell, Modal, Field, SubmitButton, ActionButton, Card, Table, Loading, Badge, StatCard, AccessDenied, inputClass, toast } from "@/components/ui";
import { downloadCsv, errorMessage, escapeHtml, fmtDate, fmtDateTime, localDate, matches, openStoredFile, printDocument, uploadFile, type Row } from "@/lib/utils";

type TabId = "documents" | "reports";
const BUCKET = "institution-docs";
const TYPES = ["policy", "procedure", "accreditation", "statutory", "contract"];
const STATUS_COLOR: Record<string, string> = { current: "green", superseded: "slate", expired: "red", draft: "orange" };
const REPORTS: { kind: string; label: string }[] = [
  { kind: "enrolment_census", label: "Enrolment census" },
  { kind: "financial_summary", label: "Financial summary" },
  { kind: "staffing", label: "Staffing return" },
  { kind: "research_activity", label: "Research activity" },
];
// Documents due within this window are flagged (computed once per page load).
const SOON = localDate(new Date(Date.now() + 60 * 864e5));
const reportLabel = (k: string) => REPORTS.find((r) => r.kind === k)?.label ?? k;
const pretty = (k: string) => k.replace(/_/g, " ");

// Flattens a report snapshot into rows for display, CSV and print.
const flatten = (data: Row, prefix = ""): { key: string; value: string }[] =>
  Object.entries(data ?? {}).flatMap(([k, v]) => (v && typeof v === "object" ? flatten(v as Row, `${prefix}${pretty(k)} › `) : [{ key: prefix + pretty(k), value: String(v) }]));

export default function Compliance() {
  const { role } = useSession();
  const admin = isAdmin(role);
  const [tab, setTab] = useState<TabId>("documents");
  const [search, setSearch] = useState("");
  const [showOld, setShowOld] = useState(false);
  const docs = useTable("institutional_documents", { enabled: isStaff(role) });
  const reports = useTable("statutory_reports", { orderBy: "generated_at", enabled: admin });
  const [modal, setModal] = useState<"" | "doc" | "report">("");
  const [viewing, setViewing] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [d, setD] = useState({ document_type: "policy", title: "", standard_reference: "", valid_until: "", change_note: "" });
  const [rp, setRp] = useState({ kind: "enrolment_census", period: String(new Date().getFullYear()) });

  if (!isStaff(role)) return <AccessDenied message="Compliance documents are available to staff." />;

  const saveDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const file_path = file ? await uploadFile(BUCKET, file, d.document_type) : null;
      const row = await docs.insert({ ...d, standard_reference: d.standard_reference || null, valid_until: d.valid_until || null, change_note: d.change_note || null, file_path },
        "Document published. Any earlier version is now superseded.");
      if (row) {
        setModal("");
        setFile(null);
        setD({ ...d, title: "", standard_reference: "", valid_until: "", change_note: "" });
        docs.reload();
      }
    } catch (err) {
      toast(errorMessage(err), "error");
    }
    setBusy(false);
  };
  const newVersion = (x: Row) => {
    setD({ document_type: x.document_type, title: x.title, standard_reference: x.standard_reference ?? "", valid_until: "", change_note: "" });
    setModal("doc");
  };
  const checkValidity = async () => {
    const { data, error } = await supabase.rpc("check_document_validity");
    if (error) return toast(errorMessage(error), "error");
    toast(`${data} document(s) expired; administrators are warned 60 days ahead.`);
    docs.reload();
  };
  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.rpc("generate_statutory_report", { p_kind: rp.kind, p_period: rp.period });
    setBusy(false);
    if (error) return toast(errorMessage(error), "error");
    toast("Report generated and filed.");
    setModal("");
    reports.reload();
  };
  const printReport = (r: Row) =>
    printDocument(`${reportLabel(r.kind)} ${r.period}`,
      `<div class="brand"><div><h1>${escapeHtml(reportLabel(r.kind))}</h1><div class="muted">Statutory return • period ${escapeHtml(r.period)}</div></div><div class="right muted">Generated ${escapeHtml(fmtDateTime(r.generated_at))}</div></div>
       <table><tbody>${flatten(r.data).map((x) => `<tr><td>${escapeHtml(x.key)}</td><td class="right">${escapeHtml(x.value)}</td></tr>`).join("")}</tbody></table>`);

  const soon = SOON;
  const visible = docs.rows.filter((x) => (showOld || x.status !== "superseded") && matches(search, x.title, x.standard_reference, x.document_type));
  const expiring = docs.rows.filter((x) => x.status === "current" && x.valid_until && x.valid_until <= soon);

  return (
    <ModuleShell
      title="Compliance"
      icon={FileCheck2}
      tabs={[
        { id: "documents" as TabId, label: "Institutional Documents", group: "Compliance & Accreditation" },
        ...(admin ? [{ id: "reports" as TabId, label: "Statutory Reports", group: "Compliance & Accreditation" }] : []),
      ]}
      activeTab={tab}
      onTab={setTab}
      search={tab === "documents" ? search : undefined}
      onSearch={tab === "documents" ? setSearch : undefined}
      searchPlaceholder="Search documents, standards..."
      action={admin ? (tab === "documents" ? <ActionButton icon={Plus} onClick={() => { setD({ document_type: "policy", title: "", standard_reference: "", valid_until: "", change_note: "" }); setModal("doc"); }}>Publish Document</ActionButton>
        : <ActionButton icon={BarChart3} onClick={() => setModal("report")}>Generate Report</ActionButton>) : null}
    >
      {modal === "doc" && (
        <Modal title="Publish Document" icon={FileText} onClose={() => setModal("")}>
          <form onSubmit={saveDoc} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Type">
                <select className={inputClass} value={d.document_type} onChange={(e) => setD({ ...d, document_type: e.target.value })}>
                  {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Valid Until"><input type="date" className={inputClass} value={d.valid_until} onChange={(e) => setD({ ...d, valid_until: e.target.value })} /></Field>
            </div>
            <Field label="Title"><input required className={inputClass} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="Laboratory Safety Policy" /></Field>
            <Field label="Standard / Regulation"><input className={inputClass} value={d.standard_reference} onChange={(e) => setD({ ...d, standard_reference: e.target.value })} placeholder="ISO 45001 §6.1" /></Field>
            <Field label="What changed"><input className={inputClass} value={d.change_note} onChange={(e) => setD({ ...d, change_note: e.target.value })} /></Field>
            <Field label="File (PDF)"><input type="file" accept=".pdf,.doc,.docx" className={inputClass} onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
            <p className="text-xs text-slate-500">Publishing a document with the same type and title creates the next version and supersedes the current one.</p>
            <SubmitButton busy={busy}>Publish</SubmitButton>
          </form>
        </Modal>
      )}
      {modal === "report" && (
        <Modal title="Generate Statutory Report" icon={BarChart3} onClose={() => setModal("")}>
          <form onSubmit={generate} className="space-y-4">
            <Field label="Report">
              <select className={inputClass} value={rp.kind} onChange={(e) => setRp({ ...rp, kind: e.target.value })}>
                {REPORTS.map((r) => <option key={r.kind} value={r.kind}>{r.label}</option>)}
              </select>
            </Field>
            <Field label="Period"><input required className={inputClass} value={rp.period} onChange={(e) => setRp({ ...rp, period: e.target.value })} /></Field>
            <SubmitButton busy={busy}>Generate</SubmitButton>
          </form>
        </Modal>
      )}
      {viewing && (
        <Modal title={`${reportLabel(viewing.kind)} — ${viewing.period}`} icon={BarChart3} onClose={() => setViewing(null)}>
          <Table headers={["Measure", "Value"]}>
            {flatten(viewing.data).map((x) => <tr key={x.key}><td className="px-4 py-2 text-sm capitalize">{x.key}</td><td className="px-4 py-2 font-bold text-right">{x.value}</td></tr>)}
          </Table>
          <div className="flex gap-2 mt-4">
            <button onClick={() => printReport(viewing)} className="text-sm font-bold text-slate-700 bg-slate-100 px-4 py-2 rounded-xl flex items-center gap-2"><Printer size={16} /> Print</button>
            <button onClick={() => downloadCsv(`${viewing.kind}-${viewing.period}.csv`, flatten(viewing.data), [{ key: "key", label: "Measure" }, { key: "value", label: "Value" }])} className="text-sm font-bold text-slate-700 bg-slate-100 px-4 py-2 rounded-xl flex items-center gap-2"><Download size={16} /> CSV</button>
          </div>
        </Modal>
      )}

      {tab === "documents" ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard label="Current Documents" value={docs.rows.filter((x) => x.status === "current").length} icon={FileText} color="emerald" />
            <StatCard label="Expiring in 60 Days" value={expiring.length} icon={AlertTriangle} color="orange" />
            <StatCard label="Expired" value={docs.rows.filter((x) => x.status === "expired").length} icon={AlertTriangle} color="red" />
          </div>
          <Card title="Institutional documents" action={
            <div className="flex flex-wrap gap-3 items-center">
              <label className="text-xs font-bold text-slate-500 flex items-center gap-2"><input type="checkbox" checked={showOld} onChange={(e) => setShowOld(e.target.checked)} /> Show old versions</label>
              {admin && <button onClick={checkValidity} className="text-sm font-bold text-orange-600 bg-orange-50 px-4 py-2 rounded-xl flex items-center gap-2"><RefreshCw size={16} /> Check expiry</button>}
            </div>
          }>
            {docs.loading ? <Loading /> : (
              <Table headers={["Document", "Type", "Standard", "Version", "Valid Until", "Status", ""]} empty={visible.length === 0 && "No documents yet."}>
                {visible.map((x) => (
                  <tr key={x.id}>
                    <td className="px-6 py-4"><p className="font-bold text-slate-800">{x.title}</p>{x.change_note && <p className="text-xs text-slate-400">{x.change_note}</p>}</td>
                    <td className="px-6 py-4 text-sm capitalize">{x.document_type}</td>
                    <td className="px-6 py-4 text-sm">{x.standard_reference ?? "—"}</td>
                    <td className="px-6 py-4 font-mono text-sm">v{x.version}</td>
                    <td className={`px-6 py-4 text-sm ${x.status === "current" && x.valid_until && x.valid_until <= soon ? "text-orange-600 font-bold" : ""}`}>{x.valid_until ? fmtDate(x.valid_until) : "—"}</td>
                    <td className="px-6 py-4"><Badge color={STATUS_COLOR[x.status]}>{x.status}</Badge></td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      {x.file_path && <button onClick={() => openStoredFile(BUCKET, x.file_path).catch((e) => toast(errorMessage(e), "error"))} className="text-xs font-bold text-indigo-600 mr-3">Open</button>}
                      {admin && x.status === "current" && <button onClick={() => newVersion(x)} className="text-xs font-bold text-slate-600"><Upload size={12} className="inline mr-1" />New version</button>}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      ) : (
        <Card title="Statutory reports on file">
          {reports.loading ? <Loading /> : (
            <Table headers={["Report", "Period", "Generated", ""]} empty={reports.rows.length === 0 && "No reports generated yet."}>
              {reports.rows.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setViewing(r)}>
                  <td className="px-6 py-4 font-bold">{reportLabel(r.kind)}</td>
                  <td className="px-6 py-4">{r.period}</td>
                  <td className="px-6 py-4 text-sm text-slate-500">{fmtDateTime(r.generated_at)}</td>
                  <td className="px-6 py-4 text-right text-xs font-bold text-indigo-600">View</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}
    </ModuleShell>
  );
}
