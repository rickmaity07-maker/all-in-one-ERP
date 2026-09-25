"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw, AlertTriangle, TrendingUp, Users, Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, isAdmin, isStaff } from "@/lib/session";
import { ModuleShell, Card, Table, Loading, Empty, Badge, StatCard, AccessDenied, toast } from "@/components/ui";
import { downloadCsv, errorMessage, fmtDateTime, matches, type Row } from "@/lib/utils";

type TabId = "risk" | "forecast";
const LEVEL_COLOR: Record<string, string> = { high: "red", medium: "orange", low: "green" };

export default function Analytics() {
  const { role } = useSession();
  const admin = isAdmin(role);
  const [tab, setTab] = useState<TabId>("risk");
  const [search, setSearch] = useState("");
  const [scores, setScores] = useState<Row[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [forecast, setForecast] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [level, setLevel] = useState("all");

  const fetchAll = useCallback(async () => {
    const [s, p, f] = await Promise.all([
      supabase.from("student_risk_scores").select("*").order("score", { ascending: false }),
      supabase.from("profiles").select("id, full_name").eq("role", "student"),
      admin ? supabase.rpc("admissions_forecast") : Promise.resolve({ data: [], error: null }),
    ]);
    if (s.error) toast(errorMessage(s.error), "error");
    return { s: s.data ?? [], p: p.data ?? [], f: (f.data as Row[]) ?? [] };
  }, [admin]);
  const apply = (d: Awaited<ReturnType<typeof fetchAll>>) => {
    setScores(d.s);
    setNames(Object.fromEntries(d.p.map((x) => [x.id, x.full_name])));
    setForecast(d.f);
    setLoading(false);
  };
  useEffect(() => {
    let c = false;
    fetchAll().then((d) => !c && apply(d));
    return () => { c = true; };
  }, [fetchAll]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isStaff(role)) return <AccessDenied message="Analytics is available to staff only." />;

  const recompute = async () => {
    setRunning(true);
    const { data, error } = await supabase.rpc("compute_risk_scores");
    setRunning(false);
    if (error) return toast(errorMessage(error), "error");
    toast(`Risk scores recalculated for ${data} student(s).`);
    apply(await fetchAll());
  };

  const visible = scores.filter((s) => (level === "all" || s.level === level) && matches(search, names[s.student_id]));
  const count = (l: string) => scores.filter((s) => s.level === l).length;
  const predicted = forecast.reduce((t, f) => t + Number(f.predicted_enrolments), 0);

  return (
    <ModuleShell
      title="Analytics"
      icon={Activity}
      tabs={[
        { id: "risk" as TabId, label: "Retention Risk", group: "Insights" },
        ...(admin ? [{ id: "forecast" as TabId, label: "Enrolment Forecast", group: "Insights" }] : []),
      ]}
      activeTab={tab}
      onTab={setTab}
      search={tab === "risk" ? search : undefined}
      onSearch={tab === "risk" ? setSearch : undefined}
      searchPlaceholder="Search students..."
      action={
        tab === "risk" && (
          <button onClick={recompute} disabled={running} className="flex items-center gap-2 text-sm font-bold text-white bg-indigo-600 px-5 py-3 rounded-2xl disabled:opacity-50">
            <RefreshCw size={16} className={running ? "animate-spin" : ""} /> Recalculate scores
          </button>
        )
      }
    >
      {loading ? <Loading /> : tab === "risk" ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard label="High Risk" value={count("high")} icon={AlertTriangle} color="red" />
            <StatCard label="Medium Risk" value={count("medium")} icon={Activity} color="orange" />
            <StatCard label="Low Risk" value={count("low")} icon={Users} color="emerald" />
          </div>
          <Card title="Students by retention risk" action={
            <div className="flex gap-2 items-center">
              <select aria-label="Risk level" value={level} onChange={(e) => setLevel(e.target.value)} className="text-sm font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <option value="all">All levels</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
              </select>
              <button onClick={() => downloadCsv("risk-scores.csv", visible.map((s) => ({ student: names[s.student_id], score: s.score, level: s.level, ...s.factors, computed: s.computed_at })), [
                { key: "student", label: "Student" }, { key: "score", label: "Score" }, { key: "level", label: "Level" },
                { key: "attendance_rate", label: "Attendance %" }, { key: "grade_average", label: "Grade %" }, { key: "submission_rate", label: "Submissions %" },
                { key: "financial_hold", label: "Hold" }, { key: "computed", label: "Computed" },
              ])} className="text-sm font-bold text-blue-600 flex items-center gap-1 px-3 py-2"><Download size={16} /> CSV</button>
            </div>
          }>
            <p className="text-sm text-slate-500 mb-4">Score 0–100 = 40% attendance (last 90 days) + 35% grade average + 15% missing assignments + 10% financial hold. High-risk students alert administrators automatically; scores refresh nightly when pg_cron is on.</p>
            {visible.length === 0 ? <Empty>No scores yet — click “Recalculate scores”.</Empty> : (
              <Table headers={["Student", "Risk", "Attendance", "Grades", "Submissions", "Hold", "Computed"]}>
                {visible.map((s) => (
                  <tr key={s.student_id}>
                    <td className="px-6 py-4 font-bold text-slate-800">{names[s.student_id] ?? "—"}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-slate-100 rounded-full h-2 overflow-hidden"><div className={`h-2 ${s.level === "high" ? "bg-red-500" : s.level === "medium" ? "bg-orange-400" : "bg-emerald-500"}`} style={{ width: `${s.score}%` }} /></div>
                        <Badge color={LEVEL_COLOR[s.level]}>{s.score} {s.level}</Badge>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm">{s.factors?.attendance_rate}%</td>
                    <td className="px-6 py-4 text-sm">{s.factors?.grade_average}%</td>
                    <td className="px-6 py-4 text-sm">{s.factors?.submission_rate}%</td>
                    <td className="px-6 py-4">{s.factors?.financial_hold ? <Badge color="red">Yes</Badge> : "—"}</td>
                    <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">{fmtDateTime(s.computed_at)}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard label="Applicants" value={forecast.reduce((t, f) => t + f.applicants, 0)} icon={Users} color="blue" />
            <StatCard label="Already Enrolled" value={forecast.reduce((t, f) => t + f.enrolled, 0)} icon={Activity} color="emerald" />
            <StatCard label="Predicted Intake" value={predicted.toFixed(1)} icon={TrendingUp} color="purple" />
          </div>
          <Card title="Forecast by programme">
            <p className="text-sm text-slate-500 mb-4">Predicted intake = enrolled + approved × yield + in-review × approval rate × yield. Rates are learned from past decisions (defaults 60% approval, 50% yield until there is history).</p>
            <Table headers={["Programme", "Applicants", "In Review", "Approved", "Enrolled", "Declined", "Approval", "Yield", "Predicted"]} empty={forecast.length === 0 && "No applications yet."}>
              {forecast.map((f) => (
                <tr key={f.program}>
                  <td className="px-6 py-4 font-bold text-slate-800">{f.program}</td>
                  <td className="px-6 py-4">{f.applicants}</td>
                  <td className="px-6 py-4">{f.under_review + f.awaiting_docs}</td>
                  <td className="px-6 py-4">{f.approved}</td>
                  <td className="px-6 py-4">{f.enrolled}</td>
                  <td className="px-6 py-4">{f.declined}</td>
                  <td className="px-6 py-4">{Math.round(f.approval_rate * 100)}%</td>
                  <td className="px-6 py-4">{Math.round(f.yield_rate * 100)}%</td>
                  <td className="px-6 py-4 font-black text-indigo-600">{Number(f.predicted_enrolments).toFixed(1)}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      )}
    </ModuleShell>
  );
}
