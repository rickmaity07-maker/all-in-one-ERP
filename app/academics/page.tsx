"use client";

import { useEffect, useState } from "react";
import { GraduationCap, Plus, CalendarRange, Layers, BookOpen, ClipboardList, Trash2, X, Users, Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, isAdmin, isStaff } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import { ModuleShell, Modal, Field, SubmitButton, ActionButton, PageHeading, Card, Table, Loading, Empty, Badge, IconButton, inputClass, toast, confirmAction } from "@/components/ui";
import { errorMessage, fmtDate, localDate, matches, type Row } from "@/lib/utils";

type TabId = "register" | "courses" | "programs" | "terms";

export default function Academics() {
  const { role, profile } = useSession();
  const admin = isAdmin(role);
  const staff = isStaff(role);
  const [activeTab, setActiveTab] = useState<TabId>(role === "student" ? "register" : "courses");
  const [search, setSearch] = useState("");
  const terms = useTable("terms", { orderBy: "starts_on" });
  const programs = useTable("programs", { orderBy: "name", ascending: true });
  const courses = useTable("courses", { orderBy: "code", ascending: true });
  const reqs = useTable("program_courses", { orderBy: "recommended_term", ascending: true });
  const sections = useTable("classes", { orderBy: "name", ascending: true });
  const [myEnrollments, setMyEnrollments] = useState<Row[]>([]);
  const [seatCounts, setSeatCounts] = useState<Record<string, number>>({});
  const [termId, setTermId] = useState("");

  const [modal, setModal] = useState<"" | "course" | "program" | "term">("");
  const [busy, setBusy] = useState(false);
  const [courseForm, setCourseForm] = useState({ code: "", title: "", credits: "5", description: "", prerequisites: [] as string[] });
  const [programForm, setProgramForm] = useState({ name: "", degree_type: "Bachelor", total_credits: "180" });
  const [termForm, setTermForm] = useState({ name: "", starts_on: "", ends_on: "", add_drop_deadline: "", is_current: true });
  const [reqsOf, setReqsOf] = useState<Row | null>(null);
  const [reqPick, setReqPick] = useState({ course_id: "", requirement: "core", recommended_term: "1" });

  const currentTerm = terms.rows.find((t) => t.is_current) ?? terms.rows.find((t) => t.starts_on <= localDate() && t.ends_on >= localDate()) ?? terms.rows[0];
  const activeTerm = termId || currentTerm?.id || "";

  const loadRegistration = async () => {
    // Seat counts come from a counting function; students can only read their own enrolment rows.
    const { data: counts } = await supabase.rpc("section_seats");
    const map: Record<string, number> = {};
    for (const r of (counts ?? []) as Row[]) map[r.class_id] = r.enrolled;
    setSeatCounts(map);
    if (profile) {
      const { data } = await supabase.from("class_enrollments").select("*").eq("student_id", profile.id);
      setMyEnrollments(data ?? []);
    }
  };
  useEffect(() => {
    loadRegistration(); // eslint-disable-line react-hooks/set-state-in-effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const courseOf = (id?: string | null) => courses.rows.find((c) => c.id === id);
  const codeOf = (id: string) => courseOf(id)?.code ?? "?";

  const register = async (sec: Row) => {
    const { data, error } = await supabase.rpc("register_for_section", { p_class: sec.id });
    if (error) return toast(errorMessage(error), "error");
    toast(data === "waitlisted" ? `${sec.name} is full — you're on the waitlist.` : `Registered for ${sec.name}.`);
    loadRegistration();
  };
  const drop = async (sec: Row) => {
    if (!confirmAction(`Drop ${sec.name}? Tuition is recalculated automatically.`)) return;
    const { error } = await supabase.rpc("drop_section", { p_class: sec.id });
    if (error) return toast(errorMessage(error), "error");
    toast(`Dropped ${sec.name}.`);
    loadRegistration();
  };

  const saveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const row = await courses.insert(
      { code: courseForm.code.trim().toUpperCase(), title: courseForm.title, credits: parseInt(courseForm.credits) || 0, description: courseForm.description || null, prerequisites: courseForm.prerequisites },
      "Course added."
    );
    setBusy(false);
    if (row) {
      setModal("");
      setCourseForm({ code: "", title: "", credits: "5", description: "", prerequisites: [] });
    }
  };
  const saveProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const row = await programs.insert({ ...programForm, total_credits: parseInt(programForm.total_credits) || 180 }, "Programme added.");
    setBusy(false);
    if (row) setModal("");
  };
  const saveTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (termForm.ends_on <= termForm.starts_on) return toast("The term must end after it starts.", "error");
    setBusy(true);
    if (termForm.is_current) for (const t of terms.rows.filter((x) => x.is_current)) await terms.update(t.id, { is_current: false });
    const row = await terms.insert({ ...termForm, add_drop_deadline: termForm.add_drop_deadline || null }, "Term added.");
    setBusy(false);
    if (row) setModal("");
  };
  const addReq = async () => {
    if (!reqsOf || !reqPick.course_id) return;
    const row = await reqs.insert({ program_id: reqsOf.id, course_id: reqPick.course_id, requirement: reqPick.requirement, recommended_term: parseInt(reqPick.recommended_term) || null });
    if (row) setReqPick({ ...reqPick, course_id: "" });
  };

  const termSections = sections.rows.filter((s) => s.term_id === activeTerm && s.course_id);
  const myStatus = (secId: string) => myEnrollments.find((e) => e.class_id === secId && e.status !== "dropped")?.status as string | undefined;
  const t = terms.rows.find((x) => x.id === activeTerm);
  const registrationOpen = !t?.add_drop_deadline || localDate() <= t.add_drop_deadline;
  const myCredits = termSections.filter((s) => myStatus(s.id) === "enrolled").reduce((sum, s) => sum + (courseOf(s.course_id)?.credits ?? 0), 0);

  const tabs = [
    ...(role === "student" ? [{ id: "register" as TabId, label: "Course Registration", icon: ClipboardList, group: "Academics" }] : []),
    { id: "courses" as TabId, label: "Course Catalogue", icon: BookOpen, group: "Academics" },
    { id: "programs" as TabId, label: "Programmes", icon: Layers, group: "Academics" },
    { id: "terms" as TabId, label: "Terms", icon: CalendarRange, group: "Academics" },
  ];

  return (
    <ModuleShell
      title="Academics"
      icon={GraduationCap}
      tabs={tabs}
      activeTab={activeTab}
      onTab={setActiveTab}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search courses, codes, programmes..."
      action={
        admin && activeTab !== "register" && (
          <ActionButton icon={Plus} onClick={() => setModal(activeTab === "programs" ? "program" : activeTab === "terms" ? "term" : "course")}>
            {activeTab === "programs" ? "New Programme" : activeTab === "terms" ? "New Term" : "New Course"}
          </ActionButton>
        )
      }
    >
      {modal === "course" && (
        <Modal title="New Course" icon={BookOpen} onClose={() => setModal("")}>
          <form onSubmit={saveCourse} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Code"><input required className={inputClass} value={courseForm.code} onChange={(e) => setCourseForm({ ...courseForm, code: e.target.value })} placeholder="MEC-201" /></Field>
              <div className="md:col-span-2"><Field label="Title"><input required className={inputClass} value={courseForm.title} onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })} /></Field></div>
            </div>
            <Field label="Credits"><input type="number" min="0" max="60" required className={inputClass} value={courseForm.credits} onChange={(e) => setCourseForm({ ...courseForm, credits: e.target.value })} /></Field>
            <Field label="Prerequisites">
              <select multiple className={`${inputClass} h-28`} value={courseForm.prerequisites} onChange={(e) => setCourseForm({ ...courseForm, prerequisites: Array.from(e.target.selectedOptions).map((o) => o.value) })}>
                {courses.rows.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
              </select>
            </Field>
            <p className="text-xs text-slate-400 -mt-2">Hold Ctrl to pick several. Students must pass these before they can register.</p>
            <Field label="Description"><textarea rows={2} className={inputClass} value={courseForm.description} onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })} /></Field>
            <SubmitButton busy={busy}>Add Course</SubmitButton>
          </form>
        </Modal>
      )}

      {modal === "program" && (
        <Modal title="New Programme" icon={Layers} onClose={() => setModal("")}>
          <form onSubmit={saveProgram} className="space-y-4">
            <Field label="Programme Name"><input required className={inputClass} value={programForm.name} onChange={(e) => setProgramForm({ ...programForm, name: e.target.value })} placeholder="B.Eng. Mechatronics" /></Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Degree Type">
                <select className={inputClass} value={programForm.degree_type} onChange={(e) => setProgramForm({ ...programForm, degree_type: e.target.value })}>
                  {["Bachelor", "Master", "Diploma", "Certificate", "Doctorate"].map((d) => <option key={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="Total Credits"><input type="number" min="1" required className={inputClass} value={programForm.total_credits} onChange={(e) => setProgramForm({ ...programForm, total_credits: e.target.value })} /></Field>
            </div>
            <SubmitButton busy={busy}>Add Programme</SubmitButton>
          </form>
        </Modal>
      )}

      {modal === "term" && (
        <Modal title="New Term" icon={CalendarRange} onClose={() => setModal("")}>
          <form onSubmit={saveTerm} className="space-y-4">
            <Field label="Term Name"><input required className={inputClass} value={termForm.name} onChange={(e) => setTermForm({ ...termForm, name: e.target.value })} placeholder="Winter 2026/27" /></Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Starts"><input type="date" required className={inputClass} value={termForm.starts_on} onChange={(e) => setTermForm({ ...termForm, starts_on: e.target.value })} /></Field>
              <Field label="Ends"><input type="date" required className={inputClass} value={termForm.ends_on} onChange={(e) => setTermForm({ ...termForm, ends_on: e.target.value })} /></Field>
            </div>
            <Field label="Add/Drop Deadline"><input type="date" className={inputClass} value={termForm.add_drop_deadline} onChange={(e) => setTermForm({ ...termForm, add_drop_deadline: e.target.value })} /></Field>
            <label className="flex items-center gap-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={termForm.is_current} onChange={(e) => setTermForm({ ...termForm, is_current: e.target.checked })} className="w-4 h-4 accent-indigo-600" /> Current term</label>
            <SubmitButton busy={busy}>Add Term</SubmitButton>
          </form>
        </Modal>
      )}

      {reqsOf && (
        <Modal title={`Requirements — ${reqsOf.name}`} icon={Layers} onClose={() => setReqsOf(null)} wide>
          {admin && (
            <div className="flex flex-wrap gap-2 mb-6">
              <select aria-label="Course" className={`${inputClass} flex-1 min-w-48`} value={reqPick.course_id} onChange={(e) => setReqPick({ ...reqPick, course_id: e.target.value })}>
                <option value="">Add a course…</option>
                {courses.rows.filter((c) => !reqs.rows.some((r) => r.program_id === reqsOf.id && r.course_id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
              </select>
              <select aria-label="Requirement" className={`${inputClass} w-32`} value={reqPick.requirement} onChange={(e) => setReqPick({ ...reqPick, requirement: e.target.value })}>
                <option value="core">Core</option><option value="elective">Elective</option>
              </select>
              <input aria-label="Recommended term" type="number" min="1" className={`${inputClass} w-24`} value={reqPick.recommended_term} onChange={(e) => setReqPick({ ...reqPick, recommended_term: e.target.value })} />
              <button onClick={addReq} disabled={!reqPick.course_id} className="px-4 bg-indigo-600 text-white rounded-xl text-sm font-bold disabled:opacity-40">Add</button>
            </div>
          )}
          {reqs.rows.filter((r) => r.program_id === reqsOf.id).length === 0 ? (
            <Empty>No courses in this programme yet.</Empty>
          ) : (
            <div className="space-y-2">
              {reqs.rows.filter((r) => r.program_id === reqsOf.id).map((r) => {
                const c = courseOf(r.course_id);
                return (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 text-sm">
                    <span><b>{c?.code}</b> {c?.title} <span className="text-slate-400">• {c?.credits} cr • term {r.recommended_term ?? "—"}</span></span>
                    <span className="flex items-center gap-2"><Badge color={r.requirement === "core" ? "purple" : "blue"}>{r.requirement}</Badge>{admin && <button onClick={() => reqs.remove(r.id)} className="text-slate-300 hover:text-red-500" aria-label="Remove"><X size={14} /></button>}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      )}

      {courses.loading || terms.loading ? (
        <Loading />
      ) : activeTab === "register" ? (
        <>
          <PageHeading title="Course Registration" subtitle="Register for sections this term. Full sections put you on the waitlist; prerequisites and account holds are checked automatically.">
            <select aria-label="Term" value={activeTerm} onChange={(e) => setTermId(e.target.value)} className="text-sm font-semibold bg-white border border-slate-200 rounded-xl px-3 py-2.5 outline-none">
              {terms.rows.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </PageHeading>
          {!t ? (
            <Empty>No terms have been set up yet.</Empty>
          ) : (
            <>
              <div className="flex flex-wrap gap-3 mb-6 text-sm">
                <Badge color="blue">{myCredits} credits registered</Badge>
                <Badge color={registrationOpen ? "green" : "red"}>{registrationOpen ? `Add/drop open until ${fmtDate(t.add_drop_deadline)}` : "Add/drop closed"}</Badge>
              </div>
              <Card>
                <Table headers={["Section", "Course", "Schedule", "Seats", "Status", "Actions"]} empty={termSections.length === 0 && "No sections are offered this term yet."}>
                  {termSections.filter((s) => matches(search, s.name, courseOf(s.course_id)?.code, courseOf(s.course_id)?.title)).map((s) => {
                    const c = courseOf(s.course_id);
                    const st = myStatus(s.id);
                    const taken = seatCounts[s.id] ?? 0;
                    return (
                      <tr key={s.id}>
                        <td className="px-6 py-4"><div className="font-bold text-slate-800">{s.name}</div><div className="text-xs text-slate-400">{s.teacher_name}</div></td>
                        <td className="px-6 py-4"><div className="font-semibold">{c?.code} • {c?.credits} cr</div>{c?.prerequisites?.length ? <div className="text-xs text-slate-400 flex items-center gap-1"><Lock size={10} /> Requires {c.prerequisites.map(codeOf).join(", ")}</div> : null}</td>
                        <td className="px-6 py-4 text-xs text-slate-600">{s.days ? `${String(s.days).replace(/,/g, ", ")} ${s.start_time}–${s.end_time}` : "TBA"}<div className="text-slate-400">{s.room ?? ""}</div></td>
                        <td className="px-6 py-4 text-sm">{s.capacity ? `${taken}/${s.capacity}` : taken}</td>
                        <td className="px-6 py-4">{st ? <Badge color={st === "enrolled" ? "green" : st === "waitlisted" ? "orange" : "blue"}>{st}</Badge> : <span className="text-xs text-slate-400">—</span>}</td>
                        <td className="px-6 py-4 text-right">
                          {st === "enrolled" || st === "waitlisted" ? (
                            <button disabled={!registrationOpen} onClick={() => drop(s)} className="text-xs font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-lg disabled:opacity-40">Drop</button>
                          ) : st === "completed" ? null : (
                            <button disabled={!registrationOpen} onClick={() => register(s)} className="text-xs font-bold text-white bg-indigo-600 px-3 py-1.5 rounded-lg disabled:opacity-40">Register</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </Table>
              </Card>
            </>
          )}
        </>
      ) : activeTab === "courses" ? (
        <>
          <PageHeading title="Course Catalogue" subtitle="Courses, credits and prerequisite chains. Sections are scheduled under Classes & Timetable." />
          <Card>
            <Table headers={["Code", "Title", "Credits", "Prerequisites", "Actions"]} empty={courses.rows.length === 0 && "No courses yet."}>
              {courses.rows.filter((c) => matches(search, c.code, c.title)).map((c) => (
                <tr key={c.id}>
                  <td className="px-6 py-4 font-black text-slate-800">{c.code}</td>
                  <td className="px-6 py-4 text-slate-700">{c.title}</td>
                  <td className="px-6 py-4">{c.credits}</td>
                  <td className="px-6 py-4 text-xs text-slate-500">{(c.prerequisites ?? []).map(codeOf).join(", ") || "—"}</td>
                  <td className="px-6 py-4 text-right">{admin && <IconButton icon={Trash2} title="Delete course" danger onClick={() => confirmAction(`Delete ${c.code}?`) && courses.remove(c.id, "Course deleted.")} />}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      ) : activeTab === "programs" ? (
        <>
          <PageHeading title="Programmes" subtitle="Degree programmes and the courses that count towards them (used by the degree audit)." />
          {programs.rows.length === 0 ? <Empty>No programmes yet.</Empty> : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {programs.rows.filter((p) => matches(search, p.name)).map((p) => {
                const list = reqs.rows.filter((r) => r.program_id === p.id);
                const credits = list.reduce((s, r) => s + (courseOf(r.course_id)?.credits ?? 0), 0);
                return (
                  <div key={p.id} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
                    <p className="text-xs font-bold uppercase text-slate-400">{p.degree_type}</p>
                    <h4 className="font-black text-slate-800 text-lg">{p.name}</h4>
                    <p className="text-sm text-slate-500 my-2">{list.length} courses • {credits}/{p.total_credits} credits mapped</p>
                    <div className="flex gap-2">
                      <button onClick={() => setReqsOf(p)} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold">{admin ? "Edit requirements" : "View requirements"}</button>
                      {admin && <IconButton icon={Trash2} title="Delete programme" danger onClick={() => confirmAction(`Delete ${p.name}?`) && programs.remove(p.id, "Programme deleted.")} />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <PageHeading title="Terms" subtitle="Academic terms, their add/drop deadlines and which one is current." />
          <Card>
            <Table headers={["Term", "Dates", "Add/Drop Deadline", "Sections", "Status"]} empty={terms.rows.length === 0 && "No terms yet."}>
              {terms.rows.map((x) => (
                <tr key={x.id}>
                  <td className="px-6 py-4 font-bold text-slate-800">{x.name}</td>
                  <td className="px-6 py-4 text-slate-600">{fmtDate(x.starts_on)} → {fmtDate(x.ends_on)}</td>
                  <td className="px-6 py-4 text-slate-600">{fmtDate(x.add_drop_deadline)}</td>
                  <td className="px-6 py-4">{sections.rows.filter((s) => s.term_id === x.id).length}</td>
                  <td className="px-6 py-4">{x.is_current ? <Badge color="green">Current</Badge> : admin ? <button onClick={async () => { for (const o of terms.rows.filter((y) => y.is_current)) await terms.update(o.id, { is_current: false }); terms.update(x.id, { is_current: true }, `${x.name} is now current.`); }} className="text-xs font-bold text-indigo-600">Make current</button> : null}</td>
                </tr>
              ))}
            </Table>
          </Card>
          {staff && <p className="text-xs text-slate-400 mt-4 flex items-center gap-1"><Users size={12} /> Fee schedules per term are managed under Finance.</p>}
        </>
      )}
    </ModuleShell>
  );
}
