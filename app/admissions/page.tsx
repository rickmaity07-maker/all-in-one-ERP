"use client";

import { useRef, useState } from "react";
import { Users, Clock, Plus, Trash2, FileText, Eye, Check, Upload, Download, Mail, Phone, Loader2 } from "lucide-react";
import { useSession, isAdmin } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import {
  ModuleShell, Modal, Field, SubmitButton, ActionButton, PageHeading, Card, Table, Loading,
  AccessDenied, inputClass, toast, confirmAction,
} from "@/components/ui";
import { downloadCsv, errorMessage, fmtDate, matches, openStoredFile, removeStoredFile, uploadFile, type Row } from "@/lib/utils";

const STATUSES = ["Under Review", "Awaiting Documents", "Approved", "Rejected"] as const;
const PROGRAMS = ["B.Eng. Mechatronics", "B.Eng. Mechanical", "M.Sc. Mechatronics", "M.Sc. Robotics"];
const BUCKET = "admission-docs";

type Doc = { name: string; path: string };

export default function AdmissionsPortal() {
  const { role } = useSession();
  const [activeTab, setActiveTab] = useState<"pipeline" | "verification" | "rejected">("pipeline");
  const [search, setSearch] = useState("");
  const { rows: applicants, loading, insert, update, remove } = useTable("admissions", { enabled: isAdmin(role) });

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ applicant_name: "", email: "", phone: "", program: PROGRAMS[0], notes: "" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!isAdmin(role)) return <AccessDenied message="Only Administration and Owners can view the Admissions CRM." />;

  const selected = applicants.find((a) => a.id === selectedId) ?? null;
  const visible = applicants.filter((a) => matches(search, a.applicant_name, a.program, a.email, a.id));
  const byStatus = (s: string) => visible.filter((a) => a.status === s);
  const docsOf = (a: Row): Doc[] => (Array.isArray(a.documents) ? a.documents : []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const row = await insert({ ...form, status: "Under Review" }, "Application added.");
    setBusy(false);
    if (row) {
      setForm({ applicant_name: "", email: "", phone: "", program: PROGRAMS[0], notes: "" });
      setIsAddOpen(false);
    }
  };

  const handleDelete = async (a: Row) => {
    if (!confirmAction(`Delete the application from ${a.applicant_name}? Uploaded documents are removed too.`)) return;
    for (const d of docsOf(a)) await removeStoredFile(BUCKET, d.path);
    if (await remove(a.id, "Application deleted.")) setSelectedId(null);
  };

  const handleUpload = async (files: FileList | null) => {
    if (!selected || !files?.length) return;
    setUploading(true);
    try {
      const added: Doc[] = [];
      for (const f of Array.from(files)) added.push({ name: f.name, path: await uploadFile(BUCKET, f, selected.id) });
      await update(selected.id, { documents: [...docsOf(selected), ...added] }, `${added.length} document(s) uploaded.`);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleRemoveDoc = async (doc: Doc) => {
    if (!selected || !confirmAction(`Remove ${doc.name}?`)) return;
    await removeStoredFile(BUCKET, doc.path);
    await update(selected.id, { documents: docsOf(selected).filter((d) => d.path !== doc.path) });
  };

  const openDoc = (doc: Doc) => openStoredFile(BUCKET, doc.path).catch((e) => toast(errorMessage(e), "error"));

  const exportCsv = () =>
    downloadCsv("applicants.csv", visible, [
      { key: "applicant_name", label: "Name" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
      { key: "program", label: "Program" },
      { key: "status", label: "Status" },
      { key: "created_at", label: "Applied" },
    ]);

  const kanbanCard = (app: Row, accent: string) => (
    <div key={app.id} className="bg-white p-4 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.03)] border border-slate-100 group relative">
      <div className="flex justify-between items-start mb-2">
        <div className={`text-[10px] font-bold uppercase tracking-wider ${accent}`}>{app.program}</div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setSelectedId(app.id)} className="text-slate-300 hover:text-indigo-600" title="Open"><Eye size={14} /></button>
          <button onClick={() => handleDelete(app)} className="text-slate-300 hover:text-red-500" title="Delete Applicant"><Trash2 size={14} /></button>
        </div>
      </div>
      <button onClick={() => setSelectedId(app.id)} className="font-bold text-slate-800 text-sm mb-3 text-left hover:text-indigo-700">{app.applicant_name}</button>
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-400 flex items-center gap-1">
          <Clock size={12} /> {fmtDate(app.created_at)} • <FileText size={12} /> {docsOf(app).length}
        </div>
        <select
          value={app.status}
          onChange={(e) => update(app.id, { status: e.target.value })}
          className="text-xs font-semibold bg-slate-50 border border-slate-200 text-slate-600 rounded-lg px-2 py-1 outline-none cursor-pointer hover:border-blue-400 transition-colors"
        >
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
    </div>
  );

  const columns = [
    { status: "Under Review", accent: "text-blue-600", pill: "bg-blue-100 text-blue-700" },
    { status: "Awaiting Documents", accent: "text-orange-600", pill: "bg-orange-100 text-orange-700" },
    { status: "Approved", accent: "text-emerald-600", pill: "bg-emerald-100 text-emerald-700" },
  ];

  return (
    <ModuleShell
      title="Admissions"
      icon={Users}
      tabs={[
        { id: "pipeline", label: "Active Applicants", group: "Pipeline" },
        { id: "verification", label: "Document Verification", group: "Pipeline" },
        { id: "rejected", label: "Rejected / Archived", group: "Pipeline" },
      ]}
      activeTab={activeTab}
      onTab={setActiveTab}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search applicant names, emails or IDs..."
      action={<ActionButton icon={Plus} onClick={() => setIsAddOpen(true)}>New Applicant</ActionButton>}
    >
      {isAddOpen && (
        <Modal title="New Applicant" icon={Users} onClose={() => setIsAddOpen(false)}>
          <form onSubmit={handleAdd} className="space-y-4">
            <Field label="Full Name">
              <input required className={inputClass} value={form.applicant_name} onChange={(e) => setForm({ ...form, applicant_name: e.target.value })} placeholder="e.g. Lukas Weber" />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Email"><input type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Phone"><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            </div>
            <Field label="Target Program">
              <select className={inputClass} value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value })}>
                {PROGRAMS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Notes"><textarea rows={3} className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <SubmitButton busy={busy}>Submit Application</SubmitButton>
          </form>
        </Modal>
      )}

      {selected && (
        <Modal title={selected.applicant_name} icon={Users} onClose={() => setSelectedId(null)} wide>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="p-4 bg-slate-50 rounded-2xl"><p className="text-xs font-bold text-slate-400 uppercase mb-1">Program</p><p className="font-bold text-slate-800">{selected.program}</p></div>
              <div className="p-4 bg-slate-50 rounded-2xl"><p className="text-xs font-bold text-slate-400 uppercase mb-1">Applied</p><p className="font-bold text-slate-800">{fmtDate(selected.created_at)}</p></div>
              <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-2"><Mail size={14} className="text-slate-400" /> {selected.email || "—"}</div>
              <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-2"><Phone size={14} className="text-slate-400" /> {selected.phone || "—"}</div>
            </div>
            <Field label="Status">
              <select className={inputClass} value={selected.status} onChange={(e) => update(selected.id, { status: e.target.value }, "Status updated.")}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Notes">
              <textarea
                rows={3}
                className={inputClass}
                defaultValue={selected.notes ?? ""}
                onBlur={(e) => e.target.value !== (selected.notes ?? "") && update(selected.id, { notes: e.target.value }, "Notes saved.")}
              />
            </Field>
            <div>
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Documents</h4>
                <button onClick={() => fileRef.current?.click()} disabled={uploading} className="flex items-center gap-2 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-2 rounded-xl hover:bg-indigo-100 disabled:opacity-60">
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload
                </button>
                <input ref={fileRef} type="file" multiple hidden onChange={(e) => handleUpload(e.target.files)} />
              </div>
              {docsOf(selected).length === 0 ? (
                <p className="text-sm text-slate-400">No documents uploaded yet (passport, transcripts, certificates…).</p>
              ) : (
                <div className="space-y-2">
                  {docsOf(selected).map((d) => (
                    <div key={d.path} className="flex items-center justify-between p-3 rounded-xl border border-slate-100">
                      <button onClick={() => openDoc(d)} className="flex items-center gap-2 text-sm font-semibold text-blue-600 hover:underline"><FileText size={14} /> {d.name}</button>
                      <button onClick={() => handleRemoveDoc(d)} className="text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-between pt-2">
              <button onClick={() => handleDelete(selected)} className="text-sm font-bold text-red-600 hover:text-red-700">Delete application</button>
              <button onClick={() => update(selected.id, { status: "Approved" }, "Applicant approved.")} className="px-4 py-2 bg-emerald-500 text-white font-bold rounded-xl text-sm flex items-center gap-1 hover:bg-emerald-600">
                <Check size={14} /> Approve
              </button>
            </div>
          </div>
        </Modal>
      )}

      {loading ? (
        <Loading label="Syncing pipeline with cloud..." />
      ) : activeTab === "pipeline" ? (
        <>
          <PageHeading title="Applicant Pipeline" subtitle="Review pending applications and manage candidate flow.">
            <button onClick={exportCsv} className="flex items-center gap-2 text-blue-600 font-bold text-sm hover:bg-blue-50 px-4 py-2 rounded-xl transition-colors">
              <Download size={16} /> Export CSV
            </button>
          </PageHeading>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {columns.map((c) => (
              <div key={c.status} className="bg-slate-100/50 rounded-4xl p-6 border border-slate-200">
                <h3 className="font-bold text-slate-700 mb-4 flex items-center justify-between">
                  {c.status} <span className={`${c.pill} px-2 py-0.5 rounded-lg text-xs`}>{byStatus(c.status).length}</span>
                </h3>
                <div className="space-y-3">
                  {byStatus(c.status).map((app) => kanbanCard(app, c.accent))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : activeTab === "verification" ? (
        <>
          <PageHeading title="Document Verification Queue" subtitle="Verify passports, visas, and academic transcripts." />
          <Card>
            <Table headers={["Applicant", "Program", "Uploaded Documents", "Actions"]} empty={byStatus("Awaiting Documents").length === 0 && "No candidates are currently awaiting document verification."}>
              {byStatus("Awaiting Documents").map((app) => (
                <tr key={app.id} className="hover:bg-orange-50/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-800 text-base">{app.applicant_name}</div>
                    <div className="text-slate-500 text-xs flex items-center gap-1 mt-1"><Clock size={12} /> Applied {fmtDate(app.created_at)}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-3 py-1 rounded-xl text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-700">{app.program}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2 flex-wrap">
                      {docsOf(app).length === 0 ? (
                        <span className="text-xs text-slate-400">Nothing uploaded yet</span>
                      ) : (
                        docsOf(app).map((d) => (
                          <button key={d.path} onClick={() => openDoc(d)} className="flex items-center gap-1 text-xs font-semibold bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg border border-blue-100 hover:bg-blue-100">
                            <FileText size={14} /> {d.name}
                          </button>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setSelectedId(app.id)} className="p-2 text-slate-400 hover:text-blue-600 bg-white border border-slate-200 rounded-xl shadow-sm" title="Open / upload files"><Eye size={16} /></button>
                      <button onClick={() => update(app.id, { status: "Approved" }, "Documents approved.")} className="px-4 py-2 bg-emerald-500 text-white font-bold rounded-xl shadow-[0_4px_12px_rgba(16,185,129,0.3)] hover:bg-emerald-600 text-xs flex items-center gap-1">
                        <Check size={14} /> Approve Docs
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      ) : (
        <>
          <PageHeading title="Rejected Applications" subtitle="Applications that were declined. Move them back to review if needed." />
          <Card>
            <Table headers={["Applicant", "Program", "Applied", "Actions"]} empty={byStatus("Rejected").length === 0 && "No rejected applications."}>
              {byStatus("Rejected").map((app) => (
                <tr key={app.id}>
                  <td className="px-6 py-4 font-bold text-slate-800">{app.applicant_name}</td>
                  <td className="px-6 py-4 text-slate-600">{app.program}</td>
                  <td className="px-6 py-4 text-slate-500">{fmtDate(app.created_at)}</td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button onClick={() => update(app.id, { status: "Under Review" }, "Moved back to review.")} className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg">Reopen</button>
                    <button onClick={() => handleDelete(app)} className="text-xs font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-lg">Delete</button>
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      )}
    </ModuleShell>
  );
}
