import { Search, Plus, Bell, Download, ArrowUpRight, ArrowDownLeft, DollarSign, CreditCard, Receipt, MoreVertical } from "lucide-react";

export default function FinancePortal() {
  return (
    <>
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
                <button className="w-full text-left px-4 py-3 text-sm font-bold rounded-2xl bg-linear-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-[0_4px_12px_rgba(59,130,246,0.1)]">
                  Overview & Cash Flow
                </button>
              </li>
              <li>
                <button className="w-full text-left px-4 py-3 text-sm font-semibold rounded-2xl text-slate-500 hover:bg-slate-50 transition-all">
                  Student Tuition Invoices
                </button>
              </li>
              <li>
                <button className="w-full text-left px-4 py-3 text-sm font-semibold rounded-2xl text-slate-500 hover:bg-slate-50 transition-all">
                  Staff Payroll Records
                </button>
              </li>
            </ul>
          </div>
        </div>
      </aside>

      {/* MAIN FINANCE WORKSPACE */}
      <main className="flex-1 bg-[#F4F7FE] flex flex-col min-w-0 overflow-y-auto">
        
        {/* Header */}
        <header className="h-24 flex items-center justify-between px-10 shrink-0">
          <div className="relative w-96 shadow-[0_4px_20px_rgba(0,0,0,0.03)] rounded-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search invoices, transactions, IDs..." 
              className="w-full pl-12 pr-4 py-3.5 bg-white border-none rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
            />
          </div>
          <div className="flex items-center gap-6">
            <button className="relative p-2 text-slate-400 hover:text-blue-500 transition-colors">
              <Bell size={22} />
            </button>
            <button className="flex items-center gap-2 bg-linear-to-r from-blue-600 to-indigo-600 text-white px-6 py-3.5 rounded-2xl text-sm font-bold shadow-[0_8px_16px_rgba(79,70,229,0.3)] hover:scale-105 transition-all">
              <Plus size={18} /> Generate Invoice
            </button>
          </div>
        </header>

        <div className="px-10 pb-10">
          
          {/* MASSIVE VIBRANT WIDGETS */}
          <div className="grid grid-cols-3 gap-8 mb-10 mt-4">
            
            <div className="bg-linear-to-br from-cyan-400 to-blue-600 rounded-4xl p-8 text-white shadow-[0_16px_32px_rgba(37,99,235,0.3)] relative overflow-hidden group">
              <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
              <p className="text-cyan-100 font-semibold tracking-wide text-sm mb-2 uppercase">Total Revenue (YTD)</p>
              <h3 className="text-4xl font-black mb-6">$124,500<span className="text-xl font-bold text-cyan-200">.00</span></h3>
              <div className="flex items-center gap-2 text-sm font-medium bg-black/10 w-fit px-3 py-1.5 rounded-xl backdrop-blur-md">
                <ArrowUpRight size={16} className="text-cyan-200" /> +14.2% vs last term
              </div>
            </div>

            <div className="bg-linear-to-br from-pink-500 to-orange-400 rounded-4xl p-8 text-white shadow-[0_16px_32px_rgba(236,72,153,0.3)] relative overflow-hidden group">
              <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
              <p className="text-pink-100 font-semibold tracking-wide text-sm mb-2 uppercase">Outstanding Tuition</p>
              <h3 className="text-4xl font-black mb-6">$12,380<span className="text-xl font-bold text-pink-200">.00</span></h3>
              <div className="flex items-center gap-2 text-sm font-medium bg-black/10 w-fit px-3 py-1.5 rounded-xl backdrop-blur-md">
                <ArrowDownLeft size={16} className="text-pink-200" /> 18 pending invoices
              </div>
            </div>

            <div className="bg-linear-to-br from-[#8A2387] to-[#E94057] rounded-4xl p-8 text-white shadow-[0_16px_32px_rgba(233,64,87,0.3)] relative overflow-hidden group">
              <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
              <p className="text-white/80 font-semibold tracking-wide text-sm mb-2 uppercase">Next Payroll Run</p>
              <h3 className="text-4xl font-black mb-6">$42,900<span className="text-xl font-bold text-white/80">.00</span></h3>
              <div className="flex items-center gap-2 text-sm font-medium bg-black/10 w-fit px-3 py-1.5 rounded-xl backdrop-blur-md">
                <Receipt size={16} /> Due in 5 days
              </div>
            </div>

          </div>

          {/* RECENT TRANSACTIONS TABLE */}
          <div className="bg-white rounded-4xl p-8 shadow-[0_8px_24px_rgba(0,0,0,0.02)] border border-slate-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800">Recent Invoices</h3>
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
                    <th className="px-6 py-4 font-bold text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-700">#INV-2026-084</td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-800">Marcus Chen</div>
                      <div className="text-slate-400 text-xs">Term 2 Tuition Fee</div>
                    </td>
                    <td className="px-6 py-4 font-black text-slate-800">$1,450.00</td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 rounded-xl text-xs font-bold bg-emerald-100 text-emerald-700 uppercase">Paid</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="p-2 text-slate-400 hover:text-blue-600 transition-colors"><Download size={16} /></button>
                    </td>
                  </tr>

                  <tr className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-700">#INV-2026-085</td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-800">Sarah Jenkins</div>
                      <div className="text-slate-400 text-xs">Faculty Lab Supplies</div>
                    </td>
                    <td className="px-6 py-4 font-black text-slate-800">$320.50</td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 rounded-xl text-xs font-bold bg-orange-100 text-orange-700 uppercase">Pending</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="p-2 text-slate-400 hover:text-blue-600 transition-colors"><Download size={16} /></button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </main>
    </>
  );
}