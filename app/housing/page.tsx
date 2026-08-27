"use client";

import { useState, useEffect } from "react";
import { Search, Building, Wrench, Utensils, MapPin, CreditCard, Plus, AlertCircle } from "lucide-react";

export default function HousingPortal() {
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
            <Building size={24} className="text-blue-600"/> Facilities
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">Services</h3>
            <ul className="space-y-2">
              <li>
                <button className="w-full text-left px-4 py-3 text-sm font-bold rounded-2xl bg-linear-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-sm">
                  {userRole === "student" ? "My Accommodations" : "Campus Overview"}
                </button>
              </li>
              <li>
                <button className="w-full text-left px-4 py-3 text-sm font-semibold rounded-2xl text-slate-500 hover:bg-slate-50 transition-all">
                  Maintenance Tickets
                </button>
              </li>
              <li>
                <button className="w-full text-left px-4 py-3 text-sm font-semibold rounded-2xl text-slate-500 hover:bg-slate-50 transition-all">
                  {userRole === "student" ? "Meal Plan Balance" : "Facility Booking"}
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
            <input type="text" placeholder="Search facilities, tickets, or rooms..." className="w-full pl-12 pr-4 py-3.5 bg-white border-none rounded-2xl text-sm outline-none font-medium" />
          </div>
          <button className="flex items-center gap-2 bg-linear-to-r from-blue-600 to-indigo-600 text-white px-6 py-3.5 rounded-2xl text-sm font-bold shadow-md hover:scale-105 transition-all">
            <Plus size={18} /> {userRole === "student" ? "New Ticket" : "Book Facility"}
          </button>
        </header>

        <div className="px-10 pb-10">
          <div className="flex justify-between items-end mb-6 mt-2">
            <div>
              <h1 className="text-3xl font-black text-slate-800 mb-2">Campus Infrastructure</h1>
              <p className="text-slate-500 font-medium">Manage living arrangements, facility bookings, and maintenance operations.</p>
            </div>
          </div>

          {/* STUDENT VIEW */}
          {userRole === "student" && (
            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2 bg-white rounded-4xl p-8 shadow-sm border border-slate-100">
                <div className="flex items-start justify-between mb-8">
                  <div>
                    <h3 className="text-xl font-bold text-slate-800 mb-1">Residential Assignment</h3>
                    <p className="text-sm font-medium text-slate-500 flex items-center gap-1.5"><MapPin size={16}/> THWS Campus-1 Dorms</p>
                  </div>
                  <span className="px-3 py-1 rounded-xl text-xs font-bold bg-emerald-100 text-emerald-700 uppercase">Checked In</span>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Building & Room</p>
                    <p className="text-lg font-black text-slate-800">Block B, Room 402</p>
                  </div>
                  <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Term</p>
                    <p className="text-lg font-black text-slate-800">Fall 2026 - Spring 2027</p>
                  </div>
                </div>
              </div>

              <div className="col-span-1 bg-linear-to-br from-orange-400 to-pink-500 rounded-4xl p-8 text-white shadow-lg relative overflow-hidden flex flex-col justify-between">
                <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                <div>
                  <h3 className="text-lg font-bold text-white/90 mb-1 flex items-center gap-2"><Utensils size={20}/> Meal Plan Balance</h3>
                  <p className="text-sm font-medium text-white/70 mb-6">Platinum Tier</p>
                </div>
                <div>
                  <h4 className="text-5xl font-black mb-2">$150<span className="text-2xl text-white/70">.00</span></h4>
                  <button className="w-full bg-white/20 hover:bg-white/30 backdrop-blur-md text-white py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2">
                    <CreditCard size={16}/> Top Up Balance
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ADMIN & TEACHER VIEW */}
          {["teacher", "administration", "owner"].includes(userRole) && (
            <div className="grid grid-cols-3 gap-6">
              <div className="bg-linear-to-br from-cyan-400 to-blue-600 rounded-4xl p-8 text-white shadow-lg relative overflow-hidden">
                <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                <p className="text-cyan-100 font-semibold tracking-wide text-sm mb-2 uppercase">Dormitory Occupancy</p>
                <h3 className="text-5xl font-black mb-6">94<span className="text-2xl font-bold text-cyan-200">%</span></h3>
                <div className="w-full bg-black/20 rounded-full h-2 backdrop-blur-md">
                  <div className="bg-white h-2 rounded-full w-[94%]"></div>
                </div>
              </div>

              <div className="col-span-2 bg-white rounded-4xl p-8 shadow-sm border border-slate-100">
                <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2"><Wrench size={20} className="text-orange-500"/> Active Maintenance Queue</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-5 rounded-2xl border border-slate-100 bg-slate-50">
                    <div>
                      <h4 className="font-bold text-slate-800 text-base mb-1">HVAC Malfunction</h4>
                      <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5"><MapPin size={14}/> THWS Campus-1, Lab 3 (3D Printer Lab)</p>
                    </div>
                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-red-100 text-red-700 uppercase">
                      <AlertCircle size={14}/> High Priority
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </>
  );
}