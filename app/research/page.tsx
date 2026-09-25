"use client";

import { useEffect, useState } from "react";
import { FlaskConical, Plus, Receipt, CheckCircle2, Clock, ShieldCheck, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, isAdmin, isStaff } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import { ModuleShell, Modal, Field, SubmitButton, ActionButton, Card, Table, Loading, Empty, Badge, StatCard, AccessDenied, inputClass } from "@/components/ui";
import { fmtDate, localDate, matches, money, type Row } from "@/lib/utils";

type TabId = "grants" | "effort";
const STATUS_COLOR: Record<string, string> = { proposal: "slate", submitted: "blue", awarded: "purple", active: "green", closed: "slate", declined: "red" };
const CATEGORIES = ["personnel", "equipment", "travel", "supplies", "participant_support", "indirect"];
const label = (s: string) => s.replace(/_/g, " ");
const quarter = () => { const d = new Date(); return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`; };

export default function Research() {
  const { role, profile } = useSession();
  const admin = isAdmin(role);
  const [tab, setTab] = useState<TabId>("grants");
  const [search, setSearch] = useState("");
  const grants = useTable("grants", { enabled: isStaff(role) });
  const spend = useTable("grant_expenditures", { orderBy: "spent_on", enabled: isStaff(role) });
  const effort = useTable("effort_certifications", { enabled: isStaff(role) });
  const [balances, setBalances] = useState<Record<string, Row>>({});
  const [people, setPeople] = useState<Row[]>([]);
  const [departments, setDepartments] = useState<Row[]>([]);
  const [open, setOpen] = useState<Row | null>(null);
  const [modal, setModal] = useState<"" | "grant" | "spend" | "effort">("");
  const [busy, setBusy] = useState(false);
  const [g, setG] = useState({ title: "", sponsor_name: "", principal_investigator: "", department_id: "", total_amount: "", start_date: localDate(), end_date: "", categories: [] as string[], travel_cap: "" });
  const [e, setE] = useState({ category: "equipment", amount: "", description: "", spent_on: localDate() });
  const [ef, setEf] = useState({ grant_id: "", period: quarter(), percent_effort: "" });

  useEffect(() => {
    if (!isStaff(role)) return;
    supabase.from("grant_balances").select("*").then(({ data }) => setBalances(Object.fromEntries((data ?? []).map((b) => [b.grant_id, b]))));
  }, [role, spend.rows, grants.rows]);
  useEffect(() => {
    if (!isStaff(role)) return;
    supabase.from("profiles").select("id, full_name, role").in("role", ["teacher", "administration", "owner"]).order("full_name").then(({ data }) => setPeople(data ?? []));
    supabase.from("departments").select("id, name").order("name").then(({ data }) => setDepartments(data ?? []));
  }, [role]);

  if (!isStaff(role)) return <AccessDenied message="Research & grants are available to staff." />;

  const nameOf = (id?: string) => people.find((p) => p.id === id)?.full_name ?? "—";
  const saveGrant = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    const rules: Row = {};
    if (g.categories.length) rules.allowed_categories = g.categories;
    if (g.travel_cap) rules.category_caps = { travel: Number(g.travel_cap) };
    const row = await grants.insert({
      title: g.title, sponsor_name: g.sponsor_name, principal_investigator: admin ? g.principal_investigator || profile?.id : profile?.id,
      department_id: g.department_id || null, total_amount: Number(g.total_amount), start_date: g.start_date, end_date: g.end_date, restriction_rules: rules,
    }, admin ? "Grant recorded." : "Proposal submitted to the research office.");
    setBusy(false);
    if (row) setModal("");
  };
  const saveSpend = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!open) return;
    setBusy(true);
    const row = await spend.insert({ grant_id: open.id, category: e.category, amount: Number(e.amount), description: e.description, spent_on: e.spent_on }, "Expense recorded against the grant.");
    setBusy(false);
    if (row) { setModal(""); setE({ ...e, amount: "", description: "" }); }
  };
  const saveEffort = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    const row = await effort.insert({ grant_id: ef.grant_id, person_id: profile?.id, period: ef.period, percent_effort: Number(ef.percent_effort), certified_at: new Date().toISOString() }, "Effort certified.");
    setBusy(false);
    if (row) setModal("");
  };
  const setStatus = (row: Row, status: string) => grants.update(row.id, { status }, `Grant marked ${status}.`);

  const visible = grants.rows.filter((x) => matches(search, x.title, x.sponsor_name, nameOf(x.principal_investigator)));
  const activeTotal = grants.rows.filter((x) => ["awarded", "active"].includes(x.status)).reduce((s, x) => s + Number(x.total_amount), 0);
  const spentTotal = spend.rows.reduce((s, x) => s + Number(x.amount), 0);
  const myGrants = grants.rows.filter((x) => x.principal_investigator === profile?.id);
  const openSpend = open ? spend.rows.filter((x) => x.grant_id === open.id) : [];
  const rulesText = (r: Row) => [
    r?.allowed_categories?.length ? `Allowed: ${r.allowed_categories.map(label).join(", ")}` : "",
    r?.category_caps ? Object.entries(r.category_caps).map(([k, v]) => `${label(k)} capped at ${money(v as number)}`).join("; ") : "",
  ].filter(Boolean).join(" • ") || "No sponsor restrictions";

  return (
    <ModuleShell
      title="Research & Grants"
      icon={FlaskConical}
      tabs={[
        { id: "grants" as TabId, label: "Grants & Awards", group: "Research Office" },
        { id: "effort" as TabId, label: "Effort Certification", group: "Research Office" },
      ]}
      activeTab={tab}
      onTab={setTab}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search grants, sponsors, investigators..."
      action={tab === "grants" ? <ActionButton icon={Plus} onClick={() => { setG({ ...g, title: "", sponsor_name: "", total_amount: "", end_date: "" }); setModal("grant"); }}>{admin ? "New Grant" : "Propose Grant"}</ActionButton>
        : <ActionButton icon={ShieldCheck} onClick={() => { setEf({ ...ef, grant_id: myGrants[0]?.id ?? grants.rows[0]?.id ?? "" }); setModal("effort"); }}>Certify Effort</ActionButton>}
    >
      {modal === "grant" && (
        <Modal title={admin ? "New Grant" : "Propose a Grant"} icon={FlaskConical} onClose={() => setModal("")} wide>
          <form onSubmit={saveGrant} className="space-y-4">
            <Field label="Project Title"><input required className={inputClass} value={g.title} onChange={(x) => setG({ ...g, title: x.target.value })} /></Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Sponsor"><input required className={inputClass} value={g.sponsor_name} onChange={(x) => setG({ ...g, sponsor_name: x.target.value })} placeholder="National Science Foundation" /></Field>
              <Field label="Total Award ($)"><input type="number" min="1" step="0.01" required className={inputClass} value={g.total_amount} onChange={(x) => setG({ ...g, total_amount: x.target.value })} /></Field>
              {admin && (
                <Field label="Principal Investigator">
                  <select className={inputClass} value={g.principal_investigator} onChange={(x) => setG({ ...g, principal_investigator: x.target.value })}>
                    <option value="">Me</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Department">
                <select className={inputClass} value={g.department_id} onChange={(x) => setG({ ...g, department_id: x.target.value })}>
                  <option value="">—</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
              <Field label="Starts"><input type="date" required className={inputClass} value={g.start_date} onChange={(x) => setG({ ...g, start_date: x.target.value })} /></Field>
              <Field label="Ends"><input type="date" required className={inputClass} value={g.end_date} onChange={(x) => setG({ ...g, end_date: x.target.value })} /></Field>
            </div>
            <Field label="Sponsor-allowed spending (none = any)" group>
              <div className="flex flex-wrap gap-3">
                {CATEGORIES.map((c) => (
                  <label key={c} className="flex items-center gap-2 text-sm font-semibold text-slate-600 capitalize">
                    <input type="checkbox" checked={g.categories.includes(c)} onChange={(x) => setG({ ...g, categories: x.target.checked ? [...g.categories, c] : g.categories.filter((y) => y !== c) })} /> {label(c)}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Travel Cap ($, optional)"><input type="number" min="0" className={inputClass} value={g.travel_cap} onChange={(x) => setG({ ...g, travel_cap: x.target.value })} /></Field>
            <SubmitButton busy={busy}>{admin ? "Save Grant" : "Submit Proposal"}</SubmitButton>
          </form>
        </Modal>
      )}
      {modal === "spend" && open && (
        <Modal title={`Expense — ${open.title}`} icon={Receipt} onClose={() => setModal("")}>
          <form onSubmit={saveSpend} className="space-y-4">
            <p className="text-xs text-slate-500">{rulesText(open.restriction_rules)}</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Category">
                <select className={inputClass} value={e.category} onChange={(x) => setE({ ...e, category: x.target.value })}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
                </select>
              </Field>
              <Field label="Amount ($)"><input type="number" min="0.01" step="0.01" required className={inputClass} value={e.amount} onChange={(x) => setE({ ...e, amount: x.target.value })} /></Field>
            </div>
            <Field label="Description"><input required className={inputClass} value={e.description} onChange={(x) => setE({ ...e, description: x.target.value })} /></Field>
            <Field label="Date"><input type="date" required className={inputClass} value={e.spent_on} onChange={(x) => setE({ ...e, spent_on: x.target.value })} /></Field>
            <SubmitButton busy={busy}>Record Expense</SubmitButton>
          </form>
        </Modal>
      )}
      {modal === "effort" && (
        <Modal title="Certify Effort" icon={ShieldCheck} onClose={() => setModal("")}>
          <form onSubmit={saveEffort} className="space-y-4">
            <p className="text-xs text-slate-500">Certify the share of your working time spent on each sponsored project. Across all grants it can&apos;t exceed 100% for a period.</p>
            <Field label="Grant">
              <select required className={inputClass} value={ef.grant_id} onChange={(x) => setEf({ ...ef, grant_id: x.target.value })}>
                <option value="">Select…</option>
                {grants.rows.filter((x) => ["awarded", "active"].includes(x.status)).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Period"><input required className={inputClass} value={ef.period} onChange={(x) => setEf({ ...ef, period: x.target.value })} placeholder="2026-Q3" /></Field>
              <Field label="Effort (%)"><input type="number" min="1" max="100" required className={inputClass} value={ef.percent_effort} onChange={(x) => setEf({ ...ef, percent_effort: x.target.value })} /></Field>
            </div>
            <SubmitButton busy={busy}>Certify</SubmitButton>
          </form>
        </Modal>
      )}
      {open && !modal && (
        <Modal title={open.title} icon={Wallet} onClose={() => setOpen(null)} wide>
          <div className="flex flex-wrap gap-2 mb-3">
            <Badge color={STATUS_COLOR[open.status]}>{open.status}</Badge>
            <Badge color="blue">{open.sponsor_name}</Badge>
            <Badge color="slate">{fmtDate(open.start_date)} → {fmtDate(open.end_date)}</Badge>
          </div>
          <p className="text-sm text-slate-500 mb-4">{rulesText(open.restriction_rules)}</p>
          <div className="grid grid-cols-3 gap-3 mb-4 text-center">
            {[["Award", balances[open.id]?.total_amount], ["Spent", balances[open.id]?.spent], ["Remaining", balances[open.id]?.remaining]].map(([k, v]) => (
              <div key={k as string} className="p-3 rounded-2xl bg-slate-50"><p className="text-[10px] font-bold uppercase text-slate-400">{k}</p><p className="font-black text-slate-800">{money(v as number)}</p></div>
            ))}
          </div>
          {admin && (
            <div className="flex flex-wrap gap-2 mb-4">
              {["submitted", "awarded", "active", "closed", "declined"].filter((s) => s !== open.status).map((s) => (
                <button key={s} onClick={async () => { if (await setStatus(open, s)) setOpen({ ...open, status: s }); }} className="text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg capitalize">Mark {s}</button>
              ))}
            </div>
          )}
          {(admin || open.principal_investigator === profile?.id) && ["awarded", "active"].includes(open.status) && (
            <button onClick={() => setModal("spend")} className="mb-4 text-sm font-bold text-white bg-emerald-600 px-4 py-2 rounded-xl flex items-center gap-2"><Receipt size={16} /> Record expense</button>
          )}
          <Table headers={["Date", "Category", "Description", "Amount"]} empty={openSpend.length === 0 && "No spending yet."}>
            {openSpend.map((x) => (
              <tr key={x.id}>
                <td className="px-4 py-2 text-sm text-slate-500">{fmtDate(x.spent_on)}</td>
                <td className="px-4 py-2 text-sm capitalize">{label(x.category)}</td>
                <td className="px-4 py-2 text-sm">{x.description}</td>
                <td className="px-4 py-2 font-bold text-right">{money(x.amount)}</td>
              </tr>
            ))}
          </Table>
        </Modal>
      )}

      {tab === "grants" ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard label="Active Awards" value={money(activeTotal)} icon={CheckCircle2} color="emerald" />
            <StatCard label="Spent" value={money(spentTotal)} icon={Receipt} color="orange" />
            <StatCard label="Proposals Pending" value={grants.rows.filter((x) => ["proposal", "submitted"].includes(x.status)).length} icon={Clock} color="blue" />
          </div>
          <Card title="Grants">
            {grants.loading ? <Loading /> : visible.length === 0 ? <Empty>No grants yet.</Empty> : (
              <Table headers={["Project", "Sponsor", "Investigator", "Award", "Remaining", "Status"]}>
                {visible.map((x) => (
                  <tr key={x.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(x)}>
                    <td className="px-6 py-4 font-bold text-slate-800">{x.title}</td>
                    <td className="px-6 py-4 text-sm">{x.sponsor_name}</td>
                    <td className="px-6 py-4 text-sm">{nameOf(x.principal_investigator)}</td>
                    <td className="px-6 py-4">{money(x.total_amount)}</td>
                    <td className="px-6 py-4 font-bold">{money(balances[x.id]?.remaining ?? x.total_amount)}</td>
                    <td className="px-6 py-4"><Badge color={STATUS_COLOR[x.status]}>{x.status}</Badge></td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      ) : (
        <Card title="Effort certifications">
          {effort.loading ? <Loading /> : (
            <Table headers={["Period", "Grant", "Person", "Effort", "Certified"]} empty={effort.rows.length === 0 && "No certifications yet."}>
              {effort.rows.map((x) => (
                <tr key={x.id}>
                  <td className="px-6 py-4 font-mono text-sm">{x.period}</td>
                  <td className="px-6 py-4">{grants.rows.find((y) => y.id === x.grant_id)?.title ?? "—"}</td>
                  <td className="px-6 py-4 text-sm">{x.person_id === profile?.id ? "Me" : nameOf(x.person_id)}</td>
                  <td className="px-6 py-4 font-bold">{x.percent_effort}%</td>
                  <td className="px-6 py-4 text-sm text-slate-500">{x.certified_at ? fmtDate(x.certified_at) : <Badge color="orange">Pending</Badge>}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}
    </ModuleShell>
  );
}

