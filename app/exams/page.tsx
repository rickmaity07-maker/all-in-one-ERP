"use client";

import { useState } from "react";
import { ClipboardCheck, AlertTriangle, CheckCircle2, Clock, MapPin, ShieldAlert, Plus, Trash2, ShieldX, Check, Search, Eye, Timer } from "lucide-react";
import { useSession, isStaff } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import { ModuleShell, Modal, Field, SubmitButton, ActionButton, PageHeading, Card, Table, Loading, Empty, Badge, StatCard, inputClass, confirmAction } from "@/components/ui";
import { fmtDate, matches, type Row } from "@/lib/utils";

type TabId = "schedule" | "plagiarism";
const EXAM_STATUSES = ["Upcoming", "In Progress", "Completed", "Cancelled"];

// exam_date is free text in older rows ("Aug 28, 09:00 AM"); new rows store an ISO datetime.
const showDate = (v: string) => {
  const d = new Date(v);
  return v && /^\d{4}-\d{2}-\d{2}/.test(v) && !isNaN(d.getTime()) ? d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : v;
};

export default function ExamsPortal() {
  const { role } = useSession();
  const canManage = isStaff(role);
  const [activeTab, setActiveTab] = useState<TabId>("schedule");
  const [search, setSearch] = useState("");
  const exams = useTable("exams", { orderBy: "exam_date", ascending: true });
  const flags = useTable("integrity_flags", { enabled: canManage });

  const [modal, setModal] = useState<"" | "exam" | "flag">("");
  const [busy, setBusy] = useState(false);
  const [exam, setExam] = useState({ course_name: "", exam_date: "", exam_type: "Midterm", location: "Main Hall", duration_minutes: "90" });
  const [flag, setFlag] = useState({ student_name: "", assessment: "", similarity: "", source: "" });
  const [reviewing, setReviewing] = useState<Row | null>(null);

  const handleAddExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const row = await exams.insert(
      { ...exam, duration_minutes: parseInt(exam.duration_minutes) || null, status: "Upcoming" },
      "Exam published."
    );
    setBusy(false);
    if (row) {
      setExam({ course_name: "", exam_date: "", exam_type: "Midterm", location: "Main Hall", duration_minutes: "90" });
      setModal("");
      setActiveTab("schedule");
    }
  };

  const handleAddFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const row = await flags.insert({ ...flag, similarity: parseInt(flag.similarity) || 0, status: "Open" }, "Flag logged.");
    setBusy(false);
    if (row) {
      setFlag({ student_name: "", assessment: "", similarity: "", source: "" });
      setModal("");
    }
  };

  const visibleExams = exams.rows.filter((x) => matches(search, x.course_name, x.exam_type, x.location, x.id));
  const openFlags = flags.rows.filter((f) => f.status === "Open" || f.status === "Under Review");
  const cleared = flags.rows.filter((f) => f.status === "Cleared" || f.status === "Confirmed");
  const visibleFlags = flags.rows.filter((f) => matches(search, f.student_name, f.assessment, f.source));

  return (
    <ModuleShell
      title="Examinations"
      icon={ClipboardCheck}
      tabs={[
        { id: "schedule", label: canManage ? "Global Exam Schedule" : "My Exam Schedule", group: "Testing Center" },
        ...(canManage ? [{ id: "plagiarism" as TabId, label: "Plagiarism & Integrity Alerts", group: "Testing Center" }] : []),
      ]}
      activeTab={activeTab}
      onTab={setActiveTab}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search courses or exam IDs..."
      action={
        canManage && (
          <ActionButton icon={Plus} onClick={() => setModal(activeTab === "plagiarism" ? "flag" : "exam")}>
            {activeTab === "plagiarism" ? "Log Flag" : "Schedule Exam"}
          </ActionButton>
        )
      }
    >
      {modal === "exam" && (
        <Modal title="Schedule Exam" icon={ClipboardCheck} onClose={() => setModal("")}>
          <form onSubmit={handleAddExam} className="space-y-4">
            <Field label="Course Name"><input required className={inputClass} value={exam.course_name} onChange={(e) => setExam({ ...exam, course_name: e.target.value })} placeholder="e.g. MEC-401 Advanced Kinematics" /></Field>
            <Field label="Exam Date & Time"><input type="datetime-local" required className={inputClass} value={exam.exam_date} onChange={(e) => setExam({ ...exam, exam_date: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Location"><input className={inputClass} value={exam.location} onChange={(e) => setExam({ ...exam, location: e.target.value })} /></Field>
              <Field label="Duration (min)"><input type="number" min="5" className={inputClass} value={exam.duration_minutes} onChange={(e) => setExam({ ...exam, duration_minutes: e.target.value })} /></Field>
            </div>
            <Field label="Assessment Type">
              <select className={inputClass} value={exam.exam_type} onChange={(e) => setExam({ ...exam, exam_type: e.target.value })}>
                <option value="Quiz">Quiz</option>
                <option value="Midterm">Midterm</option>
                <option value="Final">Final Exam</option>
                <option value="Oral">Oral Exam</option>
              </select>
            </Field>
            <SubmitButton busy={busy}>Publish Exam</SubmitButton>
          </form>
        </Modal>
      )}

      {modal === "flag" && (
        <Modal title="Log Integrity Flag" icon={ShieldAlert} onClose={() => setModal("")}>
          <form onSubmit={handleAddFlag} className="space-y-4">
            <Field label="Student"><input required className={inputClass} value={flag.student_name} onChange={(e) => setFlag({ ...flag, student_name: e.target.value })} /></Field>
            <Field label="Assessment / Course"><input required className={inputClass} value={flag.assessment} onChange={(e) => setFlag({ ...flag, assessment: e.target.value })} placeholder="e.g. MEC-401 Final Essay" /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Similarity %"><input type="number" min="0" max="100" required className={inputClass} value={flag.similarity} onChange={(e) => setFlag({ ...flag, similarity: e.target.value })} /></Field>
              <Field label="Detected Source"><input className={inputClass} value={flag.source} onChange={(e) => setFlag({ ...flag, source: e.target.value })} /></Field>
            </div>
            <SubmitButton busy={busy}>Save Flag</SubmitButton>
          </form>
        </Modal>
      )}

      {reviewing && (
        <Modal title={`Review — ${reviewing.student_name}`} icon={Eye} onClose={() => setReviewing(null)}>
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-2xl text-sm">
              <p className="font-bold text-slate-800">{reviewing.assessment}</p>
              <p className="text-slate-500 mt-1">{reviewing.similarity}% match • {reviewing.source || "Unknown source"} • logged {fmtDate(reviewing.created_at)}</p>
            </div>
            <Field label="Investigation Notes">
              <textarea rows={4} className={inputClass} defaultValue={reviewing.notes ?? ""} id="flag-notes" />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              {[
                { s: "Under Review", c: "bg-orange-500 hover:bg-orange-600" },
                { s: "Confirmed", c: "bg-red-500 hover:bg-red-600" },
                { s: "Cleared", c: "bg-emerald-500 hover:bg-emerald-600" },
              ].map(({ s, c }) => (
                <button
                  key={s}
                  onClick={async () => {
                    const notes = (document.getElementById("flag-notes") as HTMLTextAreaElement).value;
                    if (await flags.update(reviewing.id, { status: s, notes }, `Flag marked ${s.toLowerCase()}.`)) setReviewing(null);
                  }}
                  className={`py-2.5 text-white text-xs font-bold rounded-xl ${c}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {exams.loading ? (
        <Loading label="Syncing exams with cloud..." />
      ) : activeTab === "schedule" ? (
        <>
          <PageHeading title="Academic Assessment" subtitle={canManage ? "Manage upcoming exams, seating allocations, and integrity reports." : "Your upcoming exams, times and rooms."} />
          <div className={`grid gap-8 ${canManage ? "grid-cols-3" : "grid-cols-2"}`}>
            <Card title={`Exams (${visibleExams.length})`} className="col-span-2">
              {visibleExams.length === 0 ? (
                <Empty>No exams scheduled.</Empty>
              ) : (
                <div className="space-y-4">
                  {visibleExams.map((x) => (
                    <div key={x.id} className="p-5 rounded-2xl border border-blue-100 bg-blue-50/30 hover:border-blue-300 transition-all">
                      <div className="flex justify-between items-start mb-4 gap-4">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-100 px-2 py-1 rounded-lg">{x.exam_type}</span>
                          <h4 className="font-bold text-slate-800 text-lg mt-2">{x.course_name}</h4>
                        </div>
                        <div className="text-right flex items-center gap-4">
                          <p className="text-sm font-bold text-slate-800">{showDate(x.exam_date)}</p>
                          {canManage && (
                            <button onClick={() => confirmAction(`Delete ${x.course_name}?`) && exams.remove(x.id, "Exam removed.")} className="text-slate-400 hover:text-red-500"><Trash2 size={18} /></button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm font-medium text-slate-600">
                        <span className="flex items-center gap-1.5"><MapPin size={16} className="text-blue-500" /> {x.location || "TBA"}</span>
                        {x.duration_minutes && <span className="flex items-center gap-1.5"><Timer size={16} className="text-blue-500" /> {x.duration_minutes} min</span>}
                        <span className="flex items-center gap-1.5 ml-auto">
                          <Clock size={16} className="text-blue-500" />
                          {canManage ? (
                            <select value={x.status} onChange={(e) => exams.update(x.id, { status: e.target.value })} className="bg-transparent font-semibold outline-none cursor-pointer">
                              {EXAM_STATUSES.map((s) => <option key={s}>{s}</option>)}
                            </select>
                          ) : (
                            x.status
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {canManage && (
              <div className="col-span-1 bg-linear-to-br from-[#8A2387] to-[#E94057] rounded-4xl p-8 text-white shadow-lg relative overflow-hidden h-fit">
                <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                <h3 className="text-lg font-bold text-white/90 mb-6 flex items-center gap-2"><ShieldAlert size={20} /> Quick Alerts</h3>
                {openFlags.length === 0 ? (
                  <p className="text-sm text-white/80">No open integrity flags.</p>
                ) : (
                  openFlags.slice(0, 3).map((f) => (
                    <div key={f.id} className="bg-black/20 backdrop-blur-md rounded-2xl p-4 border border-white/10 mb-4 cursor-pointer hover:bg-black/30 transition-colors" onClick={() => setActiveTab("plagiarism")}>
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-red-200">{f.similarity >= 70 ? "High Match" : "Match"}</span>
                        <span className="text-xs font-bold bg-red-500 text-white px-2 py-0.5 rounded-md">{f.similarity}%</span>
                      </div>
                      <p className="text-sm font-bold text-white mb-1">{f.assessment}</p>
                      <p className="text-xs text-white/70">{f.student_name} — view in console &rarr;</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <PageHeading title="Academic Integrity Console" subtitle="Review plagiarism flags and code similarity reports." />
          <div className="grid grid-cols-3 gap-6 mb-8">
            <StatCard label="Active Flags" value={`${openFlags.length} Pending`} icon={ShieldX} color="red" />
            <StatCard label="Resolved" value={`${cleared.length} Closed`} icon={CheckCircle2} color="emerald" />
            <StatCard label="Total Logged" value={`${flags.rows.length} Cases`} icon={Search} color="blue" />
          </div>
          <Card title="Flagged Submissions Queue">
            {flags.loading ? (
              <Loading />
            ) : (
              <Table headers={["Student", "Assessment / Course", "Similarity Index", "Status", "Actions"]} empty={visibleFlags.length === 0 && "No integrity flags logged."}>
                {visibleFlags.map((f) => (
                  <tr key={f.id} className="hover:bg-red-50/30 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-800">{f.student_name}</td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-700">{f.assessment}</div>
                      <div className="text-xs text-slate-500">{f.source || "—"} • {fmtDate(f.created_at)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge color={f.similarity >= 70 ? "red" : "orange"}><AlertTriangle size={12} /> {f.similarity}% Match</Badge>
                    </td>
                    <td className="px-6 py-4">
                      <Badge color={f.status === "Cleared" ? "green" : f.status === "Confirmed" ? "red" : f.status === "Under Review" ? "orange" : "slate"}>{f.status}</Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setReviewing(f)} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-xs">Review</button>
                        {f.status !== "Cleared" && (
                          <button onClick={() => flags.update(f.id, { status: "Cleared" }, "Flag dismissed.")} className="p-2 text-emerald-500 hover:bg-emerald-50 rounded-xl" title="Dismiss Flag"><Check size={18} /></button>
                        )}
                        <button onClick={() => confirmAction("Delete this flag?") && flags.remove(f.id)} className="p-2 text-slate-300 hover:text-red-500 rounded-xl" title="Delete"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </>
      )}
    </ModuleShell>
  );
}
