"use client";

import { useEffect, useState } from "react";
import { ShoppingCart, Plus, Send, Check, X, Building2, History, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, isAdmin, isStaff } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import { ModuleShell, Modal, Field, SubmitButton, ActionButton, Card, Table, Loading, Empty, Badge, AccessDenied, inputClass, confirmAction, toast } from "@/components/ui";
import { errorMessage, fmtDateTime, matches, money, type Row } from "@/lib/utils";

type TabId = "requests" | "approvals" | "budgets";
const STATUS_COLOR: Record<string, string> = { draft: "slate", submitted: "orange", approved: "green", rejected: "red", ordered: "blue", received: "purple", cancelled: "slate" };
const STEP_LABEL: Record<string, string> = { department: "Department head", finance: "Finance", owner: "Owner" };
const YEAR = new Date().getFullYear();

export default function Procurement() {
  const { role, profile } = useSession();
  const admin = isAdmin(role);
  const [tab, setTab] = useState<TabId>("requests");
  const [search, setSearch] = useState("");
  const orders = useTable("purchase_orders", { enabled: isStaff(role) });
  const departments = useTable("departments", { orderBy: "name", ascending: true, enabled: isStaff(role) });
  const budgets = useTable("budgets", { enabled: admin });
  const [status, setStatus] = useState<Record<string, Row>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [staff, setStaff] = useState<Row[]>([]);
  const [modal, setModal] = useState<"" | "po" | "dept" | "budget">("");
  const [history, setHistory] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [po, setPo] = useState({ department_id: "", vendor: "", description: "", amount: "" });
  const [dept, setDept] = useState({ name: "", code: "", head_id: "" });
  const [bud, setBud] = useState({ department_id: "", fiscal_year: String(YEAR), amount: "" });

  useEffect(() => {
    if (!isStaff(role)) return;
    supabase.from("profiles").select("id, full_name, role").then(({ data }) => {
      setNames(Object.fromEntries((data ?? []).map((p) => [p.id, p.full_name])));
      setStaff((data ?? []).filter((p) => ["teacher", "administration", "owner"].includes(p.role)));
    });
  }, [role]);
  useEffect(() => {
    if (!admin) return;
    supabase.from("budget_status").select("*").then(({ data }) => setStatus(Object.fromEntries((data ?? []).map((b) => [`${b.department_id}:${b.fiscal_year}`, b]))));
  }, [admin, orders.rows, budgets.rows]);

  if (!isStaff(role)) return <AccessDenied message="Procurement is available to staff." />;

  const deptName = (id: string) => departments.rows.find((d) => d.id === id)?.name ?? "—";
  const headOf = (id: string) => departments.rows.find((d) => d.id === id)?.head_id;
  // Requests waiting for *me* at their current step.
  const canDecide = (o: Row) => {
    if (o.status !== "submitted" || (o.requester_id === profile?.id && role !== "owner")) return false;
    const step = o.pending_steps?.[0];
    return (step === "department" && (headOf(o.department_id) === profile?.id || admin)) || (step === "finance" && admin) || (step === "owner" && role === "owner");
  };

  const savePo = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const row = await orders.insert({ department_id: po.department_id, vendor: po.vendor, description: po.description, amount: Number(po.amount), requester_id: profile?.id }, "Draft saved. Submit it when ready.");
    setBusy(false);
    if (row) { setModal(""); setPo({ ...po, vendor: "", description: "", amount: "" }); }
  };
  const submit = async (o: Row) => {
    const { data, error } = await supabase.rpc("submit_po", { p_po: o.id });
    if (error) return toast(errorMessage(error), "error");
    toast(`Submitted. Approval route: ${String(data).split(" → ").map((s) => STEP_LABEL[s]).join(" → ")}.`);
    orders.reload();
  };
  const decide = async (o: Row, approve: boolean) => {
    const note = approve ? "" : window.prompt("Reason for rejecting?") ?? "";
    if (!approve && !note) return;
    const { data, error } = await supabase.rpc("decide_po", { p_po: o.id, p_approve: approve, p_note: note || null });
    if (error) return toast(errorMessage(error), "error");
    toast(data === "approved" ? "Request fully approved." : data === "rejected" ? "Request rejected." : `Approved — now with ${STEP_LABEL[data as string]}.`);
    orders.reload();
  };
  const saveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const row = await departments.insert({ name: dept.name, code: dept.code || null, head_id: dept.head_id || null }, "Department added.");
    setBusy(false);
    if (row) { setModal(""); setDept({ name: "", code: "", head_id: "" }); }
  };
  const saveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("budgets").upsert({ department_id: bud.department_id, fiscal_year: Number(bud.fiscal_year), amount: Number(bud.amount) }, { onConflict: "department_id,fiscal_year" });
    setBusy(false);
    if (error) return toast(errorMessage(error), "error");
    toast("Budget saved.");
    setModal("");
    budgets.reload();
  };

  const mine = orders.rows.filter((o) => o.requester_id === profile?.id && matches(search, o.vendor, o.description));
  const queue = orders.rows.filter(canDecide);
  const all = orders.rows.filter((o) => matches(search, o.vendor, o.description, names[o.requester_id]));

  const orderRow = (o: Row, withActions: "mine" | "queue" | "all") => (
    <tr key={o.id}>
      {withActions !== "mine" && <td className="px-6 py-4 text-sm">{names[o.requester_id] ?? "—"}</td>}
      <td className="px-6 py-4"><p className="font-bold text-slate-800">{o.vendor}</p><p className="text-xs text-slate-400">{o.description}</p></td>
      <td className="px-6 py-4 text-sm">{deptName(o.department_id)}</td>
      <td className="px-6 py-4 font-black">{money(o.amount)}</td>
      <td className="px-6 py-4">
        <Badge color={STATUS_COLOR[o.status]}>{o.status}</Badge>
        {o.status === "submitted" && o.pending_steps?.[0] && <p className="text-[10px] text-slate-400 mt-1">Waiting: {STEP_LABEL[o.pending_steps[0]]}</p>}
      </td>
      <td className="px-6 py-4 text-right whitespace-nowrap">
        <button onClick={() => setHistory(o)} title="Approval history" className="text-slate-400 hover:text-indigo-600 mr-2"><History size={16} /></button>
        {withActions === "mine" && o.status === "draft" && (
          <>
            <button onClick={() => submit(o)} className="text-xs font-bold text-white bg-indigo-600 px-3 py-1.5 rounded-lg mr-2"><Send size={12} className="inline mr-1" />Submit</button>
            <button onClick={() => confirmAction("Delete this draft?") && orders.remove(o.id, "Draft deleted.")} className="text-xs font-bold text-red-600">Delete</button>
          </>
        )}
        {withActions === "queue" && (
          <>
            <button onClick={() => decide(o, true)} className="text-xs font-bold text-white bg-emerald-600 px-3 py-1.5 rounded-lg mr-2"><Check size={12} className="inline mr-1" />Approve</button>
            <button onClick={() => decide(o, false)} className="text-xs font-bold text-red-600"><X size={12} className="inline mr-1" />Reject</button>
          </>
        )}
        {withActions === "all" && admin && o.status === "approved" && <button onClick={() => orders.update(o.id, { status: "ordered" }, "Marked as ordered.")} className="text-xs font-bold text-blue-600">Mark ordered</button>}
        {withActions === "all" && admin && o.status === "ordered" && <button onClick={() => orders.update(o.id, { status: "received" }, "Marked as received.")} className="text-xs font-bold text-purple-600">Mark received</button>}
      </td>
    </tr>
  );

  return (
    <ModuleShell
      title="Procurement"
      icon={ShoppingCart}
      tabs={[
        { id: "requests" as TabId, label: admin ? "All Requests" : "My Requests", group: "Spend Management" },
        { id: "approvals" as TabId, label: `Approvals (${queue.length})`, group: "Spend Management" },
        ...(admin ? [{ id: "budgets" as TabId, label: "Departments & Budgets", group: "Spend Management" }] : []),
      ]}
      activeTab={tab}
      onTab={setTab}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search vendors, descriptions..."
      action={
        tab === "requests" ? <ActionButton icon={Plus} onClick={() => { setPo({ ...po, department_id: po.department_id || departments.rows[0]?.id || "" }); setModal("po"); }}>New Request</ActionButton>
          : tab === "budgets" ? <ActionButton icon={Building2} onClick={() => setModal("dept")}>Add Department</ActionButton> : null
      }
    >
      {modal === "po" && (
        <Modal title="New Purchase Request" icon={ShoppingCart} onClose={() => setModal("")}>
          <form onSubmit={savePo} className="space-y-4">
            <Field label="Department">
              <select required className={inputClass} value={po.department_id} onChange={(e) => setPo({ ...po, department_id: e.target.value })}>
                <option value="">Select…</option>
                {departments.rows.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Vendor"><input required className={inputClass} value={po.vendor} onChange={(e) => setPo({ ...po, vendor: e.target.value })} /></Field>
            <Field label="What is it for?"><input required className={inputClass} value={po.description} onChange={(e) => setPo({ ...po, description: e.target.value })} /></Field>
            <Field label="Amount ($)"><input type="number" min="0.01" step="0.01" required className={inputClass} value={po.amount} onChange={(e) => setPo({ ...po, amount: e.target.value })} /></Field>
            <p className="text-xs text-slate-500">Under $1,000: department head. Under $10,000: + finance. Larger: + owner.</p>
            <SubmitButton busy={busy}>Save Draft</SubmitButton>
          </form>
        </Modal>
      )}
      {modal === "dept" && (
        <Modal title="Add Department" icon={Building2} onClose={() => setModal("")}>
          <form onSubmit={saveDept} className="space-y-4">
            <Field label="Name"><input required className={inputClass} value={dept.name} onChange={(e) => setDept({ ...dept, name: e.target.value })} /></Field>
            <Field label="Code"><input className={inputClass} value={dept.code} onChange={(e) => setDept({ ...dept, code: e.target.value })} placeholder="ENG" /></Field>
            <Field label="Head (approves requests)">
              <select className={inputClass} value={dept.head_id} onChange={(e) => setDept({ ...dept, head_id: e.target.value })}>
                <option value="">—</option>
                {staff.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </Field>
            <SubmitButton busy={busy}>Add</SubmitButton>
          </form>
        </Modal>
      )}
      {modal === "budget" && (
        <Modal title="Set Budget" icon={Wallet} onClose={() => setModal("")}>
          <form onSubmit={saveBudget} className="space-y-4">
            <Field label="Department">
              <select required className={inputClass} value={bud.department_id} onChange={(e) => setBud({ ...bud, department_id: e.target.value })}>
                {departments.rows.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Fiscal Year"><input type="number" required className={inputClass} value={bud.fiscal_year} onChange={(e) => setBud({ ...bud, fiscal_year: e.target.value })} /></Field>
              <Field label="Budget ($)"><input type="number" min="0" required className={inputClass} value={bud.amount} onChange={(e) => setBud({ ...bud, amount: e.target.value })} /></Field>
            </div>
            <SubmitButton busy={busy}>Save Budget</SubmitButton>
          </form>
        </Modal>
      )}
      {history && (
        <Modal title={`Approval history — ${history.vendor}`} icon={History} onClose={() => setHistory(null)}>
          {(history.routing_history ?? []).length === 0 ? <Empty>Not submitted yet.</Empty> : (
            <ol className="space-y-3">
              {history.routing_history.map((h: Row, i: number) => (
                <li key={i} className="p-3 rounded-xl border border-slate-100 text-sm">
                  <p className="font-bold capitalize">{h.action}{h.step ? ` — ${STEP_LABEL[h.step]}` : ""}{h.route ? ` (route: ${h.route.map((s: string) => STEP_LABEL[s]).join(" → ")})` : ""}</p>
                  <p className="text-xs text-slate-400">{names[h.by] ?? "—"} • {fmtDateTime(h.at)}</p>
                  {h.note && <p className="text-xs text-slate-600 mt-1">“{h.note}”</p>}
                </li>
              ))}
            </ol>
          )}
        </Modal>
      )}

      {orders.loading || departments.loading ? <Loading /> : tab === "requests" ? (
        <Card title={admin ? "All purchase requests" : "My purchase requests"}>
          {departments.rows.length === 0 && <p className="text-sm text-orange-600 mb-4">No departments yet — an administrator adds them under Departments & Budgets.</p>}
          <Table headers={[...(admin ? ["Requester"] : []), "Vendor / Item", "Department", "Amount", "Status", ""]} empty={(admin ? all : mine).length === 0 && "No requests yet."}>
            {(admin ? all : mine).map((o) => orderRow(o, admin && o.requester_id !== profile?.id ? "all" : "mine"))}
          </Table>
        </Card>
      ) : tab === "approvals" ? (
        <Card title="Waiting for my approval">
          <Table headers={["Requester", "Vendor / Item", "Department", "Amount", "Status", ""]} empty={queue.length === 0 && "Nothing waiting for you."}>
            {queue.map((o) => orderRow(o, "queue"))}
          </Table>
        </Card>
      ) : (
        <Card title="Departments & budgets" action={<button onClick={() => { setBud({ ...bud, department_id: departments.rows[0]?.id ?? "" }); setModal("budget"); }} className="flex items-center gap-2 text-sm font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl"><Wallet size={16} /> Set budget</button>}>
          <Table headers={["Department", "Head", `Budget ${YEAR}`, "Committed", "Available"]} empty={departments.rows.length === 0 && "No departments yet."}>
            {departments.rows.map((d) => {
              const b = status[`${d.id}:${YEAR}`];
              return (
                <tr key={d.id}>
                  <td className="px-6 py-4 font-bold text-slate-800">{d.name} {d.code && <span className="text-xs text-slate-400">({d.code})</span>}</td>
                  <td className="px-6 py-4 text-sm">{names[d.head_id] ?? "—"}</td>
                  <td className="px-6 py-4">{b ? money(b.budget) : <span className="text-xs text-slate-400">not set</span>}</td>
                  <td className="px-6 py-4">{b ? money(b.committed) : "—"}</td>
                  <td className={`px-6 py-4 font-black ${b && Number(b.available) < 0.1 * Number(b.budget) ? "text-red-600" : "text-emerald-600"}`}>{b ? money(b.available) : "—"}</td>
                </tr>
              );
            })}
          </Table>
        </Card>
      )}
    </ModuleShell>
  );
}
