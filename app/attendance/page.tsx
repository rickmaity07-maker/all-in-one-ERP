"use client";

import { useEffect, useState } from "react";
import { UserCheck, Save, CheckCheck, BarChart3, Loader2, AlertTriangle, Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, isAdmin, isStaff } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import { ModuleShell, PageHeading, Card, Table, Loading, Empty, Badge, StatCard, toast } from "@/components/ui";
import { downloadCsv, errorMessage, fmtDate, initials, matches, localDate, type Row } from "@/lib/utils";

type TabId = "register" | "reports";
const STATUSES = ["Present", "Late", "Absent", "Excused"] as const;
const STATUS_STYLE: Record<string, string> = {
  Present: "bg-emerald-500 text-white",
  Late: "bg-orange-400 text-white",
  Absent: "bg-red-500 text-white",
  Excused: "bg-blue-500 text-white",
};
const today = () => localDate();
// Late counts as attended; excused sessions are left out of the rate.
const rate = (rows: Row[]) => {
  const counted = rows.filter((r) => r.status !== "Excused");
  return counted.length ? Math.round((counted.filter((r) => r.status === "Present" || r.status === "Late").length / counted.length) * 100) : null;
};

export default function AttendancePage() {
  const { role, profile } = useSession();
  const staff = isStaff(role);
  const admin = isAdmin(role);
  const [activeTab, setActiveTab] = useState<TabId>("register");
  const [search, setSearch] = useState("");
  const classes = useTable("classes", { orderBy: "name", ascending: true });
  const enrollments = useTable("class_enrollments");
  const attendance = useTable("attendance", { orderBy: "session_date" });

  const myClasses = classes.rows.filter((c) => (staff ? admin || c.teacher_id === profile?.id : enrollments.rows.some((e) => e.class_id === c.id)));
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(today());
  const [marks, setMarks] = useState<Record<string, { status: string; note: string }>>({});
  const [saving, setSaving] = useState(false);

  const activeClass = classId || myClasses[0]?.id || "";
  const roster = enrollments.rows.filter((e) => e.class_id === activeClass).sort((a, b) => String(a.student_name).localeCompare(String(b.student_name)));
  const savedForDay = attendance.rows.filter((a) => a.class_id === activeClass && a.session_date === date);

  // Load what was already recorded for this class/date into the editable register.
  const savedKey = savedForDay.map((a) => `${a.student_id}:${a.status}`).join("|");
  useEffect(() => {
    const next: Record<string, { status: string; note: string }> = {};
    for (const a of savedForDay) next[a.student_id] = { status: a.status, note: a.note ?? "" };
    setMarks(next); // eslint-disable-line react-hooks/set-state-in-effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClass, date, savedKey]);

  const setMark = (studentId: string, status: string) => setMarks((m) => ({ ...m, [studentId]: { status, note: m[studentId]?.note ?? "" } }));
  const markAll = () => setMarks(Object.fromEntries(roster.map((e) => [e.student_id, { status: "Present", note: marks[e.student_id]?.note ?? "" }])));

  const saveRegister = async () => {
    const rows = roster
      .filter((e) => marks[e.student_id])
      .map((e) => ({ class_id: activeClass, student_id: e.student_id, student_name: e.student_name, session_date: date, status: marks[e.student_id].status, note: marks[e.student_id].note || null }));
    if (!rows.length) return toast("Mark at least one student first.", "error");
    setSaving(true);
    const { error } = await supabase.from("attendance").upsert(rows, { onConflict: "class_id,student_id,session_date" });
    setSaving(false);
    if (error) return toast(errorMessage(error), "error");
    toast(`Register saved for ${fmtDate(date)}${rows.length < roster.length ? ` (${roster.length - rows.length} unmarked)` : ""}.`);
    attendance.reload();
  };

  const classRows = attendance.rows.filter((a) => a.class_id === activeClass);
  const sessions = new Set(classRows.map((a) => a.session_date)).size;
  const perStudent: Row[] = roster.map((e) => {
    const rows = classRows.filter((a) => a.student_id === e.student_id);
    return { ...e, rate: rate(rows), absent: rows.filter((r) => r.status === "Absent").length, late: rows.filter((r) => r.status === "Late").length };
  });
  const classRate = rate(classRows);

  const classPicker = (
    <div className="flex flex-wrap gap-3 items-center">
      <select value={activeClass} onChange={(e) => setClassId(e.target.value)} className="text-sm font-semibold bg-white border border-slate-200 rounded-xl px-3 py-2.5 outline-none w-full md:w-auto md:min-w-56">
        {myClasses.map((c) => <option key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ""}</option>)}
      </select>
      {activeTab === "register" && <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className="text-sm font-semibold bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none" />}
    </div>
  );

  if (classes.loading || enrollments.loading || attendance.loading) {
    return <ModuleShell title="Attendance" icon={UserCheck} tabs={[]} activeTab={activeTab} onTab={setActiveTab}><Loading /></ModuleShell>;
  }

  // ---------- Student view ----------
  if (!staff) {
    const mine = attendance.rows.filter((a) => a.student_id === profile?.id);
    return (
      <ModuleShell title="Attendance" icon={UserCheck} tabs={[{ id: "register" as TabId, label: "My Attendance", group: "Attendance" }]} activeTab="register" onTab={setActiveTab}>
        <PageHeading title="My Attendance" subtitle="Your attendance rate in each class. Late counts as attended; excused absences are not counted." />
        {myClasses.length === 0 ? (
          <Empty>You are not enrolled in any classes.</Empty>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {myClasses.map((c) => {
                const r = rate(mine.filter((a) => a.class_id === c.id));
                return <StatCard key={c.id} label={c.name} value={r === null ? "No sessions" : `${r}%`} icon={r !== null && r < 80 ? AlertTriangle : UserCheck} color={r !== null && r < 80 ? "red" : "emerald"} />;
              })}
            </div>
            <Card title="Recent Sessions">
              <Table headers={["Date", "Class", "Status", "Note"]} empty={mine.length === 0 && "No attendance recorded yet."}>
                {mine.slice(0, 50).map((a) => (
                  <tr key={a.id}>
                    <td className="px-6 py-3 text-slate-600">{fmtDate(a.session_date)}</td>
                    <td className="px-6 py-3 font-semibold text-slate-800">{classes.rows.find((c) => c.id === a.class_id)?.name}</td>
                    <td className="px-6 py-3"><Badge color={a.status === "Present" ? "green" : a.status === "Absent" ? "red" : a.status === "Late" ? "orange" : "blue"}>{a.status}</Badge></td>
                    <td className="px-6 py-3 text-xs text-slate-500">{a.note}</td>
                  </tr>
                ))}
              </Table>
            </Card>
          </>
        )}
      </ModuleShell>
    );
  }

  // ---------- Teacher / admin view ----------
  return (
    <ModuleShell
      title="Attendance"
      icon={UserCheck}
      tabs={[
        { id: "register", label: "Take Register", icon: UserCheck, group: "Attendance" },
        { id: "reports", label: "Class Reports", icon: BarChart3, group: "Attendance" },
      ]}
      activeTab={activeTab}
      onTab={setActiveTab}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search students..."
    >
      {myClasses.length === 0 ? (
        <Empty>You have no classes yet. Create one under Classes and enroll students first.</Empty>
      ) : activeTab === "register" ? (
        <>
          <PageHeading title="Daily Register" subtitle="Tap a status for each student, then save. You can come back and correct any day.">{classPicker}</PageHeading>
          <Card
            title={`${roster.length} students • ${Object.keys(marks).length} marked`}
            action={
              <div className="flex flex-wrap gap-2">
                <button onClick={markAll} disabled={!roster.length} className="flex items-center gap-2 text-sm font-bold text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl disabled:opacity-40"><CheckCheck size={16} /> Mark all present</button>
                <button onClick={saveRegister} disabled={saving || !roster.length} className="flex items-center gap-2 text-sm font-bold text-white bg-indigo-600 px-5 py-2 rounded-xl hover:bg-indigo-700 disabled:opacity-40">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save register
                </button>
              </div>
            }
          >
            {roster.length === 0 ? (
              <Empty>No students enrolled in this class. Add them from Classes → Roster.</Empty>
            ) : (
              <div className="space-y-2">
                {roster.filter((e) => matches(search, e.student_name)).map((e) => (
                  <div key={e.id} className="flex flex-wrap md:flex-nowrap items-center gap-2 md:gap-4 p-3 rounded-2xl border border-slate-100">
                    <span className="w-9 h-9 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center shrink-0">{initials(e.student_name)}</span>
                    <span className="font-bold text-slate-800 flex-1 md:flex-none md:w-56 truncate min-w-0">{e.student_name}</span>
                    <div className="flex flex-wrap gap-1.5 w-full md:w-auto">
                      {STATUSES.map((s) => (
                        <button
                          key={s}
                          onClick={() => setMark(e.student_id, s)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${marks[e.student_id]?.status === s ? STATUS_STYLE[s] : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    <input
                      placeholder="Note (optional)"
                      value={marks[e.student_id]?.note ?? ""}
                      onChange={(ev) => setMarks((m) => ({ ...m, [e.student_id]: { status: m[e.student_id]?.status ?? "Present", note: ev.target.value } }))}
                      className="w-full md:w-auto md:flex-1 min-w-0 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      ) : (
        <>
          <PageHeading title="Attendance Report" subtitle="Students under 80% are flagged for follow-up.">{classPicker}</PageHeading>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <StatCard label="Sessions Recorded" value={sessions} icon={BarChart3} color="indigo" />
            <StatCard label="Class Attendance" value={classRate === null ? "—" : `${classRate}%`} icon={UserCheck} color="emerald" />
            <StatCard label="Below 80%" value={perStudent.filter((p) => p.rate !== null && p.rate < 80).length} icon={AlertTriangle} color="red" />
          </div>
          <Card
            title="Per-student summary"
            action={
              <button
                onClick={() => downloadCsv("attendance.csv", perStudent, [{ key: "student_name", label: "Student" }, { key: "rate", label: "Attendance %" }, { key: "absent", label: "Absences" }, { key: "late", label: "Lates" }])}
                className="flex items-center gap-2 text-blue-600 font-bold text-sm hover:bg-blue-50 px-4 py-2 rounded-xl"
              >
                <Download size={16} /> Export CSV
              </button>
            }
          >
            <Table headers={["Student", "Attendance", "Absences", "Lates"]} empty={perStudent.length === 0 && "No students enrolled."}>
              {perStudent.filter((p) => matches(search, p.student_name)).map((p) => (
                <tr key={p.id}>
                  <td className="px-6 py-4 font-bold text-slate-800">{p.student_name}</td>
                  <td className="px-6 py-4">
                    {p.rate === null ? <span className="text-slate-400 text-xs">No sessions</span> : (
                      <div className="flex items-center gap-3">
                        <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden"><div className={`h-2 ${p.rate < 80 ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${p.rate}%` }} /></div>
                        <span className={`text-sm font-bold ${p.rate < 80 ? "text-red-600" : "text-slate-700"}`}>{p.rate}%</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-600">{p.absent}</td>
                  <td className="px-6 py-4 text-slate-600">{p.late}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      )}
    </ModuleShell>
  );
}
