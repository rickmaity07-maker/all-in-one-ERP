"use client";

import { useState, useEffect } from "react";
import { Search, ClipboardCheck, AlertTriangle, CheckCircle2, Clock, MapPin, ShieldAlert, FileText } from "lucide-react";

export default function ExamsPortal() {
  const [userRole, setUserRole] = useState<string>("student");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setUserRole(localStorage.getItem("erp_mock_role") || "student");
  }, []);

  if (!mounted) return null;

  return (
    <>
      <aside className="w-72 bg-white/80 backdrop-blur-xl border-r border-slate-100 flex flex-col shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="h-20 flex items-center px-8 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <ClipboardCheck size={24} className="text-blue-600"/> Examinations
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">Testing Center</h3>
            <ul className="space-y-2">
              <li>
                <button className="w-full text-left px-4 py-3 text-sm font-bold rounded-2xl bg-linear-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-sm">
                  {userRole === "student" ? "My Exam Schedule" : "Global Exam Schedule"}
                </button>
              </li>
              {["teacher", "administration", "owner"].includes(userRole) && (
                <li>
                  <button className="w-full text-left px-4 py-3 text-sm font-semibold rounded-2xl text-slate-500 hover:bg-slate-50 transition-all">
                    Plagiarism & Integrity Alerts
                  </button>
                </li>
              )}
            </ul>
          </div>
        </div>
      </aside>

      <main className="flex-1 bg-[#F4F7FE] flex flex-col min-w-0 overflow-y-auto">
        <header className="h-24 flex items-center justify-between px-10 shrink-0">
          <div className="relative w-96 shadow-[0_4px_20px_rgba(0,0,0,0.03)] rounded-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type="text" placeholder="Search courses or exam IDs..." className="w-full pl-12 pr-4 py-3.5 bg-white border-none rounded-2xl text-sm outline-none font-medium" />
          </div>
        </header>

        <div className="px-10 pb-10">
          <div className="flex justify-between items-end mb-6 mt-2">
            <div>
              <h1 className="text-3xl font-black text-slate-800 mb-2">Academic Assessment</h1>
              <p className="text-slate-500 font-medium">Manage upcoming exams, seating allocations, and integrity reports.</p>
            </div>
          </div>

          {/* STUDENT VIEW */}
          {userRole === "student" && (
            <div className="grid grid-cols-2 gap-8">
              <div className="bg-white rounded-4xl p-8 shadow-sm border border-slate-100">
                <h3 className="text-xl font-bold text-slate-800 mb-6">Upcoming Exams</h3>
                <div className="space-y-4">
                  <div className="p-5 rounded-2xl border border-blue-100 bg-blue-50/30 relative overflow-hidden group cursor-pointer hover:border-blue-300 transition-all">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-xl group-hover:scale-150 transition-transform"></div>
                    <div className="flex justify-between items-start mb-4 relative z-10">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-100 px-2 py-1 rounded-lg">MEC-401</span>
                        <h4 className="font-bold text-slate-800 text-lg mt-1">Advanced Kinematics Final</h4>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-800">Aug 28</p>
                        <p className="text-xs font-semibold text-slate-500">09:00 AM</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm font-medium text-slate-600 relative z-10">
                      <span className="flex items-center gap-1.5"><MapPin size={16} className="text-blue-500"/> Hall A, Seat 42</span>
                      <span className="flex items-center gap-1.5"><Clock size={16} className="text-blue-500"/> 120 Mins</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TEACHER / ADMIN VIEW */}
          {["teacher", "administration", "owner"].includes(userRole) && (
            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2 bg-white rounded-4xl p-8 shadow-sm border border-slate-100">
                <h3 className="text-xl font-bold text-slate-800 mb-6">Grading Queue & Active Exams</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-5 rounded-2xl border border-slate-100 bg-slate-50">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-orange-100 text-orange-500 flex items-center justify-center">
                        <FileText size={24} />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-base mb-1">C++ Embedded Systems Midterm</h4>
                        <p className="text-xs font-medium text-slate-500">45 submissions pending review</p>
                      </div>
                    </div>
                    <button className="text-sm font-bold text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-xl transition-colors">Grade Now</button>
                  </div>
                </div>
              </div>

              <div className="col-span-1 bg-linear-to-br from-[#8A2387] to-[#E94057] rounded-4xl p-8 text-white shadow-lg relative overflow-hidden">
                <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                <h3 className="text-lg font-bold text-white/90 mb-6 flex items-center gap-2"><ShieldAlert size={20}/> Integrity Alerts</h3>
                <div className="bg-black/20 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-red-200">High Match</span>
                    <span className="text-xs font-bold bg-red-500 text-white px-2 py-0.5 rounded-md">84%</span>
                  </div>
                  <p className="text-sm font-bold text-white mb-1">Final Essay Submission</p>
                  <p className="text-xs text-white/70">Student ID: 102948</p>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </>
  );
}