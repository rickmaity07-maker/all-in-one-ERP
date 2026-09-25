"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Plus, Gavel, Plane, PieChart, BookOpen } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, isAdmin, isStaff } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import { ModuleShell, Modal, Field, SubmitButton, ActionButton, Card, Table, Loading, Empty, Badge, AccessDenied, inputClass, toast } from "@/components/ui";
import { errorMessage, fmtDate, localDate, matches, type Row } from "@/lib/utils";

type TabId = "dossiers" | "sabbaticals" | "pay";
const TENURE_COLOR: Record<string, string> = { non_tenure: "slate", tenure_track: "blue", under_review: "orange", tenured: "green", denied: "red" };
const STAGES = ["department", "college", "provost", "board"];
const label = (s: string) => s.replace(/_/g, " ");

export default function Faculty() {
  const { role, profile } = useSession();
  const admin = isAdmin(role);
  const [tab, setTab] = useState<TabId>("dossiers");
  const [search, setSearch] = useState("");
  const dossiers = useTable("faculty_dossiers", { enabled: isStaff(role) });
  const reviews = useTable("tenure_reviews", { orderBy: "created_at", ascending: true, enabled: isStaff(role) });
  const sabbaticals = useTable("sabbaticals", { enabled: isStaff(role) });
  const splits = useTable("labor_distributions", { enabled: isStaff(role) });
  const [people, setPeople] = useState<Row[]>([]);
  const [departments, setDepartments] = useState<Row[]>([]);
  const [grants, setGrants] = useState<Row[]>([]);
  const [open, setOpen] = useState<Row | null>(null);
  const [modal, setModal] = useState<"" | "dossier" | "sabbatical" | "split" | "publication">("");
  const [busy, setBusy] = useState(false);
  const [d, setD] = useState({ faculty_id: "", department_id: "", rank: "assistant", tenure_status: "tenure_track", tenure_clock_start: localDate() });
  const [s, setS] = useState({ starts_on: "", ends_on: "", plan: "" });
  const [sp, setSp] = useState({ faculty_id: "", source: "department", department_id: "", grant_id: "", percent: "", effective_from: localDate() });
  const [pub, setPub] = useState({ title: "", venue: "", year: String(new Date().getFullYear()) });

  useEffect(() => {
    if (!isStaff(role)) return;
    supabase.from("profiles").select("id, full_name, role").in("role", ["teacher", "administration", "owner"]).order("full_name").then(({ data }) => setPeople(data ?? []));
    supabase.from("departments").select("id, name").order("name").then(({ data }) => setDepartments(data ?? []));
    supabase.from("grants").select("id, title, status").in("status", ["awarded", "active"]).then(({ data }) => setGrants(data ?? []));
  }, [role]);

  if (!isStaff(role)) return <AccessDenied message="Faculty & HR is available to staff." />;

  const nameOf = (id?: string) => (id === profile?.id ? profile?.full_name : people.find((p) => p.id === id)?.full_name) ?? "—";
  const deptOf = (id?: string) => departments.find((x) => x.id === id)?.name ?? "—";
  const mine = dossiers.rows.find((x) => x.faculty_id === profile?.id);

  const saveDossier = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const row = await dossiers.insert({ ...d, department_id: d.department_id || null }, "Dossier created.");
    setBusy(false);
    if (row) setModal("");
  };
  const openReview = async (row: Row) => {
    const { error } = await supabase.rpc("open_tenure_review", { p_dossier: row.id });
    if (error) return toast(errorMessage(error), "error");
    toast("Tenure review opened at department level.");
    await Promise.all([dossiers.reload(), reviews.reload()]);
    setOpen({ ...row, tenure_status: "under_review" });
  };
  const decide = async (review: Row, decision: string) => {
    const ok = await reviews.update(review.id, { decision }, `${label(review.stage)} decision recorded.`);
    if (ok) {
      await Promise.all([reviews.reload(), dossiers.reload()]);
      const { data } = await supabase.from("faculty_dossiers").select("*").eq("id", review.dossier_id).maybeSingle();
      if (data) setOpen(data);
    }
  };
  const saveSabbatical = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("sabbaticals").insert([{ ...s }]);
    setBusy(false);
    if (error) return toast(/sabbaticals_no_overlap|conflicting key/.test(error.message) ? "That overlaps a sabbatical you already requested." : errorMessage(error), "error");
    toast("Sabbatical requested.");
    setModal("");
    sabbaticals.reload();
  };
  const saveSplit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const row = await splits.insert({
      faculty_id: sp.faculty_id, percent: Number(sp.percent), effective_from: sp.effective_from,
      department_id: sp.source === "department" ? sp.department_id : null, grant_id: sp.source === "grant" ? sp.grant_id : null,
    }, "Pay split saved.");
    setBusy(false);
    if (row) setModal("");
  };
  const addPublication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mine) return;
    setBusy(true);
    const ok = await dossiers.update(mine.id, { publications: [...(mine.publications ?? []), { ...pub, year: Number(pub.year) }] }, "Publication added.");
    setBusy(false);
    if (ok) { setModal(""); setPub({ title: "", venue: "", year: pub.year }); }
  };

  const openReviews = open ? reviews.rows.filter((r) => r.dossier_id === open.id).sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage)) : [];
  const visible = dossiers.rows.filter((x) => matches(search, nameOf(x.faculty_id), x.rank, x.tenure_status));
  const splitTotal = (id: string) => splits.rows.filter((x) => x.faculty_id === id && (!x.effective_to || x.effective_to >= localDate())).reduce((t, x) => t + Number(x.percent), 0);

  return (
    <ModuleShell
      title="Faculty & HR"
      icon={BadgeCheck}
      tabs={[
        { id: "dossiers" as TabId, label: admin ? "Faculty Dossiers" : "My Dossier", group: "Faculty Lifecycle" },
        { id: "sabbaticals" as TabId, label: "Sabbaticals", group: "Faculty Lifecycle" },
        { id: "pay" as TabId, label: "Pay Distribution", group: "Faculty Lifecycle" },
      ]}
      activeTab={tab}
      onTab={setTab}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search faculty..."
      action={
        tab === "dossiers" && admin ? <ActionButton icon={Plus} onClick={() => setModal("dossier")}>New Dossier</ActionButton>
          : tab === "sabbaticals" ? <ActionButton icon={Plane} onClick={() => setModal("sabbatical")}>Request Sabbatical</ActionButton>
          : tab === "pay" && admin ? <ActionButton icon={PieChart} onClick={() => { setSp({ ...sp, faculty_id: people[0]?.id ?? "" }); setModal("split"); }}>Add Pay Split</ActionButton> : null
      }
    >
      {modal === "dossier" && (
        <Modal title="New Faculty Dossier" icon={BadgeCheck} onClose={() => setModal("")}>
          <form onSubmit={saveDossier} className="space-y-4">
            <Field label="Faculty Member">
              <select required className={inputClass} value={d.faculty_id} onChange={(e) => setD({ ...d, faculty_id: e.target.value })}>
                <option value="">Select…</option>
                {people.filter((p) => !dossiers.rows.some((x) => x.faculty_id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Department">
                <select className={inputClass} value={d.department_id} onChange={(e) => setD({ ...d, department_id: e.target.value })}>
                  <option value="">—</option>
                  {departments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </Field>
              <Field label="Rank">
                <select className={inputClass} value={d.rank} onChange={(e) => setD({ ...d, rank: e.target.value })}>
                  {["lecturer", "assistant", "associate", "full"].map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Tenure Status">
                <select className={inputClass} value={d.tenure_status} onChange={(e) => setD({ ...d, tenure_status: e.target.value })}>
                  {["non_tenure", "tenure_track", "tenured"].map((r) => <option key={r} value={r}>{label(r)}</option>)}
                </select>
              </Field>
              <Field label="Tenure Clock Start"><input type="date" className={inputClass} value={d.tenure_clock_start} onChange={(e) => setD({ ...d, tenure_clock_start: e.target.value })} /></Field>
            </div>
            <SubmitButton busy={busy}>Create Dossier</SubmitButton>
          </form>
        </Modal>
      )}
      {modal === "sabbatical" && (
        <Modal title="Request Sabbatical" icon={Plane} onClose={() => setModal("")}>
          <form onSubmit={saveSabbatical} className="space-y-4">
            <p className="text-xs text-slate-500">Available to tenured faculty or after six years of service.</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="From"><input type="date" required className={inputClass} value={s.starts_on} onChange={(e) => setS({ ...s, starts_on: e.target.value })} /></Field>
              <Field label="To"><input type="date" required className={inputClass} value={s.ends_on} onChange={(e) => setS({ ...s, ends_on: e.target.value })} /></Field>
            </div>
            <Field label="Research / Leave Plan"><textarea required rows={3} className={inputClass} value={s.plan} onChange={(e) => setS({ ...s, plan: e.target.value })} /></Field>
            <SubmitButton busy={busy}>Submit Request</SubmitButton>
          </form>
        </Modal>
      )}
      {modal === "split" && (
        <Modal title="Pay Split" icon={PieChart} onClose={() => setModal("")}>
          <form onSubmit={saveSplit} className="space-y-4">
            <Field label="Faculty Member">
              <select required className={inputClass} value={sp.faculty_id} onChange={(e) => setSp({ ...sp, faculty_id: e.target.value })}>
                {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </Field>
            <Field label="Paid From">
              <select className={inputClass} value={sp.source} onChange={(e) => setSp({ ...sp, source: e.target.value })}>
                <option value="department">Department budget</option><option value="grant">Research grant</option>
              </select>
            </Field>
            {sp.source === "department" ? (
              <Field label="Department">
                <select required className={inputClass} value={sp.department_id} onChange={(e) => setSp({ ...sp, department_id: e.target.value })}>
                  <option value="">Select…</option>
                  {departments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </Field>
            ) : (
              <Field label="Grant">
                <select required className={inputClass} value={sp.grant_id} onChange={(e) => setSp({ ...sp, grant_id: e.target.value })}>
                  <option value="">Select…</option>
                  {grants.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
                </select>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Share (%)"><input type="number" min="1" max="100" required className={inputClass} value={sp.percent} onChange={(e) => setSp({ ...sp, percent: e.target.value })} /></Field>
              <Field label="From"><input type="date" required className={inputClass} value={sp.effective_from} onChange={(e) => setSp({ ...sp, effective_from: e.target.value })} /></Field>
            </div>
            <SubmitButton busy={busy}>Save</SubmitButton>
          </form>
        </Modal>
      )}
      {modal === "publication" && (
        <Modal title="Add Publication" icon={BookOpen} onClose={() => setModal("")}>
          <form onSubmit={addPublication} className="space-y-4">
            <Field label="Title"><input required className={inputClass} value={pub.title} onChange={(e) => setPub({ ...pub, title: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Journal / Venue"><input className={inputClass} value={pub.venue} onChange={(e) => setPub({ ...pub, venue: e.target.value })} /></Field>
              <Field label="Year"><input type="number" className={inputClass} value={pub.year} onChange={(e) => setPub({ ...pub, year: e.target.value })} /></Field>
            </div>
            <SubmitButton busy={busy}>Add</SubmitButton>
          </form>
        </Modal>
      )}
      {open && !modal && (
        <Modal title={`Dossier — ${nameOf(open.faculty_id)}`} icon={Gavel} onClose={() => setOpen(null)} wide>
          <div className="flex flex-wrap gap-2 mb-4">
            <Badge color="purple">{open.rank}</Badge>
            <Badge color={TENURE_COLOR[open.tenure_status]}>{label(open.tenure_status)}</Badge>
            <Badge color="slate">{deptOf(open.department_id)}</Badge>
            {open.tenure_clock_start && <Badge color="blue">Clock since {fmtDate(open.tenure_clock_start)}</Badge>}
          </div>
          {admin && open.tenure_status === "tenure_track" && (
            <button onClick={() => openReview(open)} className="mb-4 text-sm font-bold text-white bg-indigo-600 px-4 py-2 rounded-xl flex items-center gap-2"><Gavel size={16} /> Open tenure review</button>
          )}
          <h4 className="text-xs font-bold uppercase text-slate-400 mb-2">Tenure review</h4>
          {openReviews.length === 0 ? <p className="text-sm text-slate-400 mb-4">No review opened.</p> : (
            <div className="space-y-2 mb-4">
              {openReviews.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 text-sm">
                  <span className="font-bold capitalize">{r.stage}</span>
                  {r.decision === "pending" && admin ? (
                    <span className="flex gap-2">
                      {(r.stage === "board" ? ["approved", "denied"] : ["recommend", "not_recommend"]).map((dec) => (
                        <button key={dec} onClick={() => decide(r, dec)} className={`text-xs font-bold px-3 py-1.5 rounded-lg ${/approved|recommend$/.test(dec) && dec !== "not_recommend" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{label(dec)}</button>
                      ))}
                    </span>
                  ) : <Badge color={r.decision === "pending" ? "slate" : /approved|^recommend/.test(r.decision) ? "green" : "red"}>{label(r.decision)}</Badge>}
                </div>
              ))}
            </div>
          )}
          <h4 className="text-xs font-bold uppercase text-slate-400 mb-2">Publications</h4>
          {(open.publications ?? []).length === 0 ? <p className="text-sm text-slate-400">None listed.</p> : (
            <ul className="text-sm space-y-1">{open.publications.map((p: Row, i: number) => <li key={i}>• <b>{p.title}</b>{p.venue ? `, ${p.venue}` : ""} {p.year ? `(${p.year})` : ""}</li>)}</ul>
          )}
        </Modal>
      )}

      {dossiers.loading ? <Loading /> : tab === "dossiers" ? (
        admin ? (
          <Card title="Faculty dossiers">
            <Table headers={["Faculty", "Department", "Rank", "Tenure", "Publications"]} empty={visible.length === 0 && "No dossiers yet."}>
              {visible.map((x) => (
                <tr key={x.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(x)}>
                  <td className="px-6 py-4 font-bold text-slate-800">{nameOf(x.faculty_id)}</td>
                  <td className="px-6 py-4 text-sm">{deptOf(x.department_id)}</td>
                  <td className="px-6 py-4 capitalize">{x.rank}</td>
                  <td className="px-6 py-4"><Badge color={TENURE_COLOR[x.tenure_status]}>{label(x.tenure_status)}</Badge></td>
                  <td className="px-6 py-4">{(x.publications ?? []).length}</td>
                </tr>
              ))}
            </Table>
          </Card>
        ) : !mine ? <Empty>No dossier on file yet — the administration creates it.</Empty> : (
          <Card title="My dossier" action={<button onClick={() => setModal("publication")} className="text-sm font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl flex items-center gap-2"><Plus size={16} /> Add publication</button>}>
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge color="purple">{mine.rank}</Badge>
              <Badge color={TENURE_COLOR[mine.tenure_status]}>{label(mine.tenure_status)}</Badge>
              <Badge color="slate">{deptOf(mine.department_id)}</Badge>
            </div>
            <button onClick={() => setOpen(mine)} className="text-sm font-bold text-indigo-600">View tenure review & publications →</button>
          </Card>
        )
      ) : tab === "sabbaticals" ? (
        <Card title={admin ? "Sabbatical requests" : "My sabbaticals"}>
          <Table headers={["Faculty", "From", "To", "Plan", "Status", ...(admin ? [""] : [])]} empty={sabbaticals.rows.length === 0 && "No sabbaticals."}>
            {sabbaticals.rows.map((x) => (
              <tr key={x.id}>
                <td className="px-6 py-4 font-bold">{nameOf(x.faculty_id)}</td>
                <td className="px-6 py-4 text-sm">{fmtDate(x.starts_on)}</td>
                <td className="px-6 py-4 text-sm">{fmtDate(x.ends_on)}</td>
                <td className="px-6 py-4 text-sm max-w-xs truncate">{x.plan}</td>
                <td className="px-6 py-4"><Badge color={x.status === "approved" ? "green" : x.status === "rejected" ? "red" : "orange"}>{x.status}</Badge></td>
                {admin && (
                  <td className="px-6 py-4 text-right whitespace-nowrap">
                    {x.status === "requested" && (
                      <>
                        <button onClick={() => sabbaticals.update(x.id, { status: "approved" }, "Sabbatical approved.")} className="text-xs font-bold text-emerald-600 mr-3">Approve</button>
                        <button onClick={() => sabbaticals.update(x.id, { status: "rejected" }, "Sabbatical rejected.")} className="text-xs font-bold text-red-600">Reject</button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </Table>
        </Card>
      ) : (
        <Card title="Pay distribution (multi-source payroll)">
          <p className="text-sm text-slate-500 mb-4">Each person&apos;s salary can be split across department budgets and research grants. Splits in force at the same time can&apos;t exceed 100%.</p>
          <Table headers={["Faculty", "Source", "Share", "From", "Total in force"]} empty={splits.rows.length === 0 && "No pay splits recorded."}>
            {splits.rows.map((x) => (
              <tr key={x.id}>
                <td className="px-6 py-4 font-bold">{nameOf(x.faculty_id)}</td>
                <td className="px-6 py-4 text-sm">{x.grant_id ? `Grant: ${grants.find((g) => g.id === x.grant_id)?.title ?? "grant"}` : `Dept: ${deptOf(x.department_id)}`}</td>
                <td className="px-6 py-4 font-bold">{x.percent}%</td>
                <td className="px-6 py-4 text-sm">{fmtDate(x.effective_from)}</td>
                <td className="px-6 py-4"><Badge color={splitTotal(x.faculty_id) === 100 ? "green" : "orange"}>{splitTotal(x.faculty_id)}%</Badge></td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </ModuleShell>
  );
}
