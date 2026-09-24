"use client";

import { useEffect, useState } from "react";
import {
  GraduationCap, Download, CheckCircle2, Plus, Trash2, AlertTriangle, Mail, ShieldAlert, BookOpen, Pencil, Printer, Inbox,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, isStaff } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import { ModuleShell, Modal, Field, SubmitButton, ActionButton, PageHeading, Card, Table, Loading, Empty, Badge, StatCard, IconButton, inputClass, toast, confirmAction } from "@/components/ui";
import { downloadCsv, errorMessage, escapeHtml, fmtDate, matches, printDocument, type Row } from "@/lib/utils";

type TabId = "main" | "secondary" | "requests";
const STATUS_COLORS: Record<string, string> = { Active: "green", Probation: "orange", Graduated: "blue", Withdrawn: "slate" };

async function printTranscript(record: Row) {
  const { data: courses } = await supabase.from("student_courses").select("*").eq("record_id", record.id).order("term");
  const rows = (courses ?? [])
    .map((c) => `<tr><td>${escapeHtml(c.course_code)}</td><td>${escapeHtml(c.course_name)}</td><td>${escapeHtml(c.term)}</td><td class="right">${c.credits}</td><td class="right">${escapeHtml(c.grade ?? "In progress")}</td></tr>`)
    .join("");
  printDocument(
    `Transcript - ${record.student_name}`,
    `<div class="brand"><div><h1>Official Academic Transcript</h1><div class="muted">Office of the Registrar • All-In-One ERP</div></div>
      <div class="right muted">Issued ${new Date().toLocaleDateString()}</div></div>
     <p><b>${escapeHtml(record.student_name)}</b>${record.student_number ? ` • ID ${escapeHtml(record.student_number)}` : ""}<br/>
     ${escapeHtml(record.major)} • Status: ${escapeHtml(record.enrollment_status)}</p>
     <p>Cumulative GPA: <b>${record.gpa ?? "—"}</b> • Credits: <b>${record.credits_earned ?? 0} / ${record.credits_required ?? 180}</b></p>
     <h2>Courses</h2>
     <table><thead><tr><th>Code</th><th>Course</th><th>Term</th><th class="right">Credits</th><th class="right">Grade</th></tr></thead>
     <tbody>${rows || `<tr><td colspan="5" class="muted">No courses recorded.</td></tr>`}</tbody></table>`
  );
}

export default function RegistrarPortal() {
  const { role, profile } = useSession();
  const staff = isStaff(role);
  const [activeTab, setActiveTab] = useState<TabId>("main");
  const [search, setSearch] = useState("");

  const records = useTable("registrar_records", staff ? {} : { eq: { profile_id: profile?.id ?? "" } });
  const requests = useTable("transcript_requests");
  const [accounts, setAccounts] = useState<Row[]>([]);
  const [courses, setCourses] = useState<Row[]>([]);

  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [form, setForm] = useState({ student_name: "", major: "B.Eng. Mechatronics", gpa: "", student_number: "", profile_id: "", credits_earned: "0", credits_required: "180" });
  const [coursesFor, setCoursesFor] = useState<Row | null>(null);
  const [course, setCourse] = useState({ course_code: "", course_name: "", term: "", credits: "5", grade: "" });
  const [counsel, setCounsel] = useState<Row | null>(null);
  const [counselDate, setCounselDate] = useState("");
  const [mailOpen, setMailOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  const myRecord = staff ? null : records.rows[0];

  useEffect(() => {
    if (staff) supabase.from("profiles").select("id, full_name").eq("role", "student").order("full_name").then(({ data }) => setAccounts(data ?? []));
  }, [staff]);

  const loadCourses = async (recordId: string) => {
    const { data, error } = await supabase.from("student_courses").select("*").eq("record_id", recordId).order("term");
    if (error) toast(errorMessage(error), "error");
    setCourses(data ?? []);
  };

  const courseRecordId = coursesFor?.id ?? myRecord?.id;
  useEffect(() => {
    if (!courseRecordId) return;
    let cancelled = false;
    supabase.from("student_courses").select("*").eq("record_id", courseRecordId).order("term").then(({ data, error }) => {
      if (cancelled) return;
      if (error) toast(errorMessage(error), "error");
      setCourses(data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [courseRecordId]);

  const openEditor = (r: Row | "new") => {
    setEditing(r);
    setForm(
      r === "new"
        ? { student_name: "", major: "B.Eng. Mechatronics", gpa: "", student_number: "", profile_id: "", credits_earned: "0", credits_required: "180" }
        : {
            student_name: r.student_name, major: r.major ?? "", gpa: String(r.gpa ?? ""), student_number: r.student_number ?? "",
            profile_id: r.profile_id ?? "", credits_earned: String(r.credits_earned ?? 0), credits_required: String(r.credits_required ?? 180),
          }
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const values = {
      student_name: form.student_name,
      major: form.major,
      gpa: form.gpa ? parseFloat(form.gpa) : null,
      student_number: form.student_number || null,
      profile_id: form.profile_id || null,
      credits_earned: parseInt(form.credits_earned) || 0,
      credits_required: parseInt(form.credits_required) || 180,
    };
    const ok = editing === "new" ? await records.insert({ ...values, enrollment_status: "Active" }, "Student added.") : await records.update((editing as Row).id, values, "Record updated.");
    setBusy(false);
    if (ok) setEditing(null);
  };

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coursesFor) return;
    const { error } = await supabase.from("student_courses").insert([{ ...course, credits: parseInt(course.credits) || 0, grade: course.grade || null, record_id: coursesFor.id }]);
    if (error) return toast(errorMessage(error), "error");
    setCourse({ course_code: "", course_name: "", term: "", credits: "5", grade: "" });
    loadCourses(coursesFor.id);
  };

  const updateCourse = async (id: string, values: Row) => {
    const { error } = await supabase.from("student_courses").update(values).eq("id", id);
    if (error) toast(errorMessage(error), "error");
    else if (coursesFor) loadCourses(coursesFor.id);
  };

  const deleteCourse = async (id: string) => {
    const { error } = await supabase.from("student_courses").delete().eq("id", id);
    if (error) toast(errorMessage(error), "error");
    else if (coursesFor) loadCourses(coursesFor.id);
  };

  const scheduleCounseling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!counsel) return;
    const { error } = await supabase.from("calendar_events").insert([{
      event_title: `Counseling: ${counsel.student_name}`, event_date: counselDate, event_type: "meeting", location: "Registrar's Office",
    }]);
    if (error) return toast(errorMessage(error), "error");
    toast("Counseling session added to the Master Calendar.");
    setCounsel(null);
    setCounselDate("");
  };

  const requestMail = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const row = await requests.insert({ requester_id: profile?.id, requester_name: profile?.full_name, delivery: "Mail", address }, "Request sent to the Registrar.");
    setBusy(false);
    if (row) {
      setMailOpen(false);
      setAddress("");
    }
  };

  const visible = records.rows.filter((r) => matches(search, r.student_name, r.major, r.student_number, r.id));
  const probation = visible.filter((r) => r.enrollment_status === "Probation");
  const pendingRequests = requests.rows.filter((r) => r.status === "Pending");

  const tabs = staff
    ? [
        { id: "main" as TabId, label: "Global Student Directory", group: "Records" },
        { id: "secondary" as TabId, label: "Academic Probation", group: "Records" },
        { id: "requests" as TabId, label: `Transcript Requests (${pendingRequests.length})`, group: "Records" },
      ]
    : [
        { id: "main" as TabId, label: "My Degree Audit", group: "Records" },
        { id: "secondary" as TabId, label: "Request Official Transcript", group: "Records" },
      ];

  return (
    <ModuleShell
      title="Registrar"
      icon={GraduationCap}
      tabs={tabs}
      activeTab={activeTab}
      onTab={setActiveTab}
      search={staff ? search : undefined}
      onSearch={staff ? setSearch : undefined}
      searchPlaceholder="Search student ID or name..."
      action={staff && <ActionButton icon={Plus} onClick={() => openEditor("new")}>Add Student</ActionButton>}
    >
      {editing && (
        <Modal title={editing === "new" ? "Add Student Record" : "Edit Student Record"} icon={GraduationCap} onClose={() => setEditing(null)}>
          <form onSubmit={handleSave} className="space-y-4">
            <Field label="Student Name"><input required className={inputClass} value={form.student_name} onChange={(e) => setForm({ ...form, student_name: e.target.value })} placeholder="e.g. Elena Rodriguez" /></Field>
            <Field label="Linked Login Account">
              <select
                className={inputClass}
                value={form.profile_id}
                onChange={(e) => {
                  const a = accounts.find((x) => x.id === e.target.value);
                  setForm({ ...form, profile_id: e.target.value, student_name: form.student_name || a?.full_name || "" });
                }}
              >
                <option value="">— Not linked (hidden from student) —</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Student Number"><input className={inputClass} value={form.student_number} onChange={(e) => setForm({ ...form, student_number: e.target.value })} /></Field>
              <Field label="Current GPA"><input type="number" step="0.01" min="0" max="4" className={inputClass} value={form.gpa} onChange={(e) => setForm({ ...form, gpa: e.target.value })} /></Field>
            </div>
            <Field label="Major / Program"><input required className={inputClass} value={form.major} onChange={(e) => setForm({ ...form, major: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Credits Earned"><input type="number" min="0" className={inputClass} value={form.credits_earned} onChange={(e) => setForm({ ...form, credits_earned: e.target.value })} /></Field>
              <Field label="Credits Required"><input type="number" min="1" className={inputClass} value={form.credits_required} onChange={(e) => setForm({ ...form, credits_required: e.target.value })} /></Field>
            </div>
            <SubmitButton busy={busy}>Save Record</SubmitButton>
          </form>
        </Modal>
      )}

      {coursesFor && (
        <Modal title={`Courses — ${coursesFor.student_name}`} icon={BookOpen} onClose={() => setCoursesFor(null)} wide>
          <form onSubmit={handleAddCourse} className="grid grid-cols-6 gap-2 mb-6 items-end">
            <input placeholder="Code" className={`${inputClass} col-span-1`} value={course.course_code} onChange={(e) => setCourse({ ...course, course_code: e.target.value })} />
            <input placeholder="Course name" required className={`${inputClass} col-span-2`} value={course.course_name} onChange={(e) => setCourse({ ...course, course_name: e.target.value })} />
            <input placeholder="Term" className={inputClass} value={course.term} onChange={(e) => setCourse({ ...course, term: e.target.value })} />
            <input placeholder="Credits" type="number" className={inputClass} value={course.credits} onChange={(e) => setCourse({ ...course, credits: e.target.value })} />
            <button type="submit" className="py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700">Add</button>
          </form>
          {courses.length === 0 ? (
            <Empty>No courses recorded.</Empty>
          ) : (
            <div className="space-y-2">
              {courses.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 text-sm">{c.course_code} {c.course_name}</p>
                    <p className="text-xs text-slate-500">{c.term || "—"} • {c.credits} credits</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      defaultValue={c.grade ?? ""}
                      placeholder="Grade"
                      className="w-20 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
                      onBlur={(e) => e.target.value !== (c.grade ?? "") && updateCourse(c.id, { grade: e.target.value || null })}
                    />
                    <IconButton icon={Trash2} title="Remove" danger onClick={() => deleteCourse(c.id)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {counsel && (
        <Modal title={`Counseling — ${counsel.student_name}`} icon={ShieldAlert} onClose={() => setCounsel(null)}>
          <form onSubmit={scheduleCounseling} className="space-y-4">
            <Field label="Session Date"><input type="date" required className={inputClass} value={counselDate} onChange={(e) => setCounselDate(e.target.value)} /></Field>
            <SubmitButton busy={false}>Add to Calendar</SubmitButton>
          </form>
        </Modal>
      )}

      {mailOpen && (
        <Modal title="Mailed Physical Copy" icon={Mail} onClose={() => setMailOpen(false)}>
          <form onSubmit={requestMail} className="space-y-4">
            <Field label="Recipient & Postal Address"><textarea required rows={4} className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={"Company / Institution\nStreet, City, Postcode\nCountry"} /></Field>
            <SubmitButton busy={busy}>Submit Request</SubmitButton>
          </form>
        </Modal>
      )}

      {records.loading ? (
        <Loading label="Syncing records with cloud..." />
      ) : !staff ? (
        activeTab === "main" ? (
          !myRecord ? (
            <Empty>No academic record is linked to your account yet. Please contact the Registrar&apos;s Office.</Empty>
          ) : (
            <div className="space-y-8">
              <div className="bg-linear-to-br from-[#2A0845] to-[#6441A5] rounded-4xl p-8 text-white shadow-lg relative overflow-hidden flex justify-between items-center">
                <div className="absolute right-0 top-0 w-64 h-64 bg-cyan-500/20 rounded-full blur-3xl"></div>
                <div className="relative z-10">
                  <h1 className="text-3xl font-black mb-2">{myRecord.student_name}</h1>
                  <p className="text-white/80 font-medium flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span> {myRecord.major} • {myRecord.enrollment_status}
                    {myRecord.student_number && ` • ID ${myRecord.student_number}`}
                  </p>
                </div>
                <div className="relative z-10 text-right bg-black/20 p-4 rounded-2xl backdrop-blur-md">
                  <p className="text-xs uppercase tracking-wider text-white/70 font-bold mb-1">Current GPA</p>
                  <p className="text-4xl font-black text-cyan-300">{myRecord.gpa ?? "—"}<span className="text-lg text-white/50">/4.0</span></p>
                </div>
              </div>

              <Card title={`Degree Progress (${myRecord.credits_earned ?? 0}/${myRecord.credits_required ?? 180} Credits)`}>
                <div className="w-full bg-slate-100 rounded-full h-4 mb-8 overflow-hidden">
                  <div className="bg-linear-to-r from-cyan-400 to-blue-500 h-4 rounded-full" style={{ width: `${Math.min(100, ((myRecord.credits_earned ?? 0) / (myRecord.credits_required || 180)) * 100)}%` }}></div>
                </div>
                {courses.length === 0 ? (
                  <Empty>No courses recorded yet.</Empty>
                ) : (
                  <div className="space-y-4">
                    {courses.map((c) => (
                      <div key={c.id} className="flex items-center justify-between p-5 rounded-2xl border border-slate-100 bg-slate-50/50">
                        <div>
                          <h4 className="font-bold text-slate-800">{c.course_name}</h4>
                          <p className="text-xs font-medium text-slate-500">{c.course_code} • {c.term} • {c.credits} credits</p>
                        </div>
                        {c.grade ? <Badge color="green"><CheckCircle2 size={14} /> Grade: {c.grade}</Badge> : <Badge color="blue">Enrolled</Badge>}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )
        ) : (
          <Card title="Official Transcripts">
            <p className="text-slate-500 text-sm -mt-4 mb-8">Request certified copies of your academic record.</p>
            <div className="grid grid-cols-2 gap-6">
              <div className="border border-slate-200 rounded-3xl p-6 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all">
                <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mb-4"><Download size={24} /></div>
                <h4 className="text-lg font-bold text-slate-800 mb-2">Digital Transcript (PDF)</h4>
                <p className="text-sm text-slate-500 mb-6">Instant download. Choose &quot;Save as PDF&quot; in the print dialog.</p>
                <button disabled={!myRecord} onClick={() => myRecord && printTranscript(myRecord)} className="w-full py-3 bg-slate-900 text-white rounded-xl text-sm font-bold shadow-md hover:bg-slate-800 disabled:opacity-50">Generate PDF</button>
              </div>
              <div className="border border-slate-200 rounded-3xl p-6 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all">
                <div className="w-14 h-14 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center mb-4"><Mail size={24} /></div>
                <h4 className="text-lg font-bold text-slate-800 mb-2">Mailed Physical Copy</h4>
                <p className="text-sm text-slate-500 mb-6">Official sealed document mailed directly to an employer or institution.</p>
                <button onClick={() => setMailOpen(true)} className="w-full py-3 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold shadow-sm hover:bg-slate-50">Request Mail Delivery</button>
              </div>
            </div>
            {requests.rows.length > 0 && (
              <div className="mt-8">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">My Requests</h4>
                <div className="space-y-2">
                  {requests.rows.map((r) => (
                    <div key={r.id} className="flex justify-between p-3 rounded-xl border border-slate-100 text-sm">
                      <span className="text-slate-600">{fmtDate(r.created_at)} — {r.delivery}</span>
                      <Badge color={r.status === "Sent" ? "green" : "orange"}>{r.status}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )
      ) : activeTab === "main" ? (
        <Card
          title={`Global Enrollment Directory (${visible.length})`}
          action={
            <button
              onClick={() => downloadCsv("students.csv", visible, [
                { key: "student_number", label: "Student No" }, { key: "student_name", label: "Name" }, { key: "major", label: "Major" },
                { key: "gpa", label: "GPA" }, { key: "credits_earned", label: "Credits" }, { key: "enrollment_status", label: "Status" },
              ])}
              className="flex items-center gap-2 text-blue-600 font-bold text-sm hover:bg-blue-50 px-4 py-2 rounded-xl"
            >
              <Download size={16} /> Export CSV
            </button>
          }
        >
          <Table headers={["Student Name", "Major / Program", "GPA", "Credits", "Status", "Actions"]} empty={visible.length === 0 && "No student records found."}>
            {visible.map((r) => (
              <tr key={r.id} className="hover:bg-indigo-50/30 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-bold text-slate-800">{r.student_name}</div>
                  <div className="text-xs text-slate-400">{r.student_number || "No ID"}{r.profile_id ? " • linked" : ""}</div>
                </td>
                <td className="px-6 py-4 text-slate-600">{r.major}</td>
                <td className="px-6 py-4 font-bold text-indigo-600">{r.gpa ?? "—"}</td>
                <td className="px-6 py-4 text-slate-600">{r.credits_earned ?? 0}/{r.credits_required ?? 180}</td>
                <td className="px-6 py-4">
                  <select
                    value={r.enrollment_status}
                    onChange={(e) => records.update(r.id, { enrollment_status: e.target.value })}
                    className={`text-xs font-bold uppercase tracking-wider rounded-xl px-2 py-1 outline-none cursor-pointer ${
                      STATUS_COLORS[r.enrollment_status] === "green" ? "bg-emerald-100 text-emerald-700" : STATUS_COLORS[r.enrollment_status] === "orange" ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {Object.keys(STATUS_COLORS).map((s) => <option key={s}>{s}</option>)}
                  </select>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-1">
                    <IconButton icon={BookOpen} title="Courses & grades" onClick={() => setCoursesFor(r)} />
                    <IconButton icon={Pencil} title="Edit" onClick={() => openEditor(r)} />
                    <IconButton icon={Printer} title="Print transcript" onClick={() => printTranscript(r)} />
                    <IconButton icon={Trash2} title="Delete Record" danger onClick={() => confirmAction(`Delete ${r.student_name}'s record and courses?`) && records.remove(r.id, "Record deleted.")} />
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : activeTab === "secondary" ? (
        <>
          <PageHeading title="Academic Probation & Intervention" subtitle="Review students falling below academic standing requirements." />
          <div className="grid grid-cols-3 gap-6 mb-8">
            <StatCard label="At Risk" value={`${probation.length} Students`} icon={ShieldAlert} color="orange" />
            <StatCard label="GPA below 2.0" value={`${visible.filter((r) => r.gpa != null && Number(r.gpa) < 2).length} Students`} icon={AlertTriangle} color="red" />
          </div>
          <Card title="Intervention Queue">
            <Table headers={["Student Name", "Program", "Critical GPA", "Actions"]} empty={probation.length === 0 && "No students are currently on academic probation."}>
              {probation.map((r) => (
                <tr key={r.id} className="hover:bg-orange-50/30 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-800">{r.student_name}</td>
                  <td className="px-6 py-4 text-slate-600">{r.major}</td>
                  <td className="px-6 py-4"><Badge color="red"><AlertTriangle size={14} /> {r.gpa ?? "—"}</Badge></td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button onClick={() => setCounsel(r)} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-xs">Schedule Counseling</button>
                    <button onClick={() => records.update(r.id, { enrollment_status: "Active" }, "Probation lifted.")} className="px-4 py-2 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 shadow-sm text-xs">Lift Probation</button>
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      ) : (
        <>
          <PageHeading title="Transcript Requests" subtitle="Mailed copies requested by students." />
          <Card>
            <Table headers={["Requested", "Student", "Deliver To", "Status", "Actions"]} empty={requests.rows.length === 0 && "No transcript requests."}>
              {requests.rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-6 py-4 text-slate-500">{fmtDate(r.created_at)}</td>
                  <td className="px-6 py-4 font-bold text-slate-800">{r.requester_name}</td>
                  <td className="px-6 py-4 text-xs text-slate-600 whitespace-pre-line">{r.address}</td>
                  <td className="px-6 py-4"><Badge color={r.status === "Sent" ? "green" : "orange"}>{r.status}</Badge></td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      {r.status !== "Sent" && (
                        <button onClick={() => requests.update(r.id, { status: "Sent" }, "Marked as sent.")} className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg flex items-center gap-1"><Inbox size={12} /> Mark Sent</button>
                      )}
                      <IconButton icon={Trash2} title="Delete" danger onClick={() => requests.remove(r.id)} />
                    </div>
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
