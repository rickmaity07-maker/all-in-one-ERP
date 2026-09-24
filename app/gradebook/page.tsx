"use client";

import { useState } from "react";
import { BookMarked, Plus, Printer, Trash2, Download, GraduationCap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, isAdmin, isStaff } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import { ModuleShell, Modal, Field, SubmitButton, ActionButton, PageHeading, Card, Loading, Empty, Badge, inputClass, toast, confirmAction } from "@/components/ui";
import { downloadCsv, errorMessage, escapeHtml, fmtDate, printDocument, type Row } from "@/lib/utils";

const letter = (pct: number | null) =>
  pct === null ? "—" : pct >= 90 ? "A" : pct >= 80 ? "B" : pct >= 70 ? "C" : pct >= 60 ? "D" : "F";

// Weighted average over the assessments that have a score.
function weighted(assessments: Row[], scoreOf: (assessmentId: string) => number | null) {
  let sum = 0;
  let weights = 0;
  for (const a of assessments) {
    const s = scoreOf(a.id);
    if (s === null || s === undefined) continue;
    sum += (s / Number(a.max_points)) * Number(a.weight);
    weights += Number(a.weight);
  }
  return weights ? Math.round((sum / weights) * 1000) / 10 : null;
}

export default function Gradebook() {
  const { role, profile } = useSession();
  const staff = isStaff(role);
  const admin = isAdmin(role);
  const classes = useTable("classes", { orderBy: "name", ascending: true });
  const enrollments = useTable("class_enrollments");
  const assessments = useTable("assessments", { orderBy: "created_at", ascending: true });
  const grades = useTable("grades");

  const myClasses = classes.rows.filter((c) => (staff ? admin || c.teacher_id === profile?.id : enrollments.rows.some((e) => e.class_id === c.id)));
  const [classId, setClassId] = useState("");
  const activeClass = classId || myClasses[0]?.id || "";
  const cls = classes.rows.find((c) => c.id === activeClass);

  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: "", category: "Assignment", max_points: "100", weight: "1", due_date: "" });

  const classAssessments = assessments.rows.filter((a) => a.class_id === activeClass);
  const roster = enrollments.rows.filter((e) => e.class_id === activeClass).sort((a, b) => String(a.student_name).localeCompare(String(b.student_name)));
  const gradeOf = (assessmentId: string, studentId: string) => grades.rows.find((g) => g.assessment_id === assessmentId && g.student_id === studentId);
  const scoreOf = (studentId: string) => (aid: string) => {
    const g = gradeOf(aid, studentId);
    return g?.score === null || g?.score === undefined ? null : Number(g.score);
  };

  const addAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const row = await assessments.insert(
      { class_id: activeClass, title: form.title, category: form.category, max_points: parseFloat(form.max_points) || 100, weight: parseFloat(form.weight) || 0, due_date: form.due_date || null },
      "Assessment added."
    );
    setBusy(false);
    if (row) {
      setModalOpen(false);
      setForm({ title: "", category: "Assignment", max_points: "100", weight: "1", due_date: "" });
    }
  };

  const saveScore = async (assessment: Row, studentId: string, raw: string) => {
    const existing = gradeOf(assessment.id, studentId);
    const value = raw.trim() === "" ? null : Number(raw);
    if ((existing?.score ?? null) === value || (existing && Number(existing.score) === value)) return;
    if (value !== null && (isNaN(value) || value < 0 || value > Number(assessment.max_points) * 1.5)) {
      toast(`Score must be between 0 and ${assessment.max_points}.`, "error");
      return;
    }
    const { data, error } = await supabase
      .from("grades")
      .upsert([{ assessment_id: assessment.id, student_id: studentId, score: value }], { onConflict: "assessment_id,student_id" })
      .select();
    if (error) return toast(errorMessage(error), "error");
    grades.setRows((prev) => [...prev.filter((g) => !(g.assessment_id === assessment.id && g.student_id === studentId)), ...(data ?? [])]);
  };

  const printReportCard = (student: Row) => {
    const avg = weighted(classAssessments, scoreOf(student.student_id));
    const rows = classAssessments
      .map((a) => {
        const s = scoreOf(student.student_id)(a.id);
        return `<tr><td>${escapeHtml(a.title)}</td><td>${escapeHtml(a.category)}</td><td class="right">${s ?? "—"} / ${a.max_points}</td><td class="right">${a.weight}</td></tr>`;
      })
      .join("");
    printDocument(
      `Report card - ${student.student_name}`,
      `<div class="brand"><div><h1>Report Card</h1><div class="muted">${escapeHtml(cls?.name)} ${cls?.code ? "(" + escapeHtml(cls.code) + ")" : ""} • ${escapeHtml(cls?.term ?? "")}</div></div>
        <div class="right muted">Teacher: ${escapeHtml(cls?.teacher_name ?? "")}<br/>Issued ${new Date().toLocaleDateString()}</div></div>
       <p><b>${escapeHtml(student.student_name)}</b></p>
       <table><thead><tr><th>Assessment</th><th>Category</th><th class="right">Score</th><th class="right">Weight</th></tr></thead><tbody>${rows}</tbody></table>
       <p class="right total">Overall: ${avg ?? "—"}% (${letter(avg)})</p>`
    );
  };

  if (classes.loading || enrollments.loading || assessments.loading || grades.loading) {
    return <ModuleShell title="Gradebook" icon={BookMarked} tabs={[]} activeTab="x" onTab={() => {}}><Loading /></ModuleShell>;
  }

  const classPicker = (
    <select value={activeClass} onChange={(e) => setClassId(e.target.value)} className="text-sm font-semibold bg-white border border-slate-200 rounded-xl px-3 py-2.5 outline-none min-w-56">
      {myClasses.map((c) => <option key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ""}</option>)}
    </select>
  );

  // ---------- Student view ----------
  if (!staff) {
    return (
      <ModuleShell title="Gradebook" icon={BookMarked} tabs={[{ id: "mine", label: "My Grades", group: "Grades" }]} activeTab="mine" onTab={() => {}}>
        <PageHeading title="My Grades" subtitle="Scores and running weighted average for each of your classes." />
        {myClasses.length === 0 ? (
          <Empty>You are not enrolled in any classes.</Empty>
        ) : (
          <div className="space-y-6">
            {myClasses.map((c) => {
              const list = assessments.rows.filter((a) => a.class_id === c.id);
              const avg = weighted(list, scoreOf(profile!.id));
              return (
                <Card key={c.id} title={c.name} action={<Badge color={avg === null ? "slate" : avg >= 60 ? "green" : "red"}>{avg === null ? "No grades yet" : `${avg}% • ${letter(avg)}`}</Badge>}>
                  {list.length === 0 ? (
                    <p className="text-sm text-slate-400">No assessments yet.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      {list.map((a) => {
                        const s = scoreOf(profile!.id)(a.id);
                        return (
                          <div key={a.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                            <p className="text-xs text-slate-400 font-bold uppercase">{a.category}{a.due_date ? ` • due ${fmtDate(a.due_date)}` : ""}</p>
                            <p className="font-bold text-slate-800">{a.title}</p>
                            <p className="text-lg font-black text-indigo-600">{s ?? "—"}<span className="text-sm text-slate-400"> / {a.max_points}</span></p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </ModuleShell>
    );
  }

  // ---------- Teacher / admin view ----------
  return (
    <ModuleShell
      title="Gradebook"
      icon={BookMarked}
      tabs={myClasses.map((c) => ({ id: c.id, label: c.name, icon: GraduationCap, group: "My Classes" }))}
      activeTab={activeClass}
      onTab={setClassId}
      action={activeClass && <ActionButton icon={Plus} onClick={() => setModalOpen(true)}>Add Assessment</ActionButton>}
    >
      {modalOpen && (
        <Modal title="New Assessment" icon={BookMarked} onClose={() => setModalOpen(false)}>
          <form onSubmit={addAssessment} className="space-y-4">
            <Field label="Title"><input required className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Quiz 3" /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Category">
                <select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {["Assignment", "Quiz", "Midterm", "Final", "Project", "Participation"].map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Due Date"><input type="date" className={inputClass} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Max Points"><input type="number" min="1" step="0.5" required className={inputClass} value={form.max_points} onChange={(e) => setForm({ ...form, max_points: e.target.value })} /></Field>
              <Field label="Weight"><input type="number" min="0" step="0.1" required className={inputClass} value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} /></Field>
            </div>
            <p className="text-xs text-slate-500">Weight is relative: a Final with weight 3 counts three times as much as a Quiz with weight 1.</p>
            <SubmitButton busy={busy}>Add Assessment</SubmitButton>
          </form>
        </Modal>
      )}

      {myClasses.length === 0 ? (
        <Empty>You have no classes yet. Create one under Classes first.</Empty>
      ) : (
        <>
          <PageHeading title={cls?.name ?? "Gradebook"} subtitle="Type a score and press Tab — it saves automatically. Blank means not graded yet.">
            <div className="flex gap-2 items-center">
              {classPicker}
              <button
                onClick={() =>
                  downloadCsv(`${cls?.name ?? "grades"}.csv`,
                    roster.map((st) => ({
                      student: st.student_name,
                      ...Object.fromEntries(classAssessments.map((a) => [a.id, scoreOf(st.student_id)(a.id) ?? ""])),
                      overall: weighted(classAssessments, scoreOf(st.student_id)) ?? "",
                    })),
                    [{ key: "student", label: "Student" }, ...classAssessments.map((a) => ({ key: a.id, label: `${a.title} (/${a.max_points})` })), { key: "overall", label: "Overall %" }])
                }
                className="flex items-center gap-2 text-blue-600 font-bold text-sm bg-white border border-slate-200 hover:bg-blue-50 px-4 py-2.5 rounded-xl"
              >
                <Download size={16} /> CSV
              </button>
            </div>
          </PageHeading>

          <Card>
            {roster.length === 0 ? (
              <Empty>No students enrolled in this class yet.</Empty>
            ) : classAssessments.length === 0 ? (
              <Empty>No assessments yet. Click “Add Assessment” to create the first column.</Empty>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="text-sm min-w-full">
                  <thead className="bg-slate-50/50 text-slate-500 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold sticky left-0 bg-slate-50">Student</th>
                      {classAssessments.map((a) => (
                        <th key={a.id} className="px-3 py-3 text-center font-bold min-w-28">
                          <div className="flex items-center justify-center gap-1">
                            <span className="truncate max-w-28" title={a.title}>{a.title}</span>
                            <button onClick={() => confirmAction(`Delete "${a.title}" and all its scores?`) && assessments.remove(a.id, "Assessment deleted.")} className="text-slate-300 hover:text-red-500"><Trash2 size={12} /></button>
                          </div>
                          <div className="text-[10px] font-semibold text-slate-400">/{a.max_points} • w{a.weight}</div>
                        </th>
                      ))}
                      <th className="px-4 py-3 text-center font-bold">Overall</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {roster.map((st) => {
                      const avg = weighted(classAssessments, scoreOf(st.student_id));
                      return (
                        <tr key={st.id}>
                          <td className="px-4 py-2 font-bold text-slate-800 sticky left-0 bg-white whitespace-nowrap">{st.student_name}</td>
                          {classAssessments.map((a) => {
                            const g = gradeOf(a.id, st.student_id);
                            return (
                              <td key={a.id} className="px-2 py-2 text-center">
                                <input
                                  key={`${a.id}-${st.student_id}-${g?.score ?? ""}`}
                                  defaultValue={g?.score ?? ""}
                                  inputMode="decimal"
                                  aria-label={`${st.student_name} ${a.title}`}
                                  onBlur={(e) => saveScore(a, st.student_id, e.target.value)}
                                  className="w-20 text-center px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-400"
                                />
                              </td>
                            );
                          })}
                          <td className="px-4 py-2 text-center">
                            <span className={`font-black ${avg !== null && avg < 60 ? "text-red-600" : "text-slate-800"}`}>{avg === null ? "—" : `${avg}%`}</span>
                            <span className="ml-1 text-xs font-bold text-slate-400">{letter(avg)}</span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button onClick={() => printReportCard(st)} className="p-2 text-slate-400 hover:text-indigo-600" title="Print report card"><Printer size={16} /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </ModuleShell>
  );
}
