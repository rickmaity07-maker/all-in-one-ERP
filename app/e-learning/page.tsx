"use client";

import { useRef, useState } from "react";
import {
  Plus, BookOpen, Video, FileText, ClipboardList, Users, CloudUpload, PlayCircle, Trash2, Download,
  GraduationCap, Upload, Inbox, Loader2, CheckCircle2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, isStaff } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import { ModuleShell, Modal, Field, SubmitButton, ActionButton, PageHeading, Card, Table, Loading, Empty, Badge, inputClass, toast, confirmAction } from "@/components/ui";
import { errorMessage, fmtDate, fmtDateTime, matches, openStoredFile, removeStoredFile, uploadFile, type Row } from "@/lib/utils";

type TabId = "lectures" | "materials" | "assignments" | "roster";
const BUCKET = "course-files";
const SUB_BUCKET = "submissions";

export default function ELearningPortal() {
  const { role, profile } = useSession();
  const staff = isStaff(role);
  const [activeTab, setActiveTab] = useState<TabId>("lectures");
  const [search, setSearch] = useState("");

  const materials = useTable("course_materials");
  const students = useTable("registrar_records", { eq: { enrollment_status: "Active" }, orderBy: "student_name", ascending: true, enabled: staff });
  const submissions = useTable("assignment_submissions");

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: "", file_type: "Video", description: "", due_date: "", size_mb: "" });
  const [file, setFile] = useState<File | null>(null);

  const [viewSubsFor, setViewSubsFor] = useState<Row | null>(null);
  const [submitFor, setSubmitFor] = useState<Row | null>(null);
  const [subFile, setSubFile] = useState<File | null>(null);
  const [subNote, setSubNote] = useState("");
  const subInput = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const file_path = file ? await uploadFile(BUCKET, file, form.file_type.toLowerCase()) : null;
      const size_mb = file ? Math.round((file.size / 1024 / 1024) * 10) / 10 : parseFloat(form.size_mb) || 0;
      const icon_color = form.file_type === "Video" ? "purple" : form.file_type === "Assignment" ? "orange" : "blue";
      const row = await materials.insert(
        { title: form.title, file_type: form.file_type, description: form.description || null, due_date: form.due_date || null, size_mb, icon_color, file_path },
        "Resource published."
      );
      if (row) {
        setIsUploadOpen(false);
        setForm({ title: "", file_type: "Video", description: "", due_date: "", size_mb: "" });
        setFile(null);
        setActiveTab(row.file_type === "Assignment" ? "assignments" : row.file_type === "Video" ? "lectures" : "materials");
      }
    } catch (err) {
      toast(errorMessage(err), "error");
    }
    setBusy(false);
  };

  const handleDelete = async (m: Row) => {
    const handedIn = submissions.rows.filter((s) => s.material_id === m.id);
    if (!confirmAction(`Delete "${m.title}"?${handedIn.length ? ` ${handedIn.length} student submission(s) will be deleted too.` : ""}`)) return;
    if (!(await materials.remove(m.id, "Resource deleted."))) return;
    // Submission rows cascade in the database; their uploaded files have to be removed here.
    await removeStoredFile(BUCKET, m.file_path);
    const files = handedIn.map((s) => s.file_path).filter(Boolean);
    if (files.length) await supabase.storage.from(SUB_BUCKET).remove(files);
    submissions.setRows((prev) => prev.filter((s) => s.material_id !== m.id));
  };

  const openMaterial = (m: Row) => {
    if (!m.file_path) return toast("No file is attached to this resource.", "error");
    openStoredFile(BUCKET, m.file_path).catch((e) => toast(errorMessage(e), "error"));
  };

  const handleSubmitWork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitFor) return;
    setBusy(true);
    try {
      const file_path = subFile ? await uploadFile(SUB_BUCKET, subFile, submitFor.id) : null;
      const row = await submissions.insert(
        { material_id: submitFor.id, student_id: profile?.id, student_name: profile?.full_name, file_path, note: subNote || null },
        "Work submitted."
      );
      if (row) {
        setSubmitFor(null);
        setSubFile(null);
        setSubNote("");
      }
    } catch (err) {
      toast(errorMessage(err), "error");
    }
    setBusy(false);
  };

  const openEditor = (type?: string) => {
    if (type) setForm((f) => ({ ...f, file_type: type }));
    setIsUploadOpen(true);
  };

  const visible = materials.rows.filter((m) => matches(search, m.title, m.description, m.file_type));
  const videoLectures = visible.filter((m) => m.file_type === "Video" || m.file_type === "MP4");
  const studyDocs = visible.filter((m) => ["PDF", "Code", "Archive", "Slides"].includes(m.file_type));
  const assignments = visible.filter((m) => m.file_type === "Assignment");
  const featured = videoLectures[0];
  const subsFor = (id: string) => submissions.rows.filter((s) => s.material_id === id);
  const mySub = (id: string) => submissions.rows.find((s) => s.material_id === id && s.student_id === profile?.id);

  const tabs = [
    { id: "lectures" as TabId, label: "All Lectures", icon: Video, group: "Course Management" },
    { id: "materials" as TabId, label: "Study Materials", icon: FileText, group: "Course Management" },
    { id: "assignments" as TabId, label: "Assignments", icon: ClipboardList, group: "Classroom" },
    ...(staff ? [{ id: "roster" as TabId, label: "Student Roster", icon: Users, group: "Classroom" }] : []),
  ];

  return (
    <ModuleShell
      title="E-Learning"
      icon={BookOpen}
      tabs={tabs}
      activeTab={activeTab}
      onTab={setActiveTab}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search lectures or documents..."
      action={staff && <ActionButton icon={Plus} onClick={() => openEditor()}>Create Module</ActionButton>}
    >
      {isUploadOpen && (
        <Modal title="Upload Resource" icon={CloudUpload} onClose={() => setIsUploadOpen(false)}>
          <form onSubmit={handleUpload} className="space-y-4">
            <Field label="Resource Title"><input required className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Kinematics Final Project" /></Field>
            <Field label="Type">
              <select className={inputClass} value={form.file_type} onChange={(e) => setForm({ ...form, file_type: e.target.value })}>
                <option value="Video">Video Lecture</option>
                <option value="PDF">Document (PDF)</option>
                <option value="Slides">Slides</option>
                <option value="Code">Code File</option>
                <option value="Archive">Archive (ZIP)</option>
                <option value="Assignment">Assignment</option>
              </select>
            </Field>
            <Field label="Description"><textarea rows={2} className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            {form.file_type === "Assignment" && (
              <Field label="Due Date"><input type="date" className={inputClass} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
            )}
            <Field label={form.file_type === "Assignment" ? "Brief / Instructions File (optional)" : "File"}>
              <input type="file" className={inputClass} onChange={(e) => setFile(e.target.files?.[0] ?? null)} required={form.file_type !== "Assignment"} />
            </Field>
            <SubmitButton busy={busy}>Publish</SubmitButton>
          </form>
        </Modal>
      )}

      {submitFor && (
        <Modal title={`Submit: ${submitFor.title}`} icon={Upload} onClose={() => setSubmitFor(null)}>
          <form onSubmit={handleSubmitWork} className="space-y-4">
            <Field label="Your File">
              <input ref={subInput} type="file" required className={inputClass} onChange={(e) => setSubFile(e.target.files?.[0] ?? null)} />
            </Field>
            <Field label="Note to Instructor (optional)"><textarea rows={3} className={inputClass} value={subNote} onChange={(e) => setSubNote(e.target.value)} /></Field>
            <SubmitButton busy={busy}>Hand In</SubmitButton>
          </form>
        </Modal>
      )}

      {viewSubsFor && (
        <Modal title={`Submissions — ${viewSubsFor.title}`} icon={Inbox} onClose={() => setViewSubsFor(null)} wide>
          {subsFor(viewSubsFor.id).length === 0 ? (
            <Empty>No submissions yet.</Empty>
          ) : (
            <div className="space-y-3">
              {subsFor(viewSubsFor.id).map((s) => (
                <div key={s.id} className="p-4 rounded-2xl border border-slate-100 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800">{s.student_name}</p>
                    <p className="text-xs text-slate-500">{fmtDateTime(s.created_at)}{s.note ? ` • "${s.note}"` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {s.file_path && (
                      <button onClick={() => openStoredFile(SUB_BUCKET, s.file_path).catch((e) => toast(errorMessage(e), "error"))} className="p-2 text-slate-400 hover:text-indigo-600" title="Open file"><Download size={16} /></button>
                    )}
                    <input
                      defaultValue={s.grade ?? ""}
                      placeholder="Grade"
                      className="w-20 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
                      onBlur={(e) => e.target.value !== (s.grade ?? "") && submissions.update(s.id, { grade: e.target.value }, "Grade saved.")}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      <PageHeading title="Course Workspace" subtitle={staff ? "Manage your course curriculum, upload lectures, and track engagement." : "Watch lectures, download materials and hand in your assignments."} />

      {materials.loading ? (
        <Loading label="Syncing with database..." />
      ) : activeTab === "lectures" ? (
        <div className="grid grid-cols-3 gap-6">
          <div className={`${staff ? "col-span-2" : "col-span-3"} bg-linear-to-br from-indigo-900 to-[#2A0845] rounded-4xl p-10 flex flex-col justify-between aspect-video relative overflow-hidden shadow-xl`}>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <button
                onClick={() => (featured ? openMaterial(featured) : toast("No lectures uploaded yet.", "error"))}
                className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md hover:scale-110 transition-all border border-white/30 shadow-2xl"
                title="Play latest lecture"
              >
                <PlayCircle size={32} className="text-white ml-1" />
              </button>
            </div>
            <div className="mt-auto relative z-10">
              <span className="bg-pink-500 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-lg mb-3 inline-block">Latest Lecture</span>
              <h2 className="text-3xl font-black text-white">{featured?.title ?? "No lectures yet"}</h2>
              {featured && <p className="text-white/60 text-sm mt-1">Added {fmtDate(featured.created_at)}</p>}
            </div>
          </div>

          {staff && (
            <div onClick={() => openEditor("Video")} className="col-span-1 bg-white border-2 border-dashed border-indigo-200 rounded-4xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-indigo-50/50 hover:border-indigo-400 transition-all group">
              <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform"><CloudUpload size={28} /></div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Upload New Media</h3>
              <p className="text-sm text-slate-500 font-medium px-4">Add a lecture recording to the course.</p>
            </div>
          )}

          <div className="col-span-3 mt-4">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center justify-between">
              Video Archive <span className="bg-slate-200 text-slate-600 px-3 py-1 rounded-xl text-xs">{videoLectures.length}</span>
            </h3>
            {videoLectures.length === 0 ? (
              <Empty>No lectures yet.</Empty>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {videoLectures.map((video) => (
                  <div key={video.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 group hover:border-indigo-200 transition-colors">
                    <button onClick={() => openMaterial(video)} className="w-12 h-12 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center shrink-0 hover:scale-105"><PlayCircle size={20} /></button>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-slate-800 text-sm truncate">{video.title}</h4>
                      <div className="text-xs text-slate-500 mt-1"><span className="font-semibold text-purple-600">{video.file_type}</span> • {video.size_mb} MB • {fmtDate(video.created_at)}</div>
                    </div>
                    {staff && <button onClick={() => handleDelete(video)} className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={16} /></button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : activeTab === "materials" ? (
        <Card title={`Course Materials (${studyDocs.length})`}>
          {studyDocs.length === 0 ? (
            <Empty>No study materials yet.</Empty>
          ) : (
            <div className="space-y-3">
              {studyDocs.map((doc) => (
                <div key={doc.id} className="group flex items-center justify-between p-4 rounded-2xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-blue-100 text-blue-600"><FileText size={18} /></div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">{doc.title}</h4>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">{doc.file_type} • {doc.size_mb} MB{doc.description ? ` • ${doc.description}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openMaterial(doc)} className="p-2 text-slate-400 hover:text-indigo-600 bg-white rounded-lg shadow-sm border border-slate-200" title="Download"><Download size={14} /></button>
                    {staff && <button onClick={() => handleDelete(doc)} className="p-2 text-slate-400 hover:text-red-500 bg-white rounded-lg shadow-sm border border-slate-200"><Trash2 size={14} /></button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : activeTab === "assignments" ? (
        <Card
          title={`Homework & Dropbox (${assignments.length})`}
          action={staff && (
            <button onClick={() => openEditor("Assignment")} className="flex items-center gap-2 text-sm font-bold text-orange-600 bg-orange-50 px-4 py-2 rounded-xl hover:bg-orange-100 transition-colors">
              <Plus size={16} /> New Assignment
            </button>
          )}
        >
          {assignments.length === 0 ? (
            <Empty>No active assignments.{staff && ' Click "New Assignment" to add one!'}</Empty>
          ) : (
            <div className="space-y-4">
              {assignments.map((a) => {
                const mine = mySub(a.id);
                const overdue = a.due_date && a.due_date < new Date().toISOString().slice(0, 10);
                return (
                  <div key={a.id} className="flex items-center justify-between p-5 rounded-2xl border border-slate-100 hover:border-orange-200 bg-slate-50 transition-all gap-4">
                    <div className="flex items-center gap-5 min-w-0">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-orange-100 text-orange-600"><ClipboardList size={22} /></div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-800 text-base">{a.title}</h4>
                        <p className="text-xs text-slate-500 font-medium mt-1">
                          {a.due_date ? `Due ${fmtDate(a.due_date)}` : "No due date"}{a.description ? ` • ${a.description}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {a.file_path && <button onClick={() => openMaterial(a)} className="p-2 text-slate-400 hover:text-indigo-600" title="Download brief"><Download size={18} /></button>}
                      {staff ? (
                        <>
                          <button onClick={() => setViewSubsFor(a)} className="px-4 py-2 text-sm font-bold bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm">
                            View Submissions ({subsFor(a.id).length})
                          </button>
                          <button onClick={() => handleDelete(a)} className="p-2 text-slate-400 hover:text-red-500"><Trash2 size={18} /></button>
                        </>
                      ) : mine ? (
                        <Badge color="green"><CheckCircle2 size={12} /> Submitted{mine.grade ? ` • ${mine.grade}` : ""}</Badge>
                      ) : (
                        <>
                          {overdue && <Badge color="red">Late</Badge>}
                          <button onClick={() => setSubmitFor(a)} className="px-4 py-2 text-sm font-bold bg-orange-500 text-white rounded-xl hover:bg-orange-600 shadow-sm flex items-center gap-2">
                            {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Submit Work
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      ) : (
        <Card title="Class Roster" action={<span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg text-xs font-bold">{students.rows.length} Enrolled</span>}>
          <Table headers={["Student Name", "Degree / Major", "Status"]} empty={students.rows.length === 0 && "No active students found. Add a student in the Registrar first!"}>
            {students.rows.filter((s) => matches(search, s.student_name, s.major)).map((s) => (
              <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4 font-bold text-slate-800 flex items-center gap-2"><GraduationCap size={16} className="text-indigo-500" /> {s.student_name}</td>
                <td className="px-6 py-4 text-slate-600 font-medium">{s.major}</td>
                <td className="px-6 py-4"><Badge color="green">{s.enrollment_status}</Badge></td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </ModuleShell>
  );
}
