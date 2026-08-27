"use client";

import { useState } from "react";
import { Plus, ChevronLeft, ChevronRight, MapPin, Video, Wrench, Utensils } from "lucide-react";

const MOCK_EVENTS = [
  { day: 5, type: "lab", title: "Mechatronics Lab 2", time: "14:00", icon: Wrench, color: "blue" },
  { day: 12, type: "exam", title: "CAD Architecture Review", time: "16:00", icon: Video, color: "pink" },
  { day: 18, type: "pto", title: "Diakonie Presentation", time: "10:00", icon: Utensils, color: "emerald" },
  { day: 26, type: "lecture", title: "LattePanda Ubuntu Config", time: "11:30", icon: MapPin, color: "orange" },
];

export default function CalendarPortal() {
  // STATE MANAGEMENT
  const [filters, setFilters] = useState({ lecture: true, exam: true, lab: true, pto: true });
  const [monthOffset, setMonthOffset] = useState(0);

  const toggleFilter = (key: keyof typeof filters) => {
    setFilters(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getMonthName = () => {
    const date = new Date(2026, 7 + monthOffset, 1);
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  return (
    <>
      <aside className="w-72 bg-white/80 backdrop-blur-xl border-r border-slate-100 flex flex-col shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="h-20 flex items-center justify-between px-8 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">Schedules</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">Filters</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={filters.lecture} onChange={() => toggleFilter('lecture')} className="w-4 h-4 accent-orange-500" />
                <span className="text-sm font-semibold text-slate-700">Live Lectures</span>
              </label>
              <label className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={filters.exam} onChange={() => toggleFilter('exam')} className="w-4 h-4 accent-pink-500" />
                <span className="text-sm font-semibold text-slate-700">Exam Deadlines</span>
              </label>
              <label className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={filters.lab} onChange={() => toggleFilter('lab')} className="w-4 h-4 accent-blue-600" />
                <span className="text-sm font-semibold text-slate-700">Lab Booking</span>
              </label>
              <label className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={filters.pto} onChange={() => toggleFilter('pto')} className="w-4 h-4 accent-emerald-500" />
                <span className="text-sm font-semibold text-slate-700">Staff PTO / Events</span>
              </label>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 bg-[#F4F7FE] flex flex-col min-w-0 overflow-y-auto">
        <header className="h-24 flex items-center justify-between px-10 shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-black text-slate-800">{getMonthName()}</h1>
            <div className="flex items-center bg-white rounded-2xl shadow-xs border border-slate-100 p-1">
              <button onClick={() => setMonthOffset(p => p - 1)} className="p-2 hover:bg-slate-50 rounded-xl transition-colors"><ChevronLeft size={18} /></button>
              <button onClick={() => setMonthOffset(p => p + 1)} className="p-2 hover:bg-slate-50 rounded-xl transition-colors"><ChevronRight size={18} /></button>
            </div>
          </div>
          <button className="flex items-center gap-2 bg-linear-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-2xl text-sm font-bold hover:scale-105 transition-all">
            <Plus size={18} /> Book Slot
          </button>
        </header>

        <div className="px-10 pb-10 flex-1 flex flex-col">
          <div className="bg-white rounded-4xl p-6 shadow-sm border border-slate-100 flex-1 flex flex-col">
            <div className="grid grid-cols-7 gap-4 flex-1 auto-rows-fr">
              {Array.from({ length: 35 }).map((_, i) => {
                const dayNum = i - 2; 
                const isCurrentMonth = dayNum > 0 && dayNum <= 31;
                // Only show events if we are on the current month offset (0) and filters are active
                const dayEvents = monthOffset === 0 ? MOCK_EVENTS.filter(e => e.day === dayNum && filters[e.type as keyof typeof filters]) : [];

                return (
                  <div key={i} className={`min-h-[90px] p-2.5 rounded-2xl border transition-all flex flex-col ${isCurrentMonth ? "border-slate-100 bg-slate-50/30" : "border-transparent opacity-30"}`}>
                    <span className="text-xs font-bold text-slate-700 mb-2">{isCurrentMonth ? dayNum : ""}</span>
                    <div className="space-y-1">
                      {dayEvents.map((evt, idx) => (
                        <div key={idx} className={`text-[10px] font-bold px-2 py-1 rounded-lg bg-${evt.color}-500 text-white shadow-xs truncate cursor-pointer hover:opacity-80`}>
                          {evt.time} - {evt.title}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}