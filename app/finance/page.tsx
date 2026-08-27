"use client";

import { useState, useEffect } from "react";
import { Search, Plus, Bell, Download, ArrowUpRight, ArrowDownLeft, Receipt, CreditCard, Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function FinancePortal() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "invoices">("overview");
  
  // LIVE DATABASE STATE
  const [invoices, setInvoices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // MODAL STATE
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newStudent, setNewStudent] = useState("");
  const [newDesc, setNewDesc] = useState("Term 1 Tuition Fee");
  const [newAmount, setNewAmount] = useState("");

  useEffect(() => {
    setMounted(true);
    loadInvoices();
  }, []);

  async function loadInvoices() {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setInvoices(data);
    }
    setIsLoading(false);
  }

  const handleGenerateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudent.trim() || !newAmount) return;

    setIsSubmitting(true);
    const { data, error } = await supabase
      .from('invoices')
      .insert([{ 
        student_name: newStudent, 
        description: newDesc, 
        amount: parseFloat(newAmount),
        status: 'Pending' 
      }])
      .select();

    if (!error && data) {
      setInvoices([data[0], ...invoices]);
      setNewStudent("");
      setNewAmount("");
      setIsModalOpen(false);
      setActiveTab("invoices"); // Jump to invoices tab to see the new record!
    }
    setIsSubmitting(false);
  };

  const handleMarkPaid = async (id: string) => {
    setInvoices(invoices.map(inv => inv.id === id ? { ...inv, status: 'Paid' } : inv));
    await supabase.from('invoices').update({ status: 'Paid' }).eq('id', id);
  };

  if (!mounted) return null;

  // Calculate dynamic outstanding tuition
  const outstandingTotal = invoices
    .filter(inv => inv.status === 'Pending')
    .reduce((sum, inv) => sum + Number(inv.amount), 0);

  return (
    <div className="flex h-screen w-full overflow-hidden relative">

      {/* GENERATE INVOICE MODAL */}
      {isModalOpen && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-3xl p-8 w-[400px] shadow-2xl border border-slate-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800">Generate Invoice</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700"><X size={20}/></button>
            </div>
            
            <form onSubmit={handleGenerateInvoice} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Recipient (Student Name)</label>
                <input 
                  type="text" 
                  required
                  value={newStudent}
                  onChange={(e) => setNewStudent(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. Marcus Chen"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Description</label>
                <input 
                  type="text" 
                  required
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Amount ($)</label>
                <input 
                  type="number"
                  step="0.01" 
                  required
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none"
                  placeholder="e.g. 1450.00"
                />
              </div>
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full mt-4 flex items-center justify-center gap-2 bg-blue-600 text-white py-3.5 rounded-xl text-sm font-bold shadow-md hover:bg-blue-700 transition-colors disabled:opacity-70"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : "Issue Invoice"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* CONTEXTUAL SIDEBAR */}
      <aside className="w-72 bg-white/80 backdrop-blur-xl border-r border-slate-100 flex flex-col shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="h-20 flex items-center px-8 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <CreditCard size={22} className="text-blue-600"/> Billing & Finance
          </h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">Financial Views</h3>
            <ul className="space-y-2">
              <li>
                <button 
                  onClick={() => setActiveTab("overview")}
                  className={`w-full text-left px-4 py-3 text-sm font-bold rounded-2xl transition-all ${activeTab === "overview" ? "bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}
                >
                  Overview & Cash Flow
                </button>
              </li>
              <li>
                <button 
                  onClick={() => setActiveTab("invoices")}
                  className={`w-full text-left px-4 py-3 text-sm font-bold rounded-2xl transition-all ${activeTab === "invoices" ? "bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}
                >
                  Student Tuition Invoices
                </button>
              </li>
            </ul>
          </div>
        </div>
      </aside>

      {/* MAIN FINANCE WORKSPACE */}
      <main className="flex-1 bg-[#F4F7FE] flex flex-col min-w-0 overflow-y-auto">
        <header className="h-24 flex items-center justify-between px-10 shrink-0">
          <div className="relative w-96 shadow-[0_4px_20px_rgba(0,0,0,0.03)] rounded-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search invoices, transactions, IDs..." 
              className="w-full pl-12 pr-4 py-3.5 bg-white border-none rounded-2xl text-sm outline-none transition-all font-medium"
            />
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3.5 rounded-2xl text-sm font-bold shadow-md hover:scale-105 transition-all"
          >
            <Plus size={18} /> Generate Invoice
          </button>
        </header>

        <div className="px-10 pb-10">
          
          <div className="flex justify-between items-end mb-6 mt-2">
            <div>
              <h1 className="text-3xl font-black text-slate-800 mb-2">
                {activeTab === "overview" ? "Financial Dashboard" : "Tuition & Billing Accounts"}
              </h1>
              <p className="text-slate-500 font-medium">
                {activeTab === "overview" ? "High-level overview of revenue and outstanding balances." : "Manage student invoices, track payments, and export records."}
              </p>
            </div>
          </div>

          {activeTab === "overview" ? (
            // ==========================================
            // VIEW 1: OVERVIEW & CASH FLOW
            // ==========================================
            <>
              {/* MASSIVE VIBRANT WIDGETS */}
              <div className="grid grid-cols-3 gap-8 mb-10">
                <div className="bg-gradient-to-br from-cyan-400 to-blue-600 rounded-4xl p-8 text-white shadow-lg relative overflow-hidden group">
                  <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
                  <p className="text-cyan-100 font-semibold tracking-wide text-sm mb-2 uppercase">Total Revenue (YTD)</p>
                  <h3 className="text-4xl font-black mb-6">$124,500<span className="text-xl font-bold text-cyan-200">.00</span></h3>
                  <div className="flex items-center gap-2 text-sm font-medium bg-black/10 w-fit px-3 py-1.5 rounded-xl backdrop-blur-md">
                    <ArrowUpRight size={16} className="text-cyan-200" /> +14.2% vs last term
                  </div>
                </div>

                <div className="bg-gradient-to-br from-pink-500 to-orange-400 rounded-4xl p-8 text-white shadow-lg relative overflow-hidden group cursor-pointer" onClick={() => setActiveTab("invoices")}>
                  <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
                  <p className="text-pink-100 font-semibold tracking-wide text-sm mb-2 uppercase">Outstanding Tuition</p>
                  <h3 className="text-4xl font-black mb-6">${outstandingTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                  <div className="flex items-center gap-2 text-sm font-medium bg-black/10 w-fit px-3 py-1.5 rounded-xl backdrop-blur-md">
                    <ArrowDownLeft size={16} className="text-pink-200" /> Pending Collection &rarr;
                  </div>
                </div>

                <div className="bg-gradient-to-br from-[#8A2387] to-[#E94057] rounded-4xl p-8 text-white shadow-lg relative overflow-hidden group">
                  <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
                  <p className="text-white/80 font-semibold tracking-wide text-sm mb-2 uppercase">Next Payroll Run</p>
                  <h3 className="text-4xl font-black mb-6">$42,900<span className="text-xl font-bold text-white/80">.00</span></h3>
                  <div className="flex items-center gap-2 text-sm font-medium bg-black/10 w-fit px-3 py-1.5 rounded-xl backdrop-blur-md">
                    <Receipt size={16} /> Due in 5 days
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-4xl p-8 shadow-sm border border-slate-100 text-center py-16">
                <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <CreditCard size={32} />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Cash Flow Reporting</h3>
                <p className="text-slate-500 max-w-md mx-auto">Detailed financial charting and monthly cash flow visualizations will populate here during the end-of-month processing cycle.</p>
              </div>
            </>
          ) : (
            // ==========================================
            // VIEW 2: FULL INVOICE TABLE
            // ==========================================
            <div className="bg-white rounded-4xl p-8 shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-800">Invoice Registry ({invoices.length})</h3>
                <button className="flex items-center gap-2 text-blue-600 font-bold text-sm hover:bg-blue-50 px-4 py-2 rounded-xl transition-colors">
                  <Download size={16} /> Export CSV
                </button>
              </div>
              
              <div className="overflow-hidden rounded-2xl border border-slate-100">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50/50 text-slate-500 border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-4 font-bold">Invoice ID</th>
                      <th className="px-6 py-4 font-bold">Student / Recipient</th>
                      <th className="px-6 py-4 font-bold">Amount</th>
                      <th className="px-6 py-4 font-bold">Status</th>
                      <th className="px-6 py-4 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {isLoading ? (
                      <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500"><Loader2 className="animate-spin inline mr-2" /> Syncing...</td></tr>
                    ) : invoices.length === 0 ? (
                      <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400">No invoices generated yet.</td></tr>
                    ) : (
                      invoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-blue-50/30 transition-colors">
                          <td className="px-6 py-4 font-bold text-slate-400 text-xs uppercase">{inv.id.substring(0,8)}</td>
                          <td className="px-6 py-4">
                            <div className="font-bold text-slate-800">{inv.student_name}</div>
                            <div className="text-slate-500 text-xs mt-0.5">{inv.description}</div>
                          </td>
                          <td className="px-6 py-4 font-black text-slate-800">${Number(inv.amount).toFixed(2)}</td>
                          <td className="px-6 py-4">
                            <span className={`px-3 py-1 rounded-xl text-xs font-bold uppercase ${
                              inv.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'
                            }`}>
                              {inv.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right space-x-2">
                            {inv.status === 'Pending' && (
                              <button onClick={() => handleMarkPaid(inv.id)} className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors">Mark Paid</button>
                            )}
                            <button className="p-2 text-slate-400 hover:text-blue-600 transition-colors" title="Download Invoice"><Download size={16} /></button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}