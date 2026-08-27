"use client";

import { useState, useEffect } from "react";
import { Search, Users, ShieldAlert, CheckCircle, Clock, Plus, Loader2, Trash2, X, FileText, Eye, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function AdmissionsPortal() {
  const [userRole, setUserRole] = useState<string>("");
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"pipeline" | "verification">("pipeline");
  
  // LIVE DATABASE STATE
  const [applicants, setApplicants] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // MODAL STATE
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newName, setNewName] = useState("");
  const [newProgram, setNewProgram] = useState("B.Eng. Mechatronics");

  useEffect(() => {
    setMounted(true);
    setUserRole(localStorage.getItem("erp_mock_role") || "student");
    loadPipeline();
  }, []);

  async function loadPipeline() {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('admissions')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (!error && data) {
      setApplicants(data);
    }
    setIsLoading(false);
  }

  if (!mounted) return null;

  // STRICT RBAC BLOCK
  if (userRole === "student" || userRole === "teacher") {
    return (
      <div className="flex-1 bg-[#F4F7FE] flex flex-col items-center justify-center h-screen w-full">
        <ShieldAlert size={64} className="text-pink-500 mb-4" />
        <h1 className="text-2xl font-black text-slate-800">Access Restricted</h1>
        <p className="text-slate-500">Only Administration and Owners can view the Admissions CRM.</p>
      </div>
    );
  }

  // 1. ADD REAL APPLICANT
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    
    setIsSubmitting(true);
    const { data, error } = await supabase
      .from('admissions')
      .insert([{ applicant_name: newName, program: newProgram, status: 'Under Review' }])
      .select();
      
    if (!error && data) {
      setApplicants([data[0], ...applicants]);
      setNewName("");
      setIsModalOpen(false);
    }
    setIsSubmitting(false);
  };

  // 2. UPDATE STATUS (MOVE COLUMNS / APPROVE)
  const handleStatusChange = async (id: string, newStatus: string) => {
    setApplicants(applicants.map(app => app.id === id ? { ...app, status: newStatus } : app));
    await supabase.from('admissions').update({ status: newStatus }).eq('id', id);
  };

  // 3. DELETE APPLICANT
  const handleDelete = async (id: string) => {
    setApplicants(applicants.filter(app => app.id !== id));
    await supabase.from('admissions').delete().eq('id', id);
  };

  // KANBAN SORTING LOGIC
  const underReview = applicants.filter(a => a.status === 'Under Review');
  const awaitingDocs = applicants.filter(a => a.status === 'Awaiting Documents');
  const approved = applicants.filter(a => a.status === 'Approved');

  // REUSABLE CARD COMPONENT
  const KanbanCard = ({ app, accentColor }: { app: any, accentColor: string }) => (
    <div className="bg-white p-4 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.03)] border border-slate-100 group relative">
      <div className="flex justify-between items-start mb-2">
        <div className={`text-[10px] font-bold uppercase tracking-wider ${accentColor}`}>{app.program}</div>
        <button 
          onClick={() => handleDelete(app.id)}
          className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
          title="Delete Applicant"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <h4 className="font-bold text-slate-800 text-sm mb-3">{app.applicant_name}</h4>
      
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-400 flex items-center gap-1">
          <Clock size={12}/> {new Date(app.created_at).toLocaleDateString()}
        </div>
        <select 
          value={app.status}
          onChange={(e) => handleStatusChange(app.id, e.target.value)}
          className="text-xs font-semibold bg-slate-50 border border-slate-200 text-slate-600 rounded-lg px-2 py-1 outline-none cursor-pointer hover:border-blue-400 transition-colors"
        >
          <option value="Under Review">Under Review</option>
          <option value="Awaiting Documents">Awaiting Docs</option>
          <option value="Approved">Approved</option>
        </select>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden relative">
      
      {/* ADD APPLICANT MODAL */}
      {isModalOpen && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-3xl p-8 w-100 shadow-2xl border border-slate-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800">New Applicant</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700"><X size={20}/></button>
            </div>
            
            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Full Name</label>
                <input 
                  type="text" 
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. Lukas Weber"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Target Program</label>
                <select 
                  value={newProgram}
                  onChange={(e) => setNewProgram(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                >
                  <option value="B.Eng. Mechatronics">B.Eng. Mechatronics</option>
                  <option value="B.Eng. Mechanical">B.Eng. Mechanical</option>
                  <option value="M.Sc. Mechatronics">M.Sc. Mechatronics</option>
                  <option value="M.Sc. Robotics">M.Sc. Robotics</option>
                </select>
              </div>
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full mt-4 flex items-center justify-center gap-2 bg-blue-600 text-white py-3.5 rounded-xl text-sm font-bold shadow-md hover:bg-blue-700 transition-colors disabled:opacity-70"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : "Submit Application"}
              </button>
            </form>
          </div>
        </div>
      )}

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
                <button 
                  onClick={() => setActiveTab("pipeline")}
                  className={`w-full text-left px-4 py-3 text-sm font-bold rounded-2xl transition-all ${activeTab === "pipeline" ? "bg-linear-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}
                >
                  Active Applicants
                </button>
              </li>
              <li>
                <button 
                  onClick={() => setActiveTab("verification")}
                  className={`w-full text-left px-4 py-3 text-sm font-bold rounded-2xl transition-all ${activeTab === "verification" ? "bg-linear-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}
                >
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
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl text-sm font-bold shadow-md hover:bg-slate-800 transition-colors"
          >
            <Plus size={18} /> New Applicant
          </button>
        </header>

        <div className="px-10 pb-10">
          
          {isLoading ? (
            <div className="flex items-center gap-3 text-slate-500 p-8 mt-4">
              <Loader2 className="animate-spin" /> Syncing pipeline with cloud...
            </div>
          ) : activeTab === "pipeline" ? (
            // ==========================================
            // VIEW 1: KANBAN BOARD
            // ==========================================
            <>
              <div className="flex justify-between items-end mb-6 mt-2">
                <div>
                  <h1 className="text-3xl font-black text-slate-800 mb-2">Applicant Pipeline</h1>
                  <p className="text-slate-500 font-medium">Review pending applications and manage candidate flow.</p>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-6">
                <div className="bg-slate-100/50 rounded-4xl p-6 border border-slate-200">
                  <h3 className="font-bold text-slate-700 mb-4 flex items-center justify-between">
                    Under Review <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-lg text-xs">{underReview.length}</span>
                  </h3>
                  <div className="space-y-3">
                    {underReview.map((app) => <KanbanCard key={app.id} app={app} accentColor="text-blue-600" />)}
                  </div>
                </div>

                <div className="bg-slate-100/50 rounded-4xl p-6 border border-slate-200">
                  <h3 className="font-bold text-slate-700 mb-4 flex items-center justify-between">
                    Awaiting Documents <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-lg text-xs">{awaitingDocs.length}</span>
                  </h3>
                  <div className="space-y-3">
                    {awaitingDocs.map((app) => <KanbanCard key={app.id} app={app} accentColor="text-orange-600" />)}
                  </div>
                </div>

                <div className="bg-slate-100/50 rounded-4xl p-6 border border-slate-200">
                  <h3 className="font-bold text-slate-700 mb-4 flex items-center justify-between">
                    Approved <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-lg text-xs">{approved.length}</span>
                  </h3>
                  <div className="space-y-3">
                    {approved.map((app) => <KanbanCard key={app.id} app={app} accentColor="text-emerald-600" />)}
                  </div>
                </div>
              </div>
            </>
          ) : (
            // ==========================================
            // VIEW 2: DOCUMENT VERIFICATION
            // ==========================================
            <>
              <div className="flex justify-between items-end mb-6 mt-2">
                <div>
                  <h1 className="text-3xl font-black text-slate-800 mb-2">Document Verification Queue</h1>
                  <p className="text-slate-500 font-medium">Verify passports, visas, and academic transcripts.</p>
                </div>
              </div>

              <div className="bg-white rounded-4xl p-8 shadow-[0_8px_24px_rgba(0,0,0,0.02)] border border-slate-100">
                <div className="overflow-hidden rounded-2xl border border-slate-100">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50/50 text-slate-500 border-b border-slate-100">
                      <tr>
                        <th className="px-6 py-4 font-bold tracking-wide">Applicant</th>
                        <th className="px-6 py-4 font-bold tracking-wide">Program</th>
                        <th className="px-6 py-4 font-bold tracking-wide">Uploaded Documents</th>
                        <th className="px-6 py-4 font-bold tracking-wide text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {awaitingDocs.length === 0 ? (
                        <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 font-medium">No candidates are currently awaiting document verification.</td></tr>
                      ) : (
                        awaitingDocs.map((app) => (
                          <tr key={app.id} className="hover:bg-orange-50/30 transition-colors group">
                            <td className="px-6 py-4">
                              <div className="font-bold text-slate-800 text-base">{app.applicant_name}</div>
                              <div className="text-slate-500 text-xs flex items-center gap-1 mt-1">
                                <Clock size={12}/> Applied {new Date(app.created_at).toLocaleDateString()}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center px-3 py-1 rounded-xl text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                                {app.program}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex gap-2">
                                <span className="flex items-center gap-1 text-xs font-semibold bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg border border-blue-100 cursor-pointer hover:bg-blue-100">
                                  <FileText size={14} /> Transcript.pdf
                                </span>
                                <span className="flex items-center gap-1 text-xs font-semibold bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg border border-blue-100 cursor-pointer hover:bg-blue-100">
                                  <FileText size={14} /> Passport.pdf
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right space-x-2">
                              <button className="p-2 text-slate-400 hover:text-blue-600 bg-white border border-slate-200 rounded-xl shadow-sm transition-all hover:shadow-md" title="View Files">
                                <Eye size={16} />
                              </button>
                              <button 
                                onClick={() => handleStatusChange(app.id, "Approved")}
                                className="px-4 py-2 bg-emerald-500 text-white font-bold rounded-xl shadow-[0_4px_12px_rgba(16,185,129,0.3)] hover:bg-emerald-600 transition-all text-xs flex items-center gap-1"
                              >
                                <Check size={14} /> Approve Docs
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}