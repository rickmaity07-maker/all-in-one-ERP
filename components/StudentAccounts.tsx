"use client";

import { useCallback, useEffect, useState } from "react";
import { Wallet, Lock, Unlock, Receipt, HandCoins, CalendarClock, Plus, Printer, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Card, Table, Badge, Modal, Field, SubmitButton, Loading, Empty, StatCard, IconButton, inputClass, toast } from "@/components/ui";
import { errorMessage, escapeHtml, fmtDate, fmtDateTime, localDate, matches, money, printDocument, type Row } from "@/lib/utils";

const TYPE_COLOR: Record<string, string> = { charge: "orange", refund: "orange", payment: "green", aid: "purple", adjustment: "blue" };
const signed = (e: Row) => (["charge", "refund"].includes(e.entry_type) || (e.entry_type === "adjustment" && String(e.debit_account).startsWith("student:")) ? 1 : -1) * Number(e.amount);

export function printStatement(name: string, entries: Row[], balance: number) {
  let running = 0;
  const rows = entries
    .map((e) => {
      running += signed(e);
      return `<tr><td>${fmtDate(e.created_at)}</td><td>${escapeHtml(e.description)}</td><td>${escapeHtml(e.entry_type)}</td><td class="right">${signed(e) > 0 ? money(e.amount) : ""}</td><td class="right">${signed(e) < 0 ? money(e.amount) : ""}</td><td class="right">${money(running)}</td></tr>`;
    })
    .join("");
  printDocument(
    `Statement - ${name}`,
    `<div class="brand"><div><h1>Account Statement</h1><div class="muted">Student Accounts Office</div></div><div class="right muted">${escapeHtml(name)}<br/>${new Date().toLocaleDateString()}</div></div>
     <table><thead><tr><th>Date</th><th>Description</th><th>Type</th><th class="right">Charges</th><th class="right">Credits</th><th class="right">Balance</th></tr></thead><tbody>${rows}</tbody></table>
     <p class="right total">Balance due: ${money(balance)}</p>`
  );
}

// Staff view: every student account with its ledger, holds, payments, aid and plans.
export function AccountsAdmin({ search }: { search: string }) {
  const [balances, setBalances] = useState<Row[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [students, setStudents] = useState<Row[]>([]);
  const [terms, setTerms] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Row | null>(null);
  const [ledger, setLedger] = useState<Row[]>([]);
  const [aid, setAid] = useState<Row[]>([]);
  const [plans, setPlans] = useState<Row[]>([]);
  const [modal, setModal] = useState<"" | "payment" | "adjust" | "aid" | "plan" | "account">("");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ amount: "", method: "card", reference: "", direction: "credit", reason: "", name: "", kind: "grant", term_id: "", installments: "3", first_due: localDate(), student_id: "", residency: "resident" });

  const fetchAll = useCallback(async () => {
    const [b, p, t] = await Promise.all([
      supabase.from("student_balances").select("*"),
      supabase.from("profiles").select("id, full_name, role").order("full_name"),
      supabase.from("terms").select("*").order("starts_on", { ascending: false }),
    ]);
    if (b.error) toast(errorMessage(b.error), "error");
    return { b: b.data ?? [], p: p.data ?? [], t: t.data ?? [] };
  }, []);
  const reload = useCallback(async () => {
    const d = await fetchAll();
    setBalances(d.b);
    setNames(Object.fromEntries(d.p.map((x) => [x.id, x.full_name])));
    setStudents(d.p.filter((x) => x.role === "student"));
    setTerms(d.t);
  }, [fetchAll]);
  useEffect(() => {
    let cancelled = false;
    fetchAll().then((d) => {
      if (cancelled) return;
      setBalances(d.b);
      setNames(Object.fromEntries(d.p.map((x) => [x.id, x.full_name])));
      setStudents(d.p.filter((x) => x.role === "student"));
      setTerms(d.t);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [fetchAll]);

  const openAccount = async (acct: Row) => {
    setOpen(acct);
    const [l, a, p] = await Promise.all([
      supabase.from("ledger_entries").select("*").eq("account_id", acct.account_id).order("created_at"),
      supabase.from("aid_awards").select("*").eq("student_id", acct.student_id).order("created_at", { ascending: false }),
      supabase.from("payment_plans").select("*, plan_installments(*)").eq("account_id", acct.account_id),
    ]);
    setLedger(l.data ?? []);
    setAid(a.data ?? []);
    setPlans(p.data ?? []);
  };
  const refreshOpen = async () => {
    await reload();
    if (open) {
      const { data } = await supabase.from("student_balances").select("*").eq("account_id", open.account_id).maybeSingle();
      if (data) await openAccount(data);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!open && modal !== "account") return;
    setBusy(true);
    let error: { message: string } | null = null;
    if (modal === "payment") ({ error } = await supabase.rpc("record_payment", { p_student: open!.student_id, p_amount: parseFloat(f.amount), p_method: f.method, p_reference: f.reference || null }));
    if (modal === "adjust") ({ error } = await supabase.rpc("post_adjustment", { p_student: open!.student_id, p_amount: parseFloat(f.amount), p_direction: f.direction, p_reason: f.reason }));
    if (modal === "aid") ({ error } = await supabase.from("aid_awards").insert([{ student_id: open!.student_id, term_id: f.term_id || null, name: f.name, kind: f.kind, amount: parseFloat(f.amount) }]));
    if (modal === "plan") ({ error } = await supabase.from("payment_plans").insert([{ account_id: open!.account_id, term_id: f.term_id || null, total: parseFloat(f.amount), installments: parseInt(f.installments), first_due: f.first_due }]));
    if (modal === "account") ({ error } = await supabase.from("student_accounts").insert([{ student_id: f.student_id, residency: f.residency }]));
    setBusy(false);
    if (error) return toast(errorMessage(error), "error");
    toast({ payment: "Payment recorded.", adjust: "Adjustment posted.", aid: "Aid offer created.", plan: "Installment plan created.", account: "Account opened." }[modal as "payment"]);
    setModal("");
    setF({ ...f, amount: "", reference: "", reason: "", name: "" });
    refreshOpen();
  };

  const setHold = async (acct: Row, hold: boolean) => {
    const { error } = await supabase.from("student_accounts").update({ hold, hold_reason: hold ? "Manual hold" : null }).eq("id", acct.account_id);
    if (error) return toast(errorMessage(error), "error");
    toast(hold ? "Hold placed." : "Hold released.");
    refreshOpen();
  };
  const runHolds = async () => {
    const { data, error } = await supabase.rpc("refresh_holds");
    if (error) return toast(errorMessage(error), "error");
    toast(`${data} new hold(s) placed for overdue balances.`);
    reload();
  };
  const setAidStatus = async (a: Row, status: string) => {
    const { error } = await supabase.from("aid_awards").update({ status }).eq("id", a.id);
    if (error) return toast(errorMessage(error), "error");
    toast(status === "disbursed" ? "Aid disbursed to the account." : `Aid ${status}.`);
    refreshOpen();
  };

  const visible = balances.filter((b) => matches(search, names[b.student_id]));
  const total = balances.reduce((s, b) => s + Number(b.balance), 0);

  if (loading) return <Loading />;
  return (
    <>
      {modal && (
        <Modal title={{ payment: "Record Payment", adjust: "Post Adjustment", aid: "Offer Financial Aid", plan: "Installment Plan", account: "Open Student Account" }[modal]} icon={Wallet} onClose={() => setModal("")}>
          <form onSubmit={submit} className="space-y-4">
            {modal === "account" && (
              <>
                <Field label="Student">
                  <select required className={inputClass} value={f.student_id} onChange={(e) => setF({ ...f, student_id: e.target.value })}>
                    <option value="">Select…</option>
                    {students.filter((s) => !balances.some((b) => b.student_id === s.id)).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                </Field>
                <Field label="Residency">
                  <select className={inputClass} value={f.residency} onChange={(e) => setF({ ...f, residency: e.target.value })}>
                    <option value="resident">Resident</option><option value="non_resident">Non-resident</option><option value="international">International</option>
                  </select>
                </Field>
              </>
            )}
            {modal !== "account" && <Field label="Amount ($)"><input type="number" step="0.01" min="0.01" required className={inputClass} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>}
            {modal === "payment" && (
              <>
                <Field label="Method">
                  <select className={inputClass} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
                    {["card", "bank_transfer", "cash", "stripe", "paypal", "cheque"].map((m) => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
                  </select>
                </Field>
                <Field label="Reference"><input className={inputClass} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="Receipt / transaction id" /></Field>
              </>
            )}
            {modal === "adjust" && (
              <>
                <Field label="Direction">
                  <select className={inputClass} value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })}>
                    <option value="credit">Credit (reduces balance)</option><option value="charge">Charge (increases balance)</option>
                  </select>
                </Field>
                <Field label="Reason"><input required className={inputClass} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
              </>
            )}
            {modal === "aid" && (
              <>
                <Field label="Award Name"><input required className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Merit scholarship" /></Field>
                <Field label="Kind">
                  <select className={inputClass} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
                    {["grant", "scholarship", "loan", "waiver"].map((k) => <option key={k}>{k}</option>)}
                  </select>
                </Field>
              </>
            )}
            {(modal === "aid" || modal === "plan") && (
              <Field label="Term">
                <select className={inputClass} value={f.term_id} onChange={(e) => setF({ ...f, term_id: e.target.value })}>
                  <option value="">— Any —</option>
                  {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
            )}
            {modal === "plan" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Installments"><input type="number" min="2" max="12" className={inputClass} value={f.installments} onChange={(e) => setF({ ...f, installments: e.target.value })} /></Field>
                <Field label="First Due"><input type="date" required className={inputClass} value={f.first_due} onChange={(e) => setF({ ...f, first_due: e.target.value })} /></Field>
              </div>
            )}
            <SubmitButton busy={busy}>Save</SubmitButton>
          </form>
        </Modal>
      )}

      {open && !modal && (
        <Modal title={`Account — ${names[open.student_id] ?? "Student"}`} icon={Wallet} onClose={() => setOpen(null)} wide>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Badge color={Number(open.balance) > 0 ? "orange" : "green"}>Balance {money(open.balance)}</Badge>
            {open.hold ? <Badge color="red">Hold: {open.hold_reason}</Badge> : <Badge color="slate">No hold</Badge>}
            <Badge color="blue">{String(open.residency).replace("_", "-")}</Badge>
          </div>
          <div className="flex flex-wrap gap-2 mb-6">
            <button onClick={() => setModal("payment")} className="text-xs font-bold text-white bg-emerald-600 px-3 py-2 rounded-lg flex items-center gap-1"><Receipt size={14} /> Record payment</button>
            <button onClick={() => setModal("adjust")} className="text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-2 rounded-lg">Adjustment</button>
            <button onClick={() => setModal("aid")} className="text-xs font-bold text-purple-700 bg-purple-50 px-3 py-2 rounded-lg flex items-center gap-1"><HandCoins size={14} /> Offer aid</button>
            <button onClick={() => setModal("plan")} className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-2 rounded-lg flex items-center gap-1"><CalendarClock size={14} /> Installment plan</button>
            <button onClick={() => setHold(open, !open.hold)} className="text-xs font-bold text-red-700 bg-red-50 px-3 py-2 rounded-lg flex items-center gap-1">{open.hold ? <><Unlock size={14} /> Release hold</> : <><Lock size={14} /> Place hold</>}</button>
            <button onClick={() => printStatement(names[open.student_id] ?? "", ledger, Number(open.balance))} className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-2 rounded-lg flex items-center gap-1"><Printer size={14} /> Statement</button>
          </div>
          <h4 className="text-xs font-bold uppercase text-slate-400 mb-2">Ledger (append-only)</h4>
          <Table headers={["Date", "Description", "Type", "Debit → Credit", "Amount"]} empty={ledger.length === 0 && "No entries yet."}>
            {ledger.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2 text-xs text-slate-500 whitespace-nowrap">{fmtDateTime(e.created_at)}</td>
                <td className="px-4 py-2 text-sm">{e.description}</td>
                <td className="px-4 py-2"><Badge color={TYPE_COLOR[e.entry_type]}>{e.entry_type}</Badge></td>
                <td className="px-4 py-2 text-[10px] font-mono text-slate-400">{e.debit_account.split(":")[0]} → {e.credit_account.split(":")[0]}</td>
                <td className={`px-4 py-2 font-bold text-right ${signed(e) > 0 ? "text-slate-800" : "text-emerald-600"}`}>{signed(e) > 0 ? "" : "−"}{money(e.amount)}</td>
              </tr>
            ))}
          </Table>
          {aid.length > 0 && (
            <div className="mt-6">
              <h4 className="text-xs font-bold uppercase text-slate-400 mb-2">Financial aid</h4>
              {aid.map((a) => (
                <div key={a.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 text-sm mb-2">
                  <span>{a.name} <span className="text-slate-400">({a.kind})</span> — <b>{money(a.amount)}</b></span>
                  <span className="flex items-center gap-2"><Badge color={a.status === "disbursed" ? "green" : a.status === "accepted" ? "blue" : "slate"}>{a.status}</Badge>
                    {a.status === "accepted" && <button onClick={() => setAidStatus(a, "disbursed")} className="text-xs font-bold text-emerald-600">Disburse</button>}
                    {["offered", "accepted"].includes(a.status) && <button onClick={() => setAidStatus(a, "cancelled")} className="text-xs font-bold text-red-600">Cancel</button>}
                  </span>
                </div>
              ))}
            </div>
          )}
          {plans.length > 0 && (
            <div className="mt-6">
              <h4 className="text-xs font-bold uppercase text-slate-400 mb-2">Installment plans</h4>
              {plans.map((p) => (
                <div key={p.id} className="p-3 rounded-xl border border-slate-100 text-sm mb-2">
                  <p className="font-bold">{money(p.total)} in {p.installments} installments</p>
                  <div className="flex flex-wrap gap-2 mt-2">{(p.plan_installments ?? []).sort((a: Row, b: Row) => a.seq - b.seq).map((i: Row) => <span key={i.id} className="text-xs bg-slate-50 border rounded-lg px-2 py-1">{fmtDate(i.due_on)}: {money(i.amount)}</span>)}</div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard label="Accounts" value={balances.length} icon={Wallet} color="indigo" />
        <StatCard label="Total Receivable" value={money(total)} icon={Receipt} color="orange" />
        <StatCard label="On Hold" value={balances.filter((b) => b.hold).length} icon={Lock} color="red" />
      </div>
      <Card title="Student accounts" action={
        <div className="flex flex-wrap gap-2">
          <button onClick={runHolds} className="flex items-center gap-2 text-sm font-bold text-red-600 bg-red-50 px-4 py-2 rounded-xl"><RefreshCw size={16} /> Check overdue holds</button>
          <button onClick={() => { setOpen(null); setModal("account"); }} className="flex items-center gap-2 text-sm font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl"><Plus size={16} /> Open account</button>
        </div>
      }>
        {visible.length === 0 ? <Empty>No student accounts yet. They are opened automatically when a student registers for a priced course.</Empty> : (
          <Table headers={["Student", "Residency", "Balance", "Status", "Actions"]}>
            {visible.map((b) => (
              <tr key={b.account_id}>
                <td className="px-6 py-4 font-bold text-slate-800">{names[b.student_id] ?? b.student_id}</td>
                <td className="px-6 py-4 text-xs uppercase text-slate-500">{String(b.residency).replace("_", "-")}</td>
                <td className={`px-6 py-4 font-black ${Number(b.balance) > 0 ? "text-orange-600" : "text-emerald-600"}`}>{money(b.balance)}</td>
                <td className="px-6 py-4">{b.hold ? <Badge color="red"><Lock size={10} /> Hold</Badge> : <Badge color="green">Clear</Badge>}</td>
                <td className="px-6 py-4 text-right"><IconButton icon={Wallet} title="Open account" onClick={() => openAccount(b)} /></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}

// Student / parent view: their own statement, aid offers and installment schedule.
export function MyAccount({ studentIds, names }: { studentIds: string[]; names: Record<string, string> }) {
  const [accounts, setAccounts] = useState<Row[]>([]);
  const [ledger, setLedger] = useState<Row[]>([]);
  const [aid, setAid] = useState<Row[]>([]);
  const [plans, setPlans] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const key = studentIds.join(",");

  const fetchAll = useCallback(async () => {
    const ids = key.split(",").filter(Boolean);
    if (!ids.length) return { a: [], l: [], d: [], p: [] };
    const [a, l, d, p] = await Promise.all([
      supabase.from("student_balances").select("*").in("student_id", ids),
      supabase.from("ledger_entries").select("*").order("created_at"),
      supabase.from("aid_awards").select("*").in("student_id", ids).order("created_at", { ascending: false }),
      supabase.from("payment_plans").select("*, plan_installments(*)"),
    ]);
    return { a: a.data ?? [], l: l.data ?? [], d: d.data ?? [], p: p.data ?? [] };
  }, [key]);
  useEffect(() => {
    let cancelled = false;
    fetchAll().then((x) => {
      if (cancelled) return;
      setAccounts(x.a); setLedger(x.l); setAid(x.d); setPlans(x.p); setLoading(false);
    });
    return () => { cancelled = true; };
  }, [fetchAll]);

  const accept = async (a: Row) => {
    const { error } = await supabase.from("aid_awards").update({ status: "accepted" }).eq("id", a.id);
    if (error) return toast(errorMessage(error), "error");
    toast("Aid offer accepted.");
    const x = await fetchAll();
    setAid(x.d);
  };

  if (loading) return <Loading />;
  if (!accounts.length) return <Empty>No student account yet. It is opened automatically when you register for a course with tuition.</Empty>;
  return (
    <div className="space-y-6">
      {accounts.map((acct) => {
        const entries = ledger.filter((e) => e.account_id === acct.account_id);
        return (
          <Card key={acct.account_id} title={`Account — ${names[acct.student_id] ?? ""}`} action={
            <button onClick={() => printStatement(names[acct.student_id] ?? "", entries, Number(acct.balance))} className="flex items-center gap-2 text-sm font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl"><Printer size={16} /> Statement</button>
          }>
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge color={Number(acct.balance) > 0 ? "orange" : "green"}>Balance {money(acct.balance)}</Badge>
              {acct.hold && <Badge color="red"><Lock size={10} /> {acct.hold_reason} — registration blocked</Badge>}
            </div>
            <Table headers={["Date", "Description", "Type", "Amount"]} empty={entries.length === 0 && "No activity yet."}>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-2 text-xs text-slate-500">{fmtDate(e.created_at)}</td>
                  <td className="px-4 py-2 text-sm">{e.description}</td>
                  <td className="px-4 py-2"><Badge color={TYPE_COLOR[e.entry_type]}>{e.entry_type}</Badge></td>
                  <td className={`px-4 py-2 font-bold text-right ${signed(e) > 0 ? "text-slate-800" : "text-emerald-600"}`}>{signed(e) > 0 ? "" : "−"}{money(e.amount)}</td>
                </tr>
              ))}
            </Table>
            {aid.filter((a) => a.student_id === acct.student_id).map((a) => (
              <div key={a.id} className="flex items-center justify-between p-3 rounded-xl border border-purple-100 bg-purple-50/40 text-sm mt-3">
                <span><HandCoins size={14} className="inline mr-1 text-purple-500" /> {a.name} ({a.kind}) — <b>{money(a.amount)}</b></span>
                {a.status === "offered" ? <button onClick={() => accept(a)} className="text-xs font-bold text-white bg-purple-600 px-3 py-1.5 rounded-lg">Accept offer</button> : <Badge color={a.status === "disbursed" ? "green" : "blue"}>{a.status}</Badge>}
              </div>
            ))}
            {plans.filter((p) => p.account_id === acct.account_id).map((p) => (
              <div key={p.id} className="p-3 rounded-xl border border-slate-100 text-sm mt-3">
                <p className="font-bold">Installment plan: {money(p.total)}</p>
                <div className="flex flex-wrap gap-2 mt-2">{(p.plan_installments ?? []).sort((a: Row, b: Row) => a.seq - b.seq).map((i: Row) => <span key={i.id} className={`text-xs border rounded-lg px-2 py-1 ${i.due_on < localDate() ? "bg-red-50 border-red-200" : "bg-slate-50"}`}>{fmtDate(i.due_on)}: {money(i.amount)}</span>)}</div>
              </div>
            ))}
          </Card>
        );
      })}
    </div>
  );
}

// Fee schedules: per-credit rate, flat fee, full-time block cap and residency pricing.
export function FeeSchedules() {
  const [rows, setRows] = useState<Row[]>([]);
  const [terms, setTerms] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: "", term_id: "", residency: "any", per_credit: "", flat_fee: "0", full_time_credits: "12", block_cap: "" });
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([supabase.from("fee_schedules").select("*").order("created_at", { ascending: false }), supabase.from("terms").select("*").order("starts_on", { ascending: false })]);
    return { a: a.data ?? [], b: b.data ?? [] };
  }, []);
  useEffect(() => {
    let c = false;
    load().then((d) => { if (!c) { setRows(d.a); setTerms(d.b); } });
    return () => { c = true; };
  }, [load]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("fee_schedules").insert([{ ...f, term_id: f.term_id || null, per_credit: parseFloat(f.per_credit) || 0, flat_fee: parseFloat(f.flat_fee) || 0, full_time_credits: parseInt(f.full_time_credits) || 12, block_cap: f.block_cap ? parseFloat(f.block_cap) : null }]);
    setBusy(false);
    if (error) return toast(errorMessage(error), "error");
    toast("Fee schedule saved.");
    setOpen(false);
    const d = await load();
    setRows(d.a);
  };
  const toggle = async (r: Row) => {
    const { error } = await supabase.from("fee_schedules").update({ active: !r.active }).eq("id", r.id);
    if (error) return toast(errorMessage(error), "error");
    setRows(rows.map((x) => (x.id === r.id ? { ...x, active: !r.active } : x)));
  };
  return (
    <>
      {open && (
        <Modal title="New Fee Schedule" icon={Receipt} onClose={() => setOpen(false)}>
          <form onSubmit={save} className="space-y-4">
            <Field label="Name"><input required className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Standard tuition" /></Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Term">
                <select className={inputClass} value={f.term_id} onChange={(e) => setF({ ...f, term_id: e.target.value })}>
                  <option value="">All terms</option>
                  {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="Residency">
                <select className={inputClass} value={f.residency} onChange={(e) => setF({ ...f, residency: e.target.value })}>
                  <option value="any">Any</option><option value="resident">Resident</option><option value="non_resident">Non-resident</option><option value="international">International</option>
                </select>
              </Field>
              <Field label="Per Credit ($)"><input type="number" step="0.01" min="0" required className={inputClass} value={f.per_credit} onChange={(e) => setF({ ...f, per_credit: e.target.value })} /></Field>
              <Field label="Flat Fee ($)"><input type="number" step="0.01" min="0" className={inputClass} value={f.flat_fee} onChange={(e) => setF({ ...f, flat_fee: e.target.value })} /></Field>
              <Field label="Full-time Credits"><input type="number" min="1" className={inputClass} value={f.full_time_credits} onChange={(e) => setF({ ...f, full_time_credits: e.target.value })} /></Field>
              <Field label="Full-time Cap ($)"><input type="number" step="0.01" min="0" className={inputClass} value={f.block_cap} onChange={(e) => setF({ ...f, block_cap: e.target.value })} placeholder="No cap" /></Field>
            </div>
            <SubmitButton busy={busy}>Save</SubmitButton>
          </form>
        </Modal>
      )}
      <Card title="Fee schedules" action={<button onClick={() => setOpen(true)} className="flex items-center gap-2 text-sm font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl"><Plus size={16} /> New schedule</button>}>
        <p className="text-sm text-slate-500 mb-4">Tuition = credits × per-credit rate (capped at the full-time cap once a student reaches full-time) + flat fee. Enrolling or dropping recalculates it automatically; drops after the add/drop deadline stay billed.</p>
        <Table headers={["Name", "Term", "Residency", "Per Credit", "Flat", "Full-time", "Status"]} empty={rows.length === 0 && "No fee schedules yet — tuition is not charged until one exists."}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-6 py-3 font-bold">{r.name}</td>
              <td className="px-6 py-3 text-sm">{terms.find((t) => t.id === r.term_id)?.name ?? "All"}</td>
              <td className="px-6 py-3 text-xs uppercase">{r.residency}</td>
              <td className="px-6 py-3">{money(r.per_credit)}</td>
              <td className="px-6 py-3">{money(r.flat_fee)}</td>
              <td className="px-6 py-3 text-sm">{r.full_time_credits} cr{r.block_cap ? ` • cap ${money(r.block_cap)}` : ""}</td>
              <td className="px-6 py-3"><button onClick={() => toggle(r)}><Badge color={r.active ? "green" : "slate"}>{r.active ? "Active" : "Off"}</Badge></button></td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
