"use client";

import { useEffect, useState } from "react";
import { Plus, Download, ArrowUpRight, ArrowDownLeft, Receipt, CreditCard, Printer, Trash2, AlertTriangle, TrendingUp } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, isAdmin } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import {
  ModuleShell, Modal, Field, SubmitButton, ActionButton, PageHeading, Card, Table, Loading, Badge,
  AccessDenied, IconButton, inputClass, confirmAction,
} from "@/components/ui";
import { downloadCsv, escapeHtml, fmtDate, matches, money, printDocument, type Row } from "@/lib/utils";

type TabId = "overview" | "invoices" | "expenses";

const today = () => new Date().toISOString().slice(0, 10);
const isOverdue = (inv: Row) => inv.status === "Pending" && inv.due_date && inv.due_date < today();

function printInvoice(inv: Row) {
  printDocument(
    `Invoice ${inv.id.substring(0, 8).toUpperCase()}`,
    `<div class="brand"><div><h1>All-In-One ERP</h1><div class="muted">Student Accounts Office</div></div>
      <div class="right"><h1>INVOICE</h1><div class="muted">#${inv.id.substring(0, 8).toUpperCase()}</div></div></div>
     <p><b>Billed to:</b> ${escapeHtml(inv.student_name)}<br/>
     <span class="muted">Issued ${fmtDate(inv.created_at)}${inv.due_date ? ` • Due ${fmtDate(inv.due_date)}` : ""}</span></p>
     <table><thead><tr><th>Description</th><th class="right">Amount</th></tr></thead>
     <tbody><tr><td>${escapeHtml(inv.description)}</td><td class="right">${money(inv.amount)}</td></tr></tbody></table>
     <p class="right total">Total: ${money(inv.amount)}</p>
     <p><b>Status:</b> ${escapeHtml(inv.status)}${inv.paid_at ? ` (paid ${fmtDate(inv.paid_at)})` : ""}</p>`
  );
}

export default function FinancePortal() {
  const { role } = useSession();
  const admin = isAdmin(role);
  const [activeTab, setActiveTab] = useState<TabId>(admin ? "overview" : "invoices");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const invoices = useTable("invoices");
  const expenses = useTable("expenses", { orderBy: "expense_date", enabled: admin });
  const [students, setStudents] = useState<Row[]>([]);

  const [modal, setModal] = useState<"" | "invoice" | "expense">("");
  const [busy, setBusy] = useState(false);
  const [inv, setInv] = useState({ student_id: "", student_name: "", description: "Term 1 Tuition Fee", amount: "", due_date: "" });
  const [exp, setExp] = useState({ category: "Payroll", description: "", amount: "", expense_date: today() });

  useEffect(() => {
    if (!admin) return;
    supabase.from("profiles").select("id, full_name").eq("role", "student").order("full_name").then(({ data }) => setStudents(data ?? []));
  }, [admin]);

  if (role === "teacher") return <AccessDenied message="Finance & Billing is available to administrators and students only." />;

  const handleInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const row = await invoices.insert(
      {
        student_id: inv.student_id || null,
        student_name: inv.student_name,
        description: inv.description,
        amount: parseFloat(inv.amount),
        due_date: inv.due_date || null,
        status: "Pending",
      },
      "Invoice issued."
    );
    setBusy(false);
    if (row) {
      setInv({ student_id: "", student_name: "", description: "Term 1 Tuition Fee", amount: "", due_date: "" });
      setModal("");
      setActiveTab("invoices");
    }
  };

  const handleExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const row = await expenses.insert({ ...exp, amount: parseFloat(exp.amount) }, "Expense recorded.");
    setBusy(false);
    if (row) {
      setExp({ category: "Payroll", description: "", amount: "", expense_date: today() });
      setModal("");
    }
  };

  const allInvoices = invoices.rows;
  const visibleInvoices = allInvoices.filter(
    (i) =>
      matches(search, i.student_name, i.description, i.id) &&
      (statusFilter === "All" || (statusFilter === "Overdue" ? isOverdue(i) : i.status === statusFilter))
  );
  const year = new Date().getFullYear();
  const paidThisYear = allInvoices.filter((i) => i.status === "Paid" && new Date(i.paid_at ?? i.created_at).getFullYear() === year);
  const revenue = paidThisYear.reduce((s, i) => s + Number(i.amount), 0);
  const outstanding = allInvoices.filter((i) => i.status === "Pending").reduce((s, i) => s + Number(i.amount), 0);
  const overdue = allInvoices.filter(isOverdue);
  const expensesThisYear = expenses.rows.filter((x) => new Date(x.expense_date).getFullYear() === year).reduce((s, x) => s + Number(x.amount), 0);

  // Last six months of collected revenue vs. expenses.
  const months = Array.from({ length: 6 }, (_, k) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (5 - k));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const inc = allInvoices.filter((i) => i.status === "Paid" && (i.paid_at ?? i.created_at).startsWith(key)).reduce((s, i) => s + Number(i.amount), 0);
    const out = expenses.rows.filter((x) => String(x.expense_date).startsWith(key)).reduce((s, x) => s + Number(x.amount), 0);
    return { label: d.toLocaleString(undefined, { month: "short" }), inc, out };
  });
  const maxBar = Math.max(1, ...months.flatMap((m) => [m.inc, m.out]));

  const exportInvoices = () =>
    downloadCsv("invoices.csv", visibleInvoices, [
      { key: "id", label: "Invoice ID" },
      { key: "student_name", label: "Student" },
      { key: "description", label: "Description" },
      { key: "amount", label: "Amount" },
      { key: "status", label: "Status" },
      { key: "due_date", label: "Due" },
      { key: "paid_at", label: "Paid At" },
      { key: "created_at", label: "Issued" },
    ]);

  const tabs = admin
    ? [
        { id: "overview" as TabId, label: "Overview & Cash Flow", group: "Financial Views" },
        { id: "invoices" as TabId, label: "Student Tuition Invoices", group: "Financial Views" },
        { id: "expenses" as TabId, label: "Expenses & Payroll", group: "Financial Views" },
      ]
    : [{ id: "invoices" as TabId, label: "My Invoices", group: "Billing" }];

  return (
    <ModuleShell
      title="Billing & Finance"
      icon={CreditCard}
      tabs={tabs}
      activeTab={activeTab}
      onTab={setActiveTab}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search invoices, students, IDs..."
      action={
        admin && (
          <ActionButton icon={Plus} onClick={() => setModal(activeTab === "expenses" ? "expense" : "invoice")}>
            {activeTab === "expenses" ? "Record Expense" : "Generate Invoice"}
          </ActionButton>
        )
      }
    >
      {modal === "invoice" && (
        <Modal title="Generate Invoice" icon={Receipt} onClose={() => setModal("")}>
          <form onSubmit={handleInvoice} className="space-y-4">
            <Field label="Student Account">
              <select
                className={inputClass}
                value={inv.student_id}
                onChange={(e) => {
                  const s = students.find((x) => x.id === e.target.value);
                  setInv({ ...inv, student_id: e.target.value, student_name: s?.full_name ?? inv.student_name });
                }}
              >
                <option value="">— Not linked to an account —</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </Field>
            <Field label="Recipient Name">
              <input required className={inputClass} value={inv.student_name} onChange={(e) => setInv({ ...inv, student_name: e.target.value })} placeholder="e.g. Marcus Chen" />
            </Field>
            <Field label="Description">
              <input required className={inputClass} value={inv.description} onChange={(e) => setInv({ ...inv, description: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Amount ($)">
                <input type="number" step="0.01" min="0" required className={inputClass} value={inv.amount} onChange={(e) => setInv({ ...inv, amount: e.target.value })} />
              </Field>
              <Field label="Due Date">
                <input type="date" className={inputClass} value={inv.due_date} onChange={(e) => setInv({ ...inv, due_date: e.target.value })} />
              </Field>
            </div>
            <SubmitButton busy={busy}>Issue Invoice</SubmitButton>
          </form>
        </Modal>
      )}

      {modal === "expense" && (
        <Modal title="Record Expense" icon={Receipt} onClose={() => setModal("")}>
          <form onSubmit={handleExpense} className="space-y-4">
            <Field label="Category">
              <select className={inputClass} value={exp.category} onChange={(e) => setExp({ ...exp, category: e.target.value })}>
                {["Payroll", "Facilities", "Equipment", "Utilities", "Software", "Other"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Description"><input required className={inputClass} value={exp.description} onChange={(e) => setExp({ ...exp, description: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Amount ($)"><input type="number" step="0.01" min="0" required className={inputClass} value={exp.amount} onChange={(e) => setExp({ ...exp, amount: e.target.value })} /></Field>
              <Field label="Date"><input type="date" required className={inputClass} value={exp.expense_date} onChange={(e) => setExp({ ...exp, expense_date: e.target.value })} /></Field>
            </div>
            <SubmitButton busy={busy}>Save Expense</SubmitButton>
          </form>
        </Modal>
      )}

      {activeTab === "overview" ? (
        <>
          <PageHeading title="Financial Dashboard" subtitle="High-level overview of revenue and outstanding balances." />
          <div className="grid grid-cols-3 gap-8 mb-10">
            <div className="bg-linear-to-br from-cyan-400 to-blue-600 rounded-4xl p-8 text-white shadow-lg relative overflow-hidden group">
              <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
              <p className="text-cyan-100 font-semibold tracking-wide text-sm mb-2 uppercase">Collected Revenue ({year})</p>
              <h3 className="text-4xl font-black mb-6">{money(revenue)}</h3>
              <div className="flex items-center gap-2 text-sm font-medium bg-black/10 w-fit px-3 py-1.5 rounded-xl backdrop-blur-md">
                <ArrowUpRight size={16} className="text-cyan-200" /> {paidThisYear.length} paid invoices
              </div>
            </div>

            <div className="bg-linear-to-br from-pink-500 to-orange-400 rounded-4xl p-8 text-white shadow-lg relative overflow-hidden group cursor-pointer" onClick={() => { setStatusFilter("Pending"); setActiveTab("invoices"); }}>
              <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
              <p className="text-pink-100 font-semibold tracking-wide text-sm mb-2 uppercase">Outstanding Tuition</p>
              <h3 className="text-4xl font-black mb-6">{money(outstanding)}</h3>
              <div className="flex items-center gap-2 text-sm font-medium bg-black/10 w-fit px-3 py-1.5 rounded-xl backdrop-blur-md">
                <ArrowDownLeft size={16} className="text-pink-200" /> {overdue.length} overdue &rarr;
              </div>
            </div>

            <div className="bg-linear-to-br from-[#8A2387] to-[#E94057] rounded-4xl p-8 text-white shadow-lg relative overflow-hidden group cursor-pointer" onClick={() => setActiveTab("expenses")}>
              <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
              <p className="text-white/80 font-semibold tracking-wide text-sm mb-2 uppercase">Net ({year})</p>
              <h3 className="text-4xl font-black mb-6">{money(revenue - expensesThisYear)}</h3>
              <div className="flex items-center gap-2 text-sm font-medium bg-black/10 w-fit px-3 py-1.5 rounded-xl backdrop-blur-md">
                <Receipt size={16} /> {money(expensesThisYear)} expenses
              </div>
            </div>
          </div>

          <Card title="Cash Flow — Last 6 Months">
            {invoices.loading || expenses.loading ? (
              <Loading />
            ) : (
              <>
                <div className="flex items-end gap-6 h-56 border-b border-slate-100 pb-2">
                  {months.map((m) => (
                    <div key={m.label} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                      <div className="flex items-end gap-1.5 h-full w-full justify-center">
                        <div className="w-5 bg-linear-to-t from-blue-600 to-cyan-400 rounded-t-lg" style={{ height: `${(m.inc / maxBar) * 100}%` }} title={`Collected ${money(m.inc)}`} />
                        <div className="w-5 bg-linear-to-t from-[#8A2387] to-[#E94057] rounded-t-lg" style={{ height: `${(m.out / maxBar) * 100}%` }} title={`Expenses ${money(m.out)}`} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-6 mt-2">
                  {months.map((m) => <div key={m.label} className="flex-1 text-center text-xs font-bold text-slate-500">{m.label}</div>)}
                </div>
                <div className="flex gap-6 mt-6 text-xs font-bold text-slate-500">
                  <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-blue-500" /> Collected</span>
                  <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-pink-500" /> Expenses</span>
                  <span className="flex items-center gap-2 ml-auto"><TrendingUp size={14} /> Hover bars for exact values</span>
                </div>
              </>
            )}
          </Card>
        </>
      ) : activeTab === "invoices" ? (
        <>
          <PageHeading
            title={admin ? "Tuition & Billing Accounts" : "My Invoices"}
            subtitle={admin ? "Manage student invoices, track payments, and export records." : "Your tuition and fee invoices. Print any invoice for your records."}
          />
          <Card
            title={`Invoice Registry (${visibleInvoices.length})`}
            action={
              <div className="flex items-center gap-2">
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-sm font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none">
                  {["All", "Pending", "Overdue", "Paid"].map((s) => <option key={s}>{s}</option>)}
                </select>
                <button onClick={exportInvoices} className="flex items-center gap-2 text-blue-600 font-bold text-sm hover:bg-blue-50 px-4 py-2 rounded-xl transition-colors">
                  <Download size={16} /> Export CSV
                </button>
              </div>
            }
          >
            {invoices.loading ? (
              <Loading />
            ) : (
              <Table headers={["Invoice ID", "Student / Recipient", "Amount", "Due", "Status", "Actions"]} empty={visibleInvoices.length === 0 && "No invoices match."}>
                {visibleInvoices.map((i) => (
                  <tr key={i.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-400 text-xs uppercase">{i.id.substring(0, 8)}</td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-800">{i.student_name}</div>
                      <div className="text-slate-500 text-xs mt-0.5">{i.description}</div>
                    </td>
                    <td className="px-6 py-4 font-black text-slate-800">{money(i.amount)}</td>
                    <td className="px-6 py-4 text-slate-500 text-xs">{fmtDate(i.due_date)}</td>
                    <td className="px-6 py-4">
                      {i.status === "Paid" ? <Badge color="green">Paid</Badge> : isOverdue(i) ? <Badge color="red"><AlertTriangle size={12} /> Overdue</Badge> : <Badge color="orange">Pending</Badge>}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {admin && i.status === "Pending" && (
                          <button onClick={() => invoices.update(i.id, { status: "Paid", paid_at: new Date().toISOString() }, "Marked as paid.")} className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors mr-1">
                            Mark Paid
                          </button>
                        )}
                        <IconButton icon={Printer} title="Print / Save as PDF" onClick={() => printInvoice(i)} />
                        {admin && <IconButton icon={Trash2} title="Delete" danger onClick={() => confirmAction("Delete this invoice?") && invoices.remove(i.id, "Invoice deleted.")} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </>
      ) : (
        <>
          <PageHeading title="Expenses & Payroll" subtitle="Record outgoing payments so cash flow and net figures stay accurate." />
          <Card
            title={`Expense Ledger (${expenses.rows.length})`}
            action={
              <button
                onClick={() => downloadCsv("expenses.csv", expenses.rows, [
                  { key: "expense_date", label: "Date" }, { key: "category", label: "Category" },
                  { key: "description", label: "Description" }, { key: "amount", label: "Amount" },
                ])}
                className="flex items-center gap-2 text-blue-600 font-bold text-sm hover:bg-blue-50 px-4 py-2 rounded-xl"
              >
                <Download size={16} /> Export CSV
              </button>
            }
          >
            {expenses.loading ? (
              <Loading />
            ) : (
              <Table headers={["Date", "Category", "Description", "Amount", "Actions"]} empty={expenses.rows.length === 0 && "No expenses recorded yet."}>
                {expenses.rows.filter((x) => matches(search, x.category, x.description)).map((x) => (
                  <tr key={x.id}>
                    <td className="px-6 py-4 text-slate-500">{fmtDate(x.expense_date)}</td>
                    <td className="px-6 py-4"><Badge color="purple">{x.category}</Badge></td>
                    <td className="px-6 py-4 font-semibold text-slate-700">{x.description}</td>
                    <td className="px-6 py-4 font-black text-slate-800">{money(x.amount)}</td>
                    <td className="px-6 py-4 text-right">
                      <IconButton icon={Trash2} title="Delete" danger onClick={() => confirmAction("Delete this expense?") && expenses.remove(x.id, "Expense deleted.")} />
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </>
      )}
    </ModuleShell>
  );
}
