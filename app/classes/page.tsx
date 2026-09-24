"use client";

import { useEffect, useState } from "react";
import { School, Plus, CalendarRange, Users, Trash2, Pencil, UserPlus, X, MapPin, Clock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, isAdmin, isStaff } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import { ModuleShell, Modal, Field, SubmitButton, ActionButton, PageHeading, Card, Loading, Empty, Badge, IconButton, inputClass, toast, confirmAction } from "@/components/ui";
import { errorMessage, initials, matches, type Row } from "@/lib/utils";

type TabId = "classes" | "timetable";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const COLORS = ["bg-indigo-500", "bg-pink-500", "bg-emerald-500", "bg-orange-500", "bg-cyan-500", "bg-purple-500", "bg-blue-500"];
const emptyForm = { name: "", code: "", room: "", days: [] as string[], start_time: "09:00", end_time: "10:30", term: "", teacher_id: "" };

export default function ClassesPage() {
  const { role, profile } = useSession();
  const staff = isStaff(role);
  const admin = isAdmin(role);
  const [activeTab, setActiveTab] = useState<TabId>("classes");
  const [search, setSearch] = useState("");
  const classes = useTable("classes", { orderBy: "name", ascending: true });
  const enrollments = useTable("class_enrollments");
  const [students, setStudents] = useState<Row[]>([]);
  const [teachers, setTeachers] = useState<Row[]>([]);

  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [rosterOf, setRosterOf] = useState<Row | null>(null);
  const [pick, setPick] = useState<string[]>([]);

  useEffect(() => {
    if (!staff) return;
    supabase.from("profiles").select("id, full_name, role").in("role", ["student", "teacher"]).order("full_name").then(({ data }) => {
      setStudents((data ?? []).filter((p) => p.role === "student"));
      setTeachers((data ?? []).filter((p) => p.role === "teacher"));
    });
  }, [staff]);

  const mine = (c: Row) => (staff ? admin || c.teacher_id === profile?.id : enrollments.rows.some((e) => e.class_id === c.id && e.student_id === profile?.id));
  const myClasses = classes.rows.filter(mine);
  const rosterFor = (id: string) => enrollments.rows.filter((e) => e.class_id === id);
  const colorOf = (id: string) => COLORS[Math.abs([...id].reduce((s, ch) => s + ch.charCodeAt(0), 0)) % COLORS.length];

  const openEditor = (c: Row | "new") => {
    setEditing(c);
    setForm(
      c === "new"
        ? emptyForm
        : { name: c.name, code: c.code ?? "", room: c.room ?? "", days: String(c.days ?? "").split(",").filter(Boolean), start_time: c.start_time ?? "", end_time: c.end_time ?? "", term: c.term ?? "", teacher_id: c.teacher_id ?? "" }
    );
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.days.length) return toast("Pick at least one weekday.", "error");
    if (form.end_time <= form.start_time) return toast("End time must be after start time.", "error");
    setBusy(true);
    const teacher = teachers.find((t) => t.id === form.teacher_id);
    const values: Row = { name: form.name, code: form.code || null, room: form.room || null, days: form.days.join(","), start_time: form.start_time, end_time: form.end_time, term: form.term || null };
    if (admin && form.teacher_id) Object.assign(values, { teacher_id: form.teacher_id, teacher_name: teacher?.full_name });
    const ok = editing === "new" ? await classes.insert(values, "Class created.") : await classes.update((editing as Row).id, values, "Class updated.");
    setBusy(false);
    if (ok) setEditing(null);
  };

  const enroll = async () => {
    if (!rosterOf || !pick.length) return;
    const rows = pick.map((id) => ({ class_id: rosterOf.id, student_id: id, student_name: students.find((s) => s.id === id)?.full_name }));
    const { error } = await supabase.from("class_enrollments").upsert(rows, { onConflict: "class_id,student_id", ignoreDuplicates: true });
    if (error) return toast(errorMessage(error), "error");
    toast(`${rows.length} student(s) enrolled.`);
    setPick([]);
    enrollments.reload();
  };

  const visible = (staff && !admin ? myClasses : admin ? classes.rows : myClasses).filter((c) => matches(search, c.name, c.code, c.room, c.teacher_name));
  const enrolledIds = new Set(rosterOf ? rosterFor(rosterOf.id).map((e) => e.student_id) : []);

  // Timetable: one column per weekday, classes sorted by start time.
  const timetableClasses = admin ? classes.rows : myClasses;

  return (
    <ModuleShell
      title="Classes"
      icon={School}
      tabs={[
        { id: "classes", label: staff ? (admin ? "All Classes" : "My Classes") : "My Classes", icon: Users, group: "Teaching" },
        { id: "timetable", label: "Weekly Timetable", icon: CalendarRange, group: "Teaching" },
      ]}
      activeTab={activeTab}
      onTab={setActiveTab}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search classes, rooms, teachers..."
      action={staff && <ActionButton icon={Plus} onClick={() => openEditor("new")}>New Class</ActionButton>}
    >
      {editing && (
        <Modal title={editing === "new" ? "New Class" : "Edit Class"} icon={School} onClose={() => setEditing(null)}>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2"><Field label="Class Name"><input required className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Advanced Kinematics" /></Field></div>
              <Field label="Code"><input className={inputClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="MEC-401" /></Field>
            </div>
            {admin && (
              <Field label="Teacher">
                <select className={inputClass} value={form.teacher_id} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}>
                  <option value="">— Me —</option>
                  {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </Field>
            )}
            <Field label="Days" group>
              <div className="flex gap-2 flex-wrap">
                {WEEKDAYS.map((d) => (
                  <button
                    type="button"
                    key={d}
                    onClick={() => setForm({ ...form, days: form.days.includes(d) ? form.days.filter((x) => x !== d) : [...form.days, d] })}
                    className={`px-3 py-2 rounded-xl text-sm font-bold ${form.days.includes(d) ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Starts"><input type="time" required className={inputClass} value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></Field>
              <Field label="Ends"><input type="time" required className={inputClass} value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></Field>
              <Field label="Room"><input className={inputClass} value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} /></Field>
            </div>
            <Field label="Term"><input className={inputClass} value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} placeholder="e.g. Fall 2026" /></Field>
            <SubmitButton busy={busy}>Save Class</SubmitButton>
          </form>
        </Modal>
      )}

      {rosterOf && (
        <Modal title={`Roster — ${rosterOf.name}`} icon={Users} onClose={() => setRosterOf(null)} wide>
          <div className="flex gap-2 mb-6">
            <select multiple value={pick} onChange={(e) => setPick(Array.from(e.target.selectedOptions).map((o) => o.value))} className={`${inputClass} h-32`}>
              {students.filter((s) => !enrolledIds.has(s.id)).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
            <button onClick={enroll} disabled={!pick.length} className="px-4 bg-indigo-600 text-white rounded-xl text-sm font-bold disabled:opacity-40 flex items-center gap-2 shrink-0"><UserPlus size={16} /> Enroll</button>
          </div>
          <p className="text-xs text-slate-400 mb-3">Hold Ctrl to select several students. Only students with a login account can be enrolled.</p>
          {rosterFor(rosterOf.id).length === 0 ? (
            <Empty>No students enrolled yet.</Empty>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {rosterFor(rosterOf.id).map((e) => (
                <div key={e.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <span className="w-7 h-7 rounded-full bg-slate-800 text-white text-[10px] font-bold flex items-center justify-center">{initials(e.student_name)}</span>
                    {e.student_name}
                  </span>
                  <button onClick={() => enrollments.remove(e.id)} className="text-slate-300 hover:text-red-500" title="Remove from class"><X size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {classes.loading || enrollments.loading ? (
        <Loading />
      ) : activeTab === "classes" ? (
        <>
          <PageHeading title={staff ? "Classes & Rosters" : "My Classes"} subtitle={staff ? "Create your class sections, set the schedule and enroll students." : "The classes you are enrolled in this term."} />
          {visible.length === 0 ? (
            <Empty>{staff ? "No classes yet. Click “New Class” to create your first section." : "You are not enrolled in any classes yet."}</Empty>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {visible.map((c) => (
                <div key={c.id} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                  <div className={`${colorOf(c.id)} h-2`} />
                  <div className="p-6 flex flex-col flex-1">
                    <div className="flex justify-between items-start mb-2">
                      <div className="min-w-0">
                        <h4 className="font-black text-slate-800 truncate">{c.name}</h4>
                        <p className="text-xs text-slate-500">{c.code || "No code"}{c.term ? ` • ${c.term}` : ""}</p>
                      </div>
                      {c.teacher_id === profile?.id && <Badge color="purple">Mine</Badge>}
                    </div>
                    <div className="space-y-1 text-sm text-slate-600 my-3">
                      <p className="flex items-center gap-2"><Clock size={14} className="text-slate-400" /> {String(c.days ?? "").replace(/,/g, ", ")} • {c.start_time}–{c.end_time}</p>
                      <p className="flex items-center gap-2"><MapPin size={14} className="text-slate-400" /> {c.room || "Room TBA"}</p>
                      <p className="flex items-center gap-2"><Users size={14} className="text-slate-400" /> {c.teacher_name || "Unassigned"}{staff ? ` • ${rosterFor(c.id).length} students` : ""}</p>
                    </div>
                    {staff && (admin || c.teacher_id === profile?.id) && (
                      <div className="mt-auto flex gap-2">
                        <button onClick={() => { setRosterOf(c); setPick([]); }} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 flex items-center justify-center gap-2"><Users size={14} /> Roster</button>
                        <IconButton icon={Pencil} title="Edit" onClick={() => openEditor(c)} />
                        <IconButton icon={Trash2} title="Delete" danger onClick={() => confirmAction(`Delete ${c.name}? Attendance and grades for it are deleted too.`) && classes.remove(c.id, "Class deleted.")} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <PageHeading title="Weekly Timetable" subtitle={admin ? "Every class section across the school." : "Your recurring weekly schedule."} />
          <Card>
            {timetableClasses.length === 0 ? (
              <Empty>No classes scheduled.</Empty>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                {WEEKDAYS.map((d) => {
                  const todays = timetableClasses
                    .filter((c) => String(c.days ?? "").split(",").includes(d))
                    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
                  const isToday = new Date().toLocaleDateString("en-US", { weekday: "short" }) === d;
                  return (
                    <div key={d}>
                      <h4 className={`text-xs font-black uppercase tracking-wider mb-3 ${isToday ? "text-indigo-600" : "text-slate-400"}`}>{d}{isToday ? " • today" : ""}</h4>
                      <div className="space-y-2">
                        {todays.length === 0 ? (
                          <p className="text-xs text-slate-300">Free</p>
                        ) : (
                          todays.map((c) => (
                            <div key={c.id} className={`${colorOf(c.id)} text-white rounded-xl p-3`}>
                              <p className="text-[10px] font-bold opacity-80">{c.start_time}–{c.end_time}</p>
                              <p className="text-sm font-black leading-tight">{c.name}</p>
                              <p className="text-[10px] opacity-80">{c.room || "TBA"}{admin ? ` • ${c.teacher_name ?? ""}` : ""}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}
    </ModuleShell>
  );
}
