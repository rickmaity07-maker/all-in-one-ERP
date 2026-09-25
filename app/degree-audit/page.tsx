"use client";

import { useEffect, useMemo, useState } from "react";
import { Route, CheckCircle2, Clock, Circle, AlertTriangle, Printer } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, isStaff } from "@/lib/session";
import { Card, Empty, Loading, Badge, StatCard, inputClass, toast } from "@/components/ui";
import { errorMessage, escapeHtml, printDocument, type Row } from "@/lib/utils";
import { planDegree, type PlanCourse } from "@/lib/planner";

type Audit = {
  program: { id: string; name: string; degree_type: string; total_credits: number } | null;
  completed_credits: number;
  in_progress_credits: number;
  courses: (PlanCourse & { state: "completed" | "in_progress" | "remaining" })[];
};

export default function DegreeAudit() {
  const { role, profile } = useSession();
  const staff = isStaff(role);
  const [students, setStudents] = useState<Row[]>([]);
  const [studentId, setStudentId] = useState("");
  const [audit, setAudit] = useState<Audit | null>(null);
  const [loading, setLoading] = useState(true);
  const [maxCredits, setMaxCredits] = useState(30);

  const target = staff ? studentId : role === "parent" ? studentId : profile?.id ?? "";

  useEffect(() => {
    if (staff) {
      supabase.from("registrar_records").select("profile_id, student_name").not("profile_id", "is", null).order("student_name").then(({ data }) => {
        setStudents(data ?? []);
        if (data?.[0]) setStudentId((s) => s || data[0].profile_id);
      });
    } else if (role === "parent" && profile) {
      supabase.from("guardian_links").select("student_id").eq("guardian_id", profile.id).then(async ({ data }) => {
        const ids = (data ?? []).map((d) => d.student_id);
        const { data: names } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
        setStudents((names ?? []).map((n) => ({ profile_id: n.id, student_name: n.full_name })));
        if (names?.[0]) setStudentId((s) => s || names[0].id);
      });
    }
  }, [staff, role, profile]);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    supabase.rpc("degree_audit", { p_student: target }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) toast(errorMessage(error), "error");
      setAudit((data as Audit) ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [target]);

  const plan = useMemo(() => {
    if (!audit) return null;
    const satisfied = audit.courses.filter((c) => c.state !== "remaining").map((c) => c.id);
    return planDegree(audit.courses.filter((c) => c.state === "remaining"), satisfied, maxCredits);
  }, [audit, maxCredits]);

  const name = staff || role === "parent" ? students.find((s) => s.profile_id === target)?.student_name : profile?.full_name;
  const pct = audit?.program ? Math.min(100, Math.round((audit.completed_credits / audit.program.total_credits) * 100)) : 0;

  const printPlan = () => {
    if (!audit?.program || !plan) return;
    printDocument(
      `Degree plan - ${name}`,
      `<div class="brand"><div><h1>Degree Audit & Plan</h1><div class="muted">${escapeHtml(audit.program.name)} (${escapeHtml(audit.program.degree_type)})</div></div>
       <div class="right muted">${escapeHtml(name)}<br/>${new Date().toLocaleDateString()}</div></div>
       <p>Completed ${audit.completed_credits} of ${audit.program.total_credits} credits • ${audit.in_progress_credits} in progress</p>
       ${plan.terms.map((t) => `<h2>Term +${t.index} (${t.credits} credits)</h2><table><tbody>${t.courses.map((c) => `<tr><td>${escapeHtml(c.code)}</td><td>${escapeHtml(c.title)}</td><td class="right">${c.credits}</td></tr>`).join("")}</tbody></table>`).join("")}`
    );
  };

  return (
    <main className="flex-1 bg-[#F4F7FE] overflow-y-auto">
      <div className="px-4 md:px-10 py-6 md:py-10 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-800 mb-2 flex items-center gap-3"><Route className="text-indigo-600" /> Degree Audit & Planner</h1>
            <p className="text-slate-500 font-medium">Progress against the programme and the fastest prerequisite-safe path to graduation.</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {(staff || role === "parent") && (
              <select aria-label="Student" className={`${inputClass} w-64`} value={studentId} onChange={(e) => { setLoading(true); setStudentId(e.target.value); }}>
                {students.map((s) => <option key={s.profile_id} value={s.profile_id}>{s.student_name}</option>)}
              </select>
            )}
            <label className="text-xs font-bold text-slate-500 flex items-center gap-2">
              Max credits / term
              <input aria-label="Max credits per term" type="number" min="5" max="60" step="5" value={maxCredits} onChange={(e) => setMaxCredits(Math.max(5, Number(e.target.value) || 30))} className="w-20 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm" />
            </label>
            <button onClick={printPlan} disabled={!audit?.program} className="flex items-center gap-2 text-indigo-600 font-bold text-sm bg-white border border-slate-200 px-4 py-2.5 rounded-xl disabled:opacity-40"><Printer size={16} /> Print plan</button>
          </div>
        </div>

        {!target ? (
          <Empty>{staff ? "No students are linked to login accounts yet (Registrar → Linked Login Account)." : "No student selected."}</Empty>
        ) : loading ? (
          <Loading label="Running degree audit..." />
        ) : !audit?.program ? (
          <Empty>{name ?? "This student"} is not assigned to a programme yet. Set it in Registrar → Edit record.</Empty>
        ) : (
          <>
            <div className="bg-linear-to-br from-[#2A0845] to-[#6441A5] rounded-3xl md:rounded-4xl p-6 md:p-8 text-white">
              <p className="text-white/70 font-semibold">{audit.program.degree_type} • {name}</p>
              <h2 className="text-2xl md:text-3xl font-black mb-4">{audit.program.name}</h2>
              <div className="w-full bg-white/20 rounded-full h-3 overflow-hidden"><div className="bg-cyan-300 h-3" style={{ width: `${pct}%` }} /></div>
              <p className="text-sm text-white/80 mt-2">{audit.completed_credits} / {audit.program.total_credits} credits ({pct}%) • {audit.in_progress_credits} in progress</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
              <StatCard label="Completed" value={audit.courses.filter((c) => c.state === "completed").length} icon={CheckCircle2} color="emerald" />
              <StatCard label="In Progress" value={audit.courses.filter((c) => c.state === "in_progress").length} icon={Clock} color="blue" />
              <StatCard label="Terms to Graduate" value={plan?.terms.length ?? "—"} icon={Route} color="purple" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card title="Requirements">
                <div className="space-y-2">
                  {audit.courses.map((c) => (
                    <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 text-sm">
                      <span className="flex items-center gap-2 min-w-0">
                        {c.state === "completed" ? <CheckCircle2 size={16} className="text-emerald-500 shrink-0" /> : c.state === "in_progress" ? <Clock size={16} className="text-blue-500 shrink-0" /> : <Circle size={16} className="text-slate-300 shrink-0" />}
                        <span className="truncate"><b>{c.code}</b> {c.title}</span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0"><span className="text-xs text-slate-400">{c.credits} cr</span><Badge color={c.requirement === "core" ? "purple" : "blue"}>{c.requirement}</Badge></span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="Fastest path to graduation">
                {!plan || (plan.terms.length === 0 && plan.blocked.length === 0) ? (
                  <Empty>All requirements are completed or in progress.</Empty>
                ) : (
                  <div className="space-y-4">
                    {plan.terms.map((t) => (
                      <div key={t.index} className="p-4 rounded-2xl bg-slate-50 border border-slate-100" aria-label={`Planned term ${t.index}`}>
                        <p className="text-xs font-black uppercase text-indigo-600 mb-2">Term +{t.index} • {t.credits} credits</p>
                        <div className="flex flex-wrap gap-2">{t.courses.map((c) => <span key={c.id} className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1 font-semibold">{c.code}</span>)}</div>
                      </div>
                    ))}
                    {plan.blocked.map((b) => (
                      <p key={b.course.id} className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle size={12} /> {b.course.code}: {b.reason}</p>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
