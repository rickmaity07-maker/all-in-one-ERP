"use client";

import { useState, useEffect } from "react";
import { Search, Users, ShieldAlert, CheckCircle, Clock } from "lucide-react";

export default function AdmissionsPortal() {
  const [userRole, setUserRole] = useState<string>("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setUserRole(localStorage.getItem("erp_mock_role") || "student");
  }, []);

  if (!mounted) return null;

  // STRICT RBAC BLOCK
  if (userRole === "student" || userRole === "teacher") {
    return (
      <div className="flex-1 bg-[#F4F7FE] flex flex-col items-center justify-center">
        <ShieldAlert size={64} className="text-pink-500 mb-4" />
        <h1 className="text-2xl font-black text-slate-800">Access Restricted</h1>
        <p className="text-slate-500">Only Administration and Owners can view the Admissions CRM.</p>
      </div>
    );
  }

  return (
    <>
      <aside className="w-72 bg-white/80 backdrop-blur-xl border-r border-slate-100 flex flex-col shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="h-20 flex items-center px-8 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <Users size={24} className="text-blue-600"/> Admissions
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">Pipeline</h3>
            <ul className="space-y-2">
              <li>
                <button className="w-full text-left px-4 py-3 text-sm font-bold rounded-2xl bg-linear-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-sm">
                  Active Applicants
                </button>
              </li>
              <li>
                <button className="w-full text-left px-4 py-3 text-sm font-semibold rounded-2xl text-slate-500 hover:bg-slate-50 transition-all">
                  Document Verification
                </button>
              </li>
            </ul>
          </div>
        </div>
      </aside>

      <main className="flex-1 bg-[#F4F7FE] flex flex-col min-w-0 overflow-y-auto">
        <header className="h-24 flex items-center justify-between px-10 shrink-0">
          <div className="relative w-96 shadow-[0_4px_20px_rgba(0,0,0,0.03)] rounded-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type="text" placeholder="Search applicant names or IDs..." className="w-full pl-12 pr-4 py-3.5 bg-white border-none rounded-2xl text-sm outline-none font-medium" />
          </div>
        </header>

        <div className="px-10 pb-10">
          <div className="flex justify-between items-end mb-6 mt-2">
            <div>
              <h1 className="text-3xl font-black text-slate-800 mb-2">Applicant Pipeline (Fall 2026)</h1>
              <p className="text-slate-500 font-medium">Review pending applications and verify submitted documents.</p>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-6">
            
            {/* KANBAN COLUMN 1 */}
            <div className="bg-slate-100/50 rounded-4xl p-6 border border-slate-200">
              <h3 className="font-bold text-slate-700 mb-4 flex items-center justify-between">
                Under Review <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-lg text-xs">2</span>
              </h3>
              <div className="space-y-3">
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 cursor-pointer hover:border-blue-300">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-orange-600 mb-2">B.Eng. Mechanical</div>
                  <h4 className="font-bold text-slate-800 text-sm mb-1">Lukas Weber</h4>
                  <p className="text-xs text-slate-500 flex items-center gap-1"><Clock size={12}/> Applied 2 days ago</p>
                </div>
              </div>
            </div>

            {/* KANBAN COLUMN 2 */}
            <div className="bg-slate-100/50 rounded-4xl p-6 border border-slate-200">
              <h3 className="font-bold text-slate-700 mb-4 flex items-center justify-between">
                Awaiting Documents <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-lg text-xs">1</span>
              </h3>
              <div className="space-y-3">
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 cursor-pointer hover:border-orange-300">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-pink-600 mb-2">M.Sc. Mechatronics</div>
                  <h4 className="font-bold text-slate-800 text-sm mb-1">Elena Schmidt</h4>
                  <p className="text-xs text-red-500 font-medium">Missing Visa Documentation</p>
                </div>
              </div>
            </div>

            {/* KANBAN COLUMN 3 */}
            <div className="bg-slate-100/50 rounded-4xl p-6 border border-slate-200">
              <h3 className="font-bold text-slate-700 mb-4 flex items-center justify-between">
                Approved <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-lg text-xs">24</span>
              </h3>
              <div className="space-y-3">
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-emerald-200 opacity-70">
                  <h4 className="font-bold text-slate-800 text-sm mb-1 flex items-center gap-2"><CheckCircle size={16} className="text-emerald-500"/> Tobias Müller</h4>
                  <p className="text-xs text-slate-500">Transferred to Registrar</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>
    </>
  );
}