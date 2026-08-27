"use client";

import { useState, useEffect } from "react";
import { Search, GraduationCap, FileText, Download, Award, CheckCircle2, Clock } from "lucide-react";

export default function RegistrarPortal() {
  const [userRole, setUserRole] = useState<string>("student");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedRole = localStorage.getItem("erp_mock_role") || "student";
    setUserRole(savedRole);
  }, []);

  if (!mounted) return null;

  return (
    <>
      <aside className="w-72 bg-white/80 backdrop-blur-xl border-r border-slate-100 flex flex-col shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="h-20 flex items-center px-8 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <GraduationCap size={24} className="text-indigo-600"/> Registrar
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">Records</h3>
            <ul className="space-y-2">
              <li>
                <button className="w-full text-left px-4 py-3 text-sm font-bold rounded-2xl bg-linear-to-r from-purple-50 to-indigo-50 text-indigo-700 shadow-[0_4px_12px_rgba(99,102,241,0.1)]">
                  {userRole === "student" ? "My Degree Audit" : "Global Student Directory"}
                </button>
              </li>
              <li>
                <button className="w-full text-left px-4 py-3 text-sm font-semibold rounded-2xl text-slate-500 hover:bg-slate-50 transition-all">
                  {userRole === "student" ? "Request Official Transcript" : "Academic Probation"}
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
            <input 
              type="text" 
              placeholder={userRole === "student" ? "Search courses..." : "Search student ID or name..."}
              className="w-full pl-12 pr-4 py-3.5 bg-white border-none rounded-2xl text-sm outline-none font-medium"
            />
          </div>
          {["owner", "administration"].includes(userRole) && (
            <button className="flex items-center gap-2 bg-linear-to-r from-blue-600 to-indigo-600 text-white px-6 py-3.5 rounded-2xl text-sm font-bold shadow-md hover:scale-105 transition-all">
              Generate Report
            </button>
          )}
        </header>

        <div className="px-10 pb-10">
          
          {/* STUDENT SPECIFIC VIEW */}
          {userRole === "student" && (
            <div className="space-y-8">
              <div className="bg-linear-to-br from-[#2A0845] to-[#6441A5] rounded-4xl p-8 text-white shadow-lg relative overflow-hidden flex justify-between items-center">
                <div className="absolute right-0 top-0 w-64 h-64 bg-cyan-500/20 rounded-full blur-3xl"></div>
                <div className="relative z-10">
                  <h1 className="text-3xl font-black mb-2">Rick Maity</h1>
                  <p className="text-white/80 font-medium flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span> B.Eng. Mechatronics • Active
                  </p>
                </div>
                <div className="relative z-10 text-right bg-black/20 p-4 rounded-2xl backdrop-blur-md">
                  <p className="text-xs uppercase tracking-wider text-white/70 font-bold mb-1">Current GPA</p>
                  <p className="text-4xl font-black text-cyan-300">3.8<span className="text-lg text-white/50">/4.0</span></p>
                </div>
              </div>

              <div className="bg-white rounded-4xl p-8 shadow-sm border border-slate-100">
                <h3 className="text-xl font-bold text-slate-800 mb-6">Degree Progress (120/180 Credits)</h3>
                <div className="w-full bg-slate-100 rounded-full h-4 mb-8 overflow-hidden">
                  <div className="bg-linear-to-r from-cyan-400 to-blue-500 h-4 rounded-full w-[66%]"></div>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-5 rounded-2xl border border-slate-100 bg-slate-50/50">
                    <div>
                      <h4 className="font-bold text-slate-800">Advanced Kinematics & SCARA Simulation</h4>
                      <p className="text-xs font-medium text-slate-500">MEC-401 • Fall 2026</p>
                    </div>
                    <span className="px-3 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-700 uppercase">Enrolled</span>
                  </div>
                  <div className="flex items-center justify-between p-5 rounded-2xl border border-slate-100 bg-white">
                    <div>
                      <h4 className="font-bold text-slate-800">C++ Microcontroller Integration</h4>
                      <p className="text-xs font-medium text-slate-500">CS-305 • Spring 2026</p>
                    </div>
                    <span className="flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-700">
                      <CheckCircle2 size={14}/> Grade: A
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ADMIN SPECIFIC VIEW */}
          {["owner", "administration", "teacher"].includes(userRole) && (
            <div className="bg-white rounded-4xl p-8 shadow-sm border border-slate-100">
              <h3 className="text-xl font-bold text-slate-800 mb-6">Global Enrollment Directory</h3>
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/50 text-slate-500 border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-4 font-bold">Student Name</th>
                    <th className="px-6 py-4 font-bold">Major / Program</th>
                    <th className="px-6 py-4 font-bold">Credits</th>
                    <th className="px-6 py-4 font-bold">Status</th>
                    <th className="px-6 py-4 font-bold text-right">Transcript</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-800">Rick Maity</td>
                    <td className="px-6 py-4 text-slate-600">B.Eng. Mechatronics</td>
                    <td className="px-6 py-4 text-slate-600">120 / 180</td>
                    <td className="px-6 py-4"><span className="px-3 py-1 rounded-xl text-xs font-bold bg-emerald-100 text-emerald-700">Active</span></td>
                    <td className="px-6 py-4 text-right"><button className="text-slate-400 hover:text-blue-600"><Download size={18} /></button></td>
                  </tr>
                  <tr className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-800">David Kim</td>
                    <td className="px-6 py-4 text-slate-600">B.S. Computer Science</td>
                    <td className="px-6 py-4 text-slate-600">45 / 120</td>
                    <td className="px-6 py-4"><span className="px-3 py-1 rounded-xl text-xs font-bold bg-orange-100 text-orange-700">Probation</span></td>
                    <td className="px-6 py-4 text-right"><button className="text-slate-400 hover:text-blue-600"><Download size={18} /></button></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

        </div>
      </main>
    </>
  );
}