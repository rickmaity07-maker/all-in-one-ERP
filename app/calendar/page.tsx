"use client";

import { useState, useEffect } from "react";
import { Plus, ChevronLeft, ChevronRight, MapPin, Video, Wrench, Utensils, Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function CalendarPortal() {
  const [filters, setFilters] = useState({ lecture: true, exam: true, lab: true, pto: true });
  const [monthOffset, setMonthOffset] = useState(0);

  // LIVE DATABASE STATE
  const [events, setEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // MODAL STATE
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventDate, setNewEventDate] = useState("");
  const [newEventType, setNewEventType] = useState("lecture");

  useEffect(() => {
    loadEvents();
  }, []);

  async function loadEvents() {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*');
    if (!error && data) {
      setEvents(data);
    }
    setIsLoading(false);
  }

  // CREATE EVENT
  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim() || !newEventDate) return;

    setIsSubmitting(true);
    const { data, error } = await supabase
      .from('calendar_events')
      .insert([{ 
        event_title: newEventTitle, 
        event_date: newEventDate, 
        event_type: newEventType,
        location: 'TBD'
      }])
      .select();

    if (!error && data) {
      setEvents([...events, data[0]]);
      setNewEventTitle("");
      setNewEventDate("");
      setIsModalOpen(false);
    }
    setIsSubmitting(false);
  };

  const toggleFilter = (key: keyof typeof filters) => {
    setFilters(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Current view calculation
  const currentDate = new Date();
  const viewYear = currentDate.getFullYear();
  const viewMonth = currentDate.getMonth() + monthOffset;
  const displayDate = new Date(viewYear, viewMonth, 1);
  
  const getMonthName = () => {
    return displayDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  const getEventStyle = (type: string) => {
    switch (type) {
      case 'lab': return 'bg-blue-500';
      case 'exam': return 'bg-pink-500';
      case 'pto': return 'bg-emerald-500';
      default: return 'bg-orange-500'; // lecture
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden relative">

      {/* NEW EVENT MODAL */}
      {isModalOpen && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-3xl p-8 w-[400px] shadow-2xl border border-slate-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800">Book Schedule Slot</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700"><X size={20}/></button>
            </div>
            
            <form onSubmit={handleAddEvent} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Event Title</label>
                <input 
                  type="text" 
                  required
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. Mechatronics Lab 2"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Date</label>
                <input 
                  type="date" 
                  required
                  value={newEventDate}
                  onChange={(e) => setNewEventDate(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Event Type</label>
                <select 
                  value={newEventType}
                  onChange={(e) => setNewEventType(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none cursor-pointer"
                >
                  <option value="lecture">Live Lecture</option>
                  <option value="exam">Exam Deadline</option>
                  <option value="lab">Lab Booking</option>
                  <option value="pto">Staff PTO / Event</option>
                </select>
              </div>
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full mt-4 flex items-center justify-center gap-2 bg-indigo-600 text-white py-3.5 rounded-xl text-sm font-bold shadow-md hover:bg-indigo-700 transition-colors disabled:opacity-70"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : "Save to Calendar"}
              </button>
            </form>
          </div>
        </div>
      )}

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
            <div className="flex items-center bg-white rounded-2xl shadow-sm border border-slate-100 p-1">
              <button onClick={() => setMonthOffset(p => p - 1)} className="p-2 hover:bg-slate-50 rounded-xl transition-colors"><ChevronLeft size={18} /></button>
              <button onClick={() => setMonthOffset(p => p + 1)} className="p-2 hover:bg-slate-50 rounded-xl transition-colors"><ChevronRight size={18} /></button>
            </div>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-2xl text-sm font-bold hover:scale-105 transition-all"
          >
            <Plus size={18} /> Book Slot
          </button>
        </header>

        <div className="px-10 pb-10 flex-1 flex flex-col">
          <div className="bg-white rounded-4xl p-6 shadow-[0_8px_24px_rgba(0,0,0,0.02)] border border-slate-100 flex-1 flex flex-col relative">
            
            {isLoading && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-20 flex items-center justify-center rounded-4xl">
                <div className="flex items-center gap-3 text-slate-500 font-bold"><Loader2 className="animate-spin" /> Syncing calendar...</div>
              </div>
            )}

            <div className="grid grid-cols-7 gap-4 flex-1 auto-rows-fr">
              {Array.from({ length: 35 }).map((_, i) => {
                const dayNum = i - 2; 
                const isCurrentMonth = dayNum > 0 && dayNum <= 31;
                
                // Find events matching the exact YYYY-MM-DD for this cell
                const cellDateStr = `${displayDate.getFullYear()}-${String(displayDate.getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                
                const dayEvents = events.filter(e => e.event_date === cellDateStr && filters[e.event_type as keyof typeof filters]);

                return (
                  <div key={i} className={`min-h-[90px] p-2.5 rounded-2xl border transition-all flex flex-col ${isCurrentMonth ? "border-slate-100 bg-slate-50/30" : "border-transparent opacity-30"}`}>
                    <span className="text-xs font-bold text-slate-700 mb-2">{isCurrentMonth ? dayNum : ""}</span>
                    <div className="space-y-1">
                      {dayEvents.map((evt, idx) => (
                        <div key={idx} className={`text-[10px] font-bold px-2 py-1.5 rounded-lg text-white shadow-sm truncate cursor-pointer hover:opacity-80 ${getEventStyle(evt.event_type)}`}>
                          {evt.event_title}
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
    </div>
  );
}