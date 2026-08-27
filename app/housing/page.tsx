"use client";

import { useState, useEffect } from "react";
import { Search, Building, Wrench, Utensils, MapPin, CreditCard, Plus, AlertCircle, Loader2, Trash2, X, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function HousingPortal() {
  const [userRole, setUserRole] = useState<string>("student");
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "tickets" | "meals">("overview");

  // LIVE DATABASE STATE
  const [tickets, setTickets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // MODAL STATE
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [issueTitle, setIssueTitle] = useState("");
  const [location, setLocation] = useState("THWS Campus-1, Lab 3");
  const [priority, setPriority] = useState("High");

  useEffect(() => {
    setMounted(true);
    setUserRole(localStorage.getItem("erp_mock_role") || "student");
    loadTickets();
  }, []);

  async function loadTickets() {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('maintenance_tickets')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setTickets(data);
    }
    setIsLoading(false);
  }

  if (!mounted) return null;

  // 1. SUBMIT TICKET
  const handleTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueTitle.trim()) return;

    setIsSubmitting(true);
    const { data, error } = await supabase
      .from('maintenance_tickets')
      .insert([{ 
        issue_title: issueTitle, 
        location: location, 
        priority: priority, 
        status: 'Open' 
      }])
      .select();

    if (!error && data) {
      setTickets([data[0], ...tickets]);
      setIssueTitle("");
      setIsModalOpen(false);
    }
    setIsSubmitting(false);
  };

  // 2. DELETE TICKET
  const handleDeleteTicket = async (id: string) => {
    setTickets(tickets.filter(t => t.id !== id));
    await supabase.from('maintenance_tickets').delete().eq('id', id);
  };

  // 3. RESOLVE TICKET
  const handleResolveTicket = async (id: string) => {
    setTickets(tickets.map(t => t.id === id ? { ...t, status: 'Resolved' } : t));
    await supabase.from('maintenance_tickets').update({ status: 'Resolved' }).eq('id', id);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden relative">

      {/* NEW TICKET MODAL */}
      {isModalOpen && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-3xl p-8 w-[420px] shadow-2xl border border-slate-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Wrench size={20} className="text-blue-600"/> Submit Maintenance Ticket</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700"><X size={20}/></button>
            </div>
            
            <form onSubmit={handleTicketSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Issue Title</label>
                <input 
                  type="text" 
                  required
                  value={issueTitle}
                  onChange={(e) => setIssueTitle(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. Ender 3 Extruder Clogged / HVAC Malfunction"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Location</label>
                <input 
                  type="text" 
                  required
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. Block B, Room 402"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Priority Level</label>
                <select 
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                >
                  <option value="Low">Low Priority</option>
                  <option value="Medium">Medium Priority</option>
                  <option value="High">High Priority (Urgent)</option>
                </select>
              </div>
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full mt-6 flex items-center justify-center gap-2 bg-blue-600 text-white py-3.5 rounded-xl text-sm font-bold shadow-md hover:bg-blue-700 transition-colors disabled:opacity-70"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : "Submit Ticket to Cloud"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* FACILITIES SIDEBAR */}
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
                <button 
                  onClick={() => setActiveTab("overview")}
                  className={`w-full text-left px-4 py-3 text-sm font-bold rounded-2xl transition-all ${activeTab === "overview" ? "bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}
                >
                  {userRole === "student" ? "My Accommodations" : "Campus Overview"}
                </button>
              </li>
              <li>
                <button 
                  onClick={() => setActiveTab("tickets")}
                  className={`w-full text-left px-4 py-3 text-sm font-bold rounded-2xl transition-all ${activeTab === "tickets" ? "bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}
                >
                  Maintenance Tickets ({tickets.length})
                </button>
              </li>
              <li>
                <button 
                  onClick={() => setActiveTab("meals")}
                  className={`w-full text-left px-4 py-3 text-sm font-bold rounded-2xl transition-all ${activeTab === "meals" ? "bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}
                >
                  {userRole === "student" ? "Meal Plan Balance" : "Facility Booking"}
                </button>
              </li>
            </ul>
          </div>
        </div>
      </aside>

      {/* MAIN WORK AREA */}
      <main className="flex-1 bg-[#F4F7FE] flex flex-col min-w-0 overflow-y-auto">
        <header className="h-24 flex items-center justify-between px-10 shrink-0">
          <div className="relative w-96 shadow-[0_4px_20px_rgba(0,0,0,0.03)] rounded-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type="text" placeholder="Search facilities, tickets, or rooms..." className="w-full pl-12 pr-4 py-3.5 bg-white border-none rounded-2xl text-sm outline-none font-medium" />
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3.5 rounded-2xl text-sm font-bold shadow-md hover:scale-105 transition-all"
          >
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

          {isLoading ? (
            <div className="flex items-center gap-3 text-slate-500 p-8">
              <Loader2 className="animate-spin" /> Loading facilities data...
            </div>
          ) : activeTab === "tickets" ? (
            // ==========================================
            // VIEW: MAINTENANCE TICKETS QUEUE
            // ==========================================
            <div className="bg-white rounded-4xl p-8 shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-800">Live Maintenance Queue ({tickets.length})</h3>
                <button 
                  onClick={() => setIsModalOpen(true)}
                  className="flex items-center gap-2 text-sm font-bold text-blue-600 bg-blue-50 px-4 py-2 rounded-xl hover:bg-blue-100 transition-colors"
                >
                  <Plus size={16} /> Submit Ticket
                </button>
              </div>

              <div className="space-y-4">
                {tickets.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 border border-slate-200 border-dashed rounded-3xl">No active maintenance tickets logged in the cloud.</div>
                ) : (
                  tickets.map((t) => (
                    <div key={t.id} className="flex items-center justify-between p-5 rounded-2xl border border-slate-100 bg-slate-50 group hover:border-blue-200 transition-all">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${t.priority === 'High' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                          <Wrench size={22} />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-800 text-base mb-0.5">{t.issue_title}</h4>
                          <p className="text-xs font-medium text-slate-500 flex items-center gap-2">
                            <span className="flex items-center gap-1"><MapPin size={12}/> {t.location}</span> • 
                            <span>Logged {new Date(t.created_at).toLocaleDateString()}</span>
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${
                          t.status === 'Resolved' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {t.status}
                        </span>

                        {t.status !== 'Resolved' && (
                          <button 
                            onClick={() => handleResolveTicket(t.id)}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors border border-emerald-200" 
                            title="Mark Resolved"
                          >
                            <CheckCircle2 size={16} />
                          </button>
                        )}
                        <button 
                          onClick={() => handleDeleteTicket(t.id)}
                          className="p-2 text-slate-300 hover:text-red-500 rounded-lg transition-colors"
                          title="Delete Ticket"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : activeTab === "meals" ? (
            // ==========================================
            // VIEW: MEALS & BILLING
            // ==========================================
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-orange-400 to-pink-500 rounded-4xl p-8 text-white shadow-lg relative overflow-hidden flex flex-col justify-between aspect-[16/9]">
                <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                <div>
                  <h3 className="text-lg font-bold text-white/90 mb-1 flex items-center gap-2"><Utensils size={20}/> Meal Plan Balance</h3>
                  <p className="text-sm font-medium text-white/70">Platinum Tier - THWS Mensa</p>
                </div>
                <div>
                  <h4 className="text-5xl font-black mb-3">$150<span className="text-2xl text-white/70">.00</span></h4>
                  <button onClick={() => alert("Balance topped up successfully!")} className="bg-white/20 hover:bg-white/30 backdrop-blur-md text-white px-6 py-3 rounded-xl text-sm font-bold transition-colors flex items-center gap-2">
                    <CreditCard size={16}/> Top Up Balance ($50)
                  </button>
                </div>
              </div>
            </div>
          ) : (
            // ==========================================
            // VIEW: OVERVIEW / ACCOMMODATIONS
            // ==========================================
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

              <div className="col-span-1 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-4xl p-8 text-white shadow-lg relative overflow-hidden flex flex-col justify-between">
                <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                <div>
                  <p className="text-cyan-100 font-semibold tracking-wide text-sm mb-2 uppercase">Dormitory Occupancy</p>
                  <h3 className="text-5xl font-black mb-4">94<span className="text-2xl font-bold text-cyan-200">%</span></h3>
                </div>
                <div className="w-full bg-black/20 rounded-full h-2 backdrop-blur-md">
                  <div className="bg-white h-2 rounded-full w-[94%]"></div>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}