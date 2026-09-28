"use client";

import { useEffect, useState } from "react";
import { LifeBuoy, AlertTriangle, FolderOpen, ListChecks, Plus, TrendingUp, TrendingDown, Minus, Check, CalendarClock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, isStaff } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import { ModuleShell, Modal, Field, SubmitButton, Card, Table, Badge, Empty, Loading, AccessDenied, StatCard, inputClass, toast } from "@/components/ui";
import { fmtDate, localDate, matches, type Row } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type TabId = "watch" | "cases" | "mine";
const LEVEL_COLOR: Record<string, string> = { high: "red", medium: "orange", low: "green" };
const STATUS_COLOR: Record<string, string> = { open: "orange", monitoring: "blue", closed: "slate" };
const KINDS = ["meeting", "call", "tutoring", "plan", "referral", "note"];
const OUTCOMES = [
  { id: "improved", label: "Improved" },
  { id: "no_change", label: "No change" },
  { id: "worse", label: "Got worse" },
  { id: "withdrawn", label: "Withdrawn" },
];

// Why a student is on the watch list, in words.
const explain = (f: Row | null | undefined) => {
  if (!f) return "";
  const out: string[] = [];
  if (f.attendance_rate != null && f.attendance_rate < 85) out.push(`attendance ${f.attendance_rate}%`);
  if (f.grade_average != null && f.grade_average < 60) out.push(`grades ${f.grade_average}%`);
  if (f.submission_rate != null && f.submission_rate < 80) out.push(`${100 - f.submission_rate}% work missing`);
  if (f.financial_hold) out.push("account hold");
  return out.join(", ");
};

function Delta({ before, after, unit = "%" }: { before: number | null; after: number | null; unit?: string }) {
  if (before == null && after == null) return <span className="text-slate-400">—</span>;
  const d = before != null && after != null ? after - before : null;
  const Icon = d == null || d === 0 ? Minus : d > 0 ? TrendingUp : TrendingDown;
  return (
    <span className="inline-flex items-center gap-2 font-bold">
      {before ?? "—"}{before != null && unit} → {after ?? "—"}{after != null && unit}
      {d != null && <Icon size={16} className={d > 0 ? "text-emerald-600" : d < 0 ? "text-red-600" : "text-slate-400"} />}
    </span>
  );
}

export default function Interventions() {
  const { role, profile } = useSession();
  const t = useT();
  const staff = isStaff(role);
  const [tab, setTab] = useState<TabId>("watch");
  const [search, setSearch] = useState("");
  const cases = useTable("interventions", { orderBy: "opened_at", enabled: staff });
  const actions = useTable("intervention_actions", { orderBy: "created_at", ascending: true, enabled: staff });
  const [risks, setRisks] = useState<Row[]>([]);
  const [people, setPeople] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<Row | null>(null);
  const [openForm, setOpenForm] = useState({ mentor_id: "", reason: "", goal: "" });
  const [viewing, setViewing] = useState<Row | null>(null);
  const [impact, setImpact] = useState<Row | null>(null);
  const [actionForm, setActionForm] = useState({ kind: "meeting", note: "", owner_id: "", due_on: "" });
  const [closing, setClosing] = useState("improved");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!staff) return;
    Promise.all([
      supabase.from("student_risk_scores").select("*").order("score", { ascending: false }),
      supabase.from("profiles").select("id, full_name, role").eq("active", true).order("full_name"),
    ]).then(([r, p]) => {
      setRisks(r.data ?? []);
      setPeople(p.data ?? []);
      setLoading(false);
    });
  }, [staff]);
  useEffect(() => {
    if (!viewing) return;
    let off = false;
    supabase.rpc("intervention_impact", { p_id: viewing.id }).then(({ data }) => !off && setImpact(data as Row));
    return () => { off = true; };
  }, [viewing]);

  if (!staff) return <AccessDenied message="Interventions are for staff." />;

  const name = (id?: string | null) => people.find((p) => p.id === id)?.full_name ?? "—";
  const staffList = people.filter((p) => ["teacher", "administration", "owner"].includes(p.role));
  const openCaseFor = (studentId: string) => cases.rows.find((c) => c.student_id === studentId && c.status !== "closed");
  const today = localDate();
  const pendingActions = actions.rows.filter((a) => !a.done_at);
  const overdue = (caseId: string) => pendingActions.filter((a) => a.intervention_id === caseId && a.due_on && a.due_on < today).length;
  const mine = pendingActions.filter((a) => a.owner_id === profile?.id).sort((a, b) => String(a.due_on ?? "9999").localeCompare(String(b.due_on ?? "9999")));
  const watch = risks.filter((r) => r.level !== "low" && matches(search, name(r.student_id)));

  const startCase = (r: Row) => {
    setOpening(r);
    setOpenForm({ mentor_id: profile?.id ?? "", reason: explain(r.factors) ? `Risk ${r.score}: ${explain(r.factors)}` : "", goal: "" });
  };
  const saveCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!opening) return;
    setBusy(true);
    const row = await cases.insert({ student_id: opening.student_id, mentor_id: openForm.mentor_id || null, reason: openForm.reason.trim(), goal: openForm.goal.trim() || null }, "Intervention opened.");
    setBusy(false);
    if (row) setOpening(null);
  };
  const addAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewing) return;
    setBusy(true);
    const row = await actions.insert({ intervention_id: viewing.id, kind: actionForm.kind, note: actionForm.note.trim(), owner_id: actionForm.owner_id || profile?.id, due_on: actionForm.due_on || null }, "Added to the case.");
    setBusy(false);
    if (row) setActionForm({ kind: "meeting", note: "", owner_id: "", due_on: "" });
  };
  const setStatus = async (c: Row, status: string, outcome?: string) => {
    const ok = await cases.update(c.id, { status, ...(outcome ? { outcome } : {}) }, status === "closed" ? "Case closed." : "Case updated.");
    if (ok) setViewing({ ...c, status, outcome: outcome ?? c.outcome });
  };

  const caseActions = viewing ? actions.rows.filter((a) => a.intervention_id === viewing.id) : [];

  return (
    <ModuleShell
      title="Interventions"
      icon={LifeBuoy}
      tabs={[
        { id: "watch", label: "Watch list", icon: AlertTriangle },
        { id: "cases", label: "Cases", icon: FolderOpen },
        { id: "mine", label: "My follow-ups", icon: ListChecks },
      ]}
      activeTab={tab}
      onTab={setTab}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search students..."
    >
      {opening && (
        <Modal title={`Open intervention — ${name(opening.student_id)}`} icon={LifeBuoy} onClose={() => setOpening(null)}>
          <form onSubmit={saveCase} className="space-y-4">
            <Field label="Mentor">
              <select className={inputClass} value={openForm.mentor_id} onChange={(e) => setOpenForm({ ...openForm, mentor_id: e.target.value })}>
                <option value="">{t("No mentor yet")}</option>
                {staffList.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </Field>
            <Field label="Reason">
              <textarea required rows={2} className={inputClass} value={openForm.reason} onChange={(e) => setOpenForm({ ...openForm, reason: e.target.value })} />
            </Field>
            <Field label="Goal">
              <input className={inputClass} placeholder={t("e.g. attendance above 90% by the end of term")} value={openForm.goal} onChange={(e) => setOpenForm({ ...openForm, goal: e.target.value })} />
            </Field>
            <SubmitButton busy={busy}>Open intervention</SubmitButton>
          </form>
        </Modal>
      )}

      {viewing && (
        <Modal title={`${name(viewing.student_id)} — intervention`} icon={LifeBuoy} onClose={() => { setViewing(null); setImpact(null); }} wide>
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2 items-center">
              <Badge color={STATUS_COLOR[viewing.status]}>{viewing.status}</Badge>
              {viewing.outcome && <Badge color={viewing.outcome === "improved" ? "green" : viewing.outcome === "worse" ? "red" : "slate"}>{viewing.outcome.replace("_", " ")}</Badge>}
              <span className="text-sm text-slate-500">{t("Mentor")}: <b>{name(viewing.mentor_id)}</b> · {t("opened")} {fmtDate(viewing.opened_at)}</span>
            </div>
            <p className="text-sm"><b>{t("Reason")}:</b> {viewing.reason}</p>
            {viewing.goal && <p className="text-sm"><b>{t("Goal")}:</b> {viewing.goal}</p>}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3" aria-label={t("Impact")}>
              <div className="p-4 rounded-2xl bg-slate-50"><p className="text-xs font-bold uppercase text-slate-400 mb-1">{t("Attendance")}</p><Delta before={impact?.attendance_before ?? null} after={impact?.attendance_after ?? null} /></div>
              <div className="p-4 rounded-2xl bg-slate-50"><p className="text-xs font-bold uppercase text-slate-400 mb-1">{t("Grades")}</p><Delta before={impact?.grade_before ?? null} after={impact?.grade_after ?? null} /></div>
              <div className="p-4 rounded-2xl bg-slate-50"><p className="text-xs font-bold uppercase text-slate-400 mb-1">{t("Risk score")}</p><Delta before={impact?.risk_at_open ?? null} after={impact?.risk_now ?? null} unit="" /></div>
            </div>
            <p className="text-[11px] text-slate-400">{t("Compares the 30 days before the case opened with the time since.")}</p>

            <div>
              <h4 className="font-bold text-slate-800 mb-2">{t("Actions & follow-ups")}</h4>
              {caseActions.length === 0 ? <p className="text-sm text-slate-400">{t("Nothing recorded yet.")}</p> : (
                <ul className="space-y-2">
                  {caseActions.map((a) => (
                    <li key={a.id} className="p-3 rounded-xl border border-slate-100 flex items-start gap-3 text-sm">
                      <Badge color="purple">{t(a.kind)}</Badge>
                      <div className="flex-1 min-w-0">
                        <p className={a.done_at ? "line-through text-slate-400" : ""}>{a.note}</p>
                        <p className="text-xs text-slate-400">{name(a.owner_id)}{a.due_on && <> · {t("due")} <span className={!a.done_at && a.due_on < today ? "text-red-600 font-bold" : ""}>{fmtDate(a.due_on)}</span></>}</p>
                      </div>
                      {!a.done_at && viewing.status !== "closed" && (
                        <button onClick={() => actions.update(a.id, { done_at: new Date().toISOString() }, "Marked done.")} className="text-xs font-bold text-emerald-700 flex items-center gap-1"><Check size={14} /> {t("Done")}</button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {viewing.status !== "closed" && (
                <form onSubmit={addAction} className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                  <Field label="Type">
                    <select className={inputClass} value={actionForm.kind} onChange={(e) => setActionForm({ ...actionForm, kind: e.target.value })}>
                      {KINDS.map((k) => <option key={k} value={k}>{t(k)}</option>)}
                    </select>
                  </Field>
                  <div className="md:col-span-3">
                    <Field label="What">
                      <input required className={inputClass} value={actionForm.note} onChange={(e) => setActionForm({ ...actionForm, note: e.target.value })} placeholder={t("Call home about absences")} />
                    </Field>
                  </div>
                  <Field label="Who">
                    <select className={inputClass} value={actionForm.owner_id} onChange={(e) => setActionForm({ ...actionForm, owner_id: e.target.value })}>
                      <option value="">{t("Me")}</option>
                      {staffList.filter((s) => s.id !== profile?.id).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                    </select>
                  </Field>
                  <Field label="Due">
                    <input type="date" className={inputClass} value={actionForm.due_on} onChange={(e) => setActionForm({ ...actionForm, due_on: e.target.value })} />
                  </Field>
                  <div className="md:col-span-2"><SubmitButton busy={busy}><Plus size={16} /> Add</SubmitButton></div>
                </form>
              )}
            </div>

            {(viewing.mentor_id === profile?.id || viewing.opened_by === profile?.id || role === "owner" || role === "administration") && viewing.status !== "closed" && (
              <div className="flex flex-wrap gap-2 items-end border-t pt-4">
                {viewing.status === "open" && <button onClick={() => setStatus(viewing, "monitoring")} className="px-4 py-2 rounded-xl bg-blue-50 text-blue-700 text-sm font-bold">{t("Move to monitoring")}</button>}
                <Field label="Outcome">
                  <select className={inputClass} value={closing} onChange={(e) => setClosing(e.target.value)}>
                    {OUTCOMES.map((o) => <option key={o.id} value={o.id}>{t(o.label)}</option>)}
                  </select>
                </Field>
                <button onClick={() => setStatus(viewing, "closed", closing)} className="px-4 py-3 rounded-xl bg-slate-900 text-white text-sm font-bold">{t("Close case")}</button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {loading ? <Loading /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard label="High risk" value={risks.filter((r) => r.level === "high").length} icon={AlertTriangle} color="red" />
            <StatCard label="Open cases" value={cases.rows.filter((c) => c.status !== "closed").length} icon={FolderOpen} color="orange" />
            <StatCard label="Improved" value={cases.rows.filter((c) => c.outcome === "improved").length} icon={TrendingUp} color="emerald" />
            <StatCard label="Overdue follow-ups" value={pendingActions.filter((a) => a.due_on && a.due_on < today).length} icon={CalendarClock} color="pink" />
          </div>

          {tab === "watch" && (
            watch.length === 0 ? <Empty>No students at medium or high risk. Risk scores are recalculated nightly (Analytics & Risk).</Empty> : (
              <Table headers={["Student", "Risk", "Why", ""]}>
                {watch.map((r) => {
                  const open = openCaseFor(r.student_id);
                  return (
                    <tr key={r.student_id}>
                      <td className="px-6 py-4 font-bold text-slate-800">{name(r.student_id)}</td>
                      <td className="px-6 py-4"><Badge color={LEVEL_COLOR[r.level]}>{r.level} · {r.score}</Badge></td>
                      <td className="px-6 py-4 text-sm text-slate-600">{explain(r.factors) || "—"}</td>
                      <td className="px-6 py-4 text-right">
                        {open ? (
                          <button onClick={() => setViewing(open)} className="text-sm font-bold text-indigo-600">{t("View case")}</button>
                        ) : (
                          <button onClick={() => startCase(r)} className="text-sm font-bold text-white bg-indigo-600 px-4 py-2 rounded-xl">{t("Open case")}</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </Table>
            )
          )}

          {tab === "cases" && (
            <Table headers={["Student", "Mentor", "Reason", "Status", "Follow-ups", ""]} empty={cases.rows.length === 0 && "No interventions yet."}>
              {cases.rows.filter((c) => matches(search, name(c.student_id), c.reason)).map((c) => (
                <tr key={c.id}>
                  <td className="px-6 py-4 font-bold text-slate-800">{name(c.student_id)}<p className="text-xs text-slate-400 font-normal">{fmtDate(c.opened_at)}</p></td>
                  <td className="px-6 py-4 text-sm">{name(c.mentor_id)}</td>
                  <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">{c.reason}</td>
                  <td className="px-6 py-4"><Badge color={STATUS_COLOR[c.status]}>{c.status}</Badge>{c.outcome && <p className="text-xs text-slate-500 mt-1">{c.outcome.replace("_", " ")}</p>}</td>
                  <td className="px-6 py-4 text-sm">{pendingActions.filter((a) => a.intervention_id === c.id).length}{overdue(c.id) > 0 && <span className="ml-2 text-red-600 font-bold">{t("{n} overdue", { n: overdue(c.id) })}</span>}</td>
                  <td className="px-6 py-4 text-right"><button onClick={() => setViewing(c)} className="text-sm font-bold text-indigo-600">{t("Open")}</button></td>
                </tr>
              ))}
            </Table>
          )}

          {tab === "mine" && (
            mine.length === 0 ? <Empty>No follow-ups assigned to you.</Empty> : (
              <div className="space-y-3">
                {mine.map((a) => {
                  const c = cases.rows.find((x) => x.id === a.intervention_id);
                  return (
                    <Card key={a.id}>
                      <div className="flex flex-wrap items-center gap-3">
                        <Badge color="purple">{t(a.kind)}</Badge>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-800">{a.note}</p>
                          <p className="text-xs text-slate-500">{name(c?.student_id)}{a.due_on && <> · {t("due")} <span className={a.due_on < today ? "text-red-600 font-bold" : ""}>{fmtDate(a.due_on)}</span></>}</p>
                        </div>
                        {c && <button onClick={() => setViewing(c)} className="text-sm font-bold text-indigo-600">{t("Open case")}</button>}
                        <button onClick={() => actions.update(a.id, { done_at: new Date().toISOString() }, "Marked done.")} className="text-sm font-bold text-emerald-700 flex items-center gap-1"><Check size={16} /> {t("Done")}</button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )
          )}
        </>
      )}
      {!loading && cases.offlineSince && <p className="text-xs text-slate-400 mt-4">{t("Showing the copy saved on this device.")}</p>}
    </ModuleShell>
  );
}
