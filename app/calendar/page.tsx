"use client";

import { useState } from "react";
import { Plus, ChevronLeft, ChevronRight, MapPin, Loader2, Clock, Trash2, CalendarDays } from "lucide-react";
import { useSession, isStaff } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import { Modal, Field, SubmitButton, inputClass, confirmAction } from "@/components/ui";
import { fmtDate, type Row } from "@/lib/utils";

const TYPES = {
  lecture: { label: "Live Lectures", color: "bg-orange-500", accent: "accent-orange-500" },
  exam: { label: "Exam Deadlines", color: "bg-pink-500", accent: "accent-pink-500" },
  lab: { label: "Lab Booking", color: "bg-blue-500", accent: "accent-blue-600" },
  meeting: { label: "Meetings & Counseling", color: "bg-purple-500", accent: "accent-purple-500" },
  pto: { label: "Staff PTO / Events", color: "bg-emerald-500", accent: "accent-emerald-500" },
} as const;
type EventType = keyof typeof TYPES;

const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CalendarPortal() {
  const { role, profile } = useSession();
  const canEdit = isStaff(role);
  const [filters, setFilters] = useState<Record<EventType, boolean>>({ lecture: true, exam: true, lab: true, meeting: true, pto: true });
  const [monthOffset, setMonthOffset] = useState(0);
  const events = useTable("calendar_events", { orderBy: "event_date", ascending: true });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ event_title: "", event_date: "", start_time: "", event_type: "lecture", location: "", description: "" });
  const [selected, setSelected] = useState<Row | null>(null);

  const openNew = (date = "") => {
    if (!canEdit) return;
    setForm({ event_title: "", event_date: date, start_time: "", event_type: "lecture", location: "", description: "" });
    setIsModalOpen(true);
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const row = await events.insert({ ...form, start_time: form.start_time || null, location: form.location || null, description: form.description || null }, "Event saved.");
    setBusy(false);
    if (row) setIsModalOpen(false);
  };

  const now = new Date();
  const displayDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const leading = (displayDate.getDay() + 6) % 7; // Monday-first grid
  const daysInMonth = new Date(displayDate.getFullYear(), displayDate.getMonth() + 1, 0).getDate();
  const cellCount = Math.ceil((leading + daysInMonth) / 7) * 7;
  const todayKey = toKey(now);

  const eventsOn = (key: string) =>
    events.rows
      .filter((e) => e.event_date === key && filters[(e.event_type as EventType) in TYPES ? (e.event_type as EventType) : "lecture"])
      .sort((a, b) => String(a.start_time ?? "").localeCompare(String(b.start_time ?? "")));
  const styleFor = (type: string) => (TYPES[type as EventType] ?? TYPES.lecture).color;
  const upcoming = events.rows.filter((e) => e.event_date >= todayKey).slice(0, 8);

  return (
    <div className="flex h-full w-full overflow-hidden relative">
      {isModalOpen && (
        <Modal title="Book Schedule Slot" icon={CalendarDays} onClose={() => setIsModalOpen(false)}>
          <form onSubmit={handleAddEvent} className="space-y-4">
            <Field label="Event Title"><input required className={inputClass} value={form.event_title} onChange={(e) => setForm({ ...form, event_title: e.target.value })} placeholder="e.g. Mechatronics Lab 2" /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Date"><input type="date" required className={inputClass} value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} /></Field>
              <Field label="Start Time"><input type="time" className={inputClass} value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></Field>
            </div>
            <Field label="Event Type">
              <select className={inputClass} value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value })}>
                {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </Field>
            <Field label="Location"><input className={inputClass} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Room A-101 or Zoom" /></Field>
            <Field label="Details"><textarea rows={2} className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <SubmitButton busy={busy}>Save to Calendar</SubmitButton>
          </form>
        </Modal>
      )}

      {selected && (
        <Modal title={selected.event_title} icon={CalendarDays} onClose={() => setSelected(null)}>
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-2 text-slate-600"><Clock size={16} className="text-slate-400" /> {fmtDate(selected.event_date)} {selected.start_time && `at ${selected.start_time}`}</p>
            <p className="flex items-center gap-2 text-slate-600"><MapPin size={16} className="text-slate-400" /> {selected.location || "No location"}</p>
            <p className="flex items-center gap-2"><span className={`w-3 h-3 rounded ${styleFor(selected.event_type)}`} /> {(TYPES[selected.event_type as EventType] ?? TYPES.lecture).label}</p>
            {selected.description && <p className="p-4 bg-slate-50 rounded-2xl text-slate-600 whitespace-pre-wrap">{selected.description}</p>}
            {(canEdit || selected.created_by === profile?.id) && (
              <button
                onClick={async () => {
                  if (confirmAction("Delete this event?") && (await events.remove(selected.id, "Event deleted."))) setSelected(null);
                }}
                className="mt-4 flex items-center gap-2 text-sm font-bold text-red-600 hover:text-red-700"
              >
                <Trash2 size={16} /> Delete event
              </button>
            )}
          </div>
        </Modal>
      )}

      <aside className="w-72 bg-white/80 backdrop-blur-xl border-r border-slate-100 flex flex-col shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="h-20 flex items-center justify-between px-8 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">Schedules</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">Filters</h3>
            <div className="space-y-3">
              {(Object.keys(TYPES) as EventType[]).map((k) => (
                <label key={k} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={filters[k]} onChange={() => setFilters((p) => ({ ...p, [k]: !p[k] }))} className={`w-4 h-4 ${TYPES[k].accent}`} />
                  <span className="text-sm font-semibold text-slate-700">{TYPES[k].label}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">Coming Up</h3>
            <div className="space-y-2">
              {upcoming.length === 0 ? (
                <p className="text-xs text-slate-400 px-2">Nothing scheduled.</p>
              ) : (
                upcoming.map((e) => (
                  <button key={e.id} onClick={() => setSelected(e)} className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50">
                    <p className="text-sm font-bold text-slate-700 truncate flex items-center gap-2"><span className={`w-2 h-2 rounded-full shrink-0 ${styleFor(e.event_type)}`} /> {e.event_title}</p>
                    <p className="text-xs text-slate-400 pl-4">{fmtDate(e.event_date)} {e.start_time ?? ""}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 bg-[#F4F7FE] flex flex-col min-w-0 overflow-y-auto">
        <header className="h-24 flex items-center justify-between px-10 shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-black text-slate-800">{displayDate.toLocaleString("default", { month: "long", year: "numeric" })}</h1>
            <div className="flex items-center bg-white rounded-2xl shadow-sm border border-slate-100 p-1">
              <button onClick={() => setMonthOffset((p) => p - 1)} className="p-2 hover:bg-slate-50 rounded-xl transition-colors"><ChevronLeft size={18} /></button>
              <button onClick={() => setMonthOffset(0)} className="px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded-xl">Today</button>
              <button onClick={() => setMonthOffset((p) => p + 1)} className="p-2 hover:bg-slate-50 rounded-xl transition-colors"><ChevronRight size={18} /></button>
            </div>
          </div>
          {canEdit && (
            <button onClick={() => openNew()} className="flex items-center gap-2 bg-linear-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-2xl text-sm font-bold hover:scale-105 transition-all">
              <Plus size={18} /> Book Slot
            </button>
          )}
        </header>

        <div className="px-10 pb-10 flex-1 flex flex-col">
          <div className="bg-white rounded-4xl p-6 shadow-[0_8px_24px_rgba(0,0,0,0.02)] border border-slate-100 flex-1 flex flex-col relative">
            {events.loading && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-20 flex items-center justify-center rounded-4xl">
                <div className="flex items-center gap-3 text-slate-500 font-bold"><Loader2 className="animate-spin" /> Syncing calendar...</div>
              </div>
            )}
            <div className="grid grid-cols-7 gap-4 mb-2">
              {WEEKDAYS.map((d) => <div key={d} className="text-xs font-bold text-slate-400 uppercase tracking-wider px-2">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-4 flex-1 auto-rows-fr">
              {Array.from({ length: cellCount }).map((_, i) => {
                const dayNum = i - leading + 1;
                const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
                const key = inMonth ? toKey(new Date(displayDate.getFullYear(), displayDate.getMonth(), dayNum)) : "";
                const dayEvents = inMonth ? eventsOn(key) : [];
                const isToday = key === todayKey;
                return (
                  <div
                    key={i}
                    onDoubleClick={() => inMonth && openNew(key)}
                    className={`min-h-24 p-2 rounded-2xl border transition-all flex flex-col ${inMonth ? "border-slate-100 bg-slate-50/30 hover:border-indigo-200" : "border-transparent opacity-30"} ${isToday ? "ring-2 ring-indigo-400" : ""}`}
                    title={inMonth && canEdit ? "Double-click to add an event" : undefined}
                  >
                    <span className={`text-xs font-bold mb-2 ${isToday ? "text-indigo-600" : "text-slate-700"}`}>{inMonth ? dayNum : ""}</span>
                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map((evt) => (
                        <div key={evt.id} onClick={() => setSelected(evt)} className={`text-[10px] font-bold px-2 py-1.5 rounded-lg text-white shadow-sm truncate cursor-pointer hover:opacity-80 ${styleFor(evt.event_type)}`}>
                          {evt.start_time ? `${evt.start_time} ` : ""}{evt.event_title}
                        </div>
                      ))}
                      {dayEvents.length > 3 && <div className="text-[10px] font-bold text-slate-400 px-1">+{dayEvents.length - 3} more</div>}
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
