"use client";

import { useState, useEffect } from "react";
import { Search, ClipboardCheck, AlertTriangle, CheckCircle2, Clock, MapPin, ShieldAlert, FileText, Plus, Loader2, X, Trash2, Eye, ShieldX, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function ExamsPortal() {
  const [userRole, setUserRole] = useState<string>("student");
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"schedule" | "plagiarism">("schedule");

  // LIVE DATABASE STATE
  const [exams, setExams] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // MODAL STATE
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newCourseName, setNewCourseName] = useState("");
  const [newExamDate, setNewExamDate] = useState("");
  const [newExamType, setNewExamType] = useState("Midterm");

  useEffect(() => {
    setMounted(true);
    setUserRole(localStorage.getItem("erp_mock_role") || "student");
    loadExams();
  }, []);

  async function loadExams() {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('exams')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setExams(data);
    }
    setIsLoading(false);
  }

  const handleAddExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseName.trim() || !newExamDate) return;

    setIsSubmitting(true);
    const { data, error } = await supabase
      .from('exams')
      .insert([{ 
        course_name: newCourseName, 
        exam_date: newExamDate, 
        exam_type: newExamType,
        status: 'Upcoming' 
      }])
      .select();

    if (!error && data) {
      setExams([data[0], ...exams]);
      setNewCourseName("");
      setNewExamDate("");
      setIsModalOpen(false);
      setActiveTab("schedule");
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    setExams(exams.filter(e => e.id !== id));
    await supabase.from('exams').delete().eq('id', id);
  };

  if (!mounted) return null;

  const canManageExams = ["teacher", "administration", "owner"].includes(userRole);

  return (
    <div className="flex h-screen w-full overflow-hidden relative">

      {/* CREATE EXAM MODAL */}
      {isModalOpen && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-3xl p-8 w-100 shadow-2xl border border-slate-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800">Schedule Exam</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700"><X size={20}/></button>
            </div>
            
            <form onSubmit={handleAddExam} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Course Name</label>
                <input 
                  type="text" 
                  required
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. MEC-401 Advanced Kinematics"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Exam Date & Time</label>
                <input 
                  type="text" 
                  required
                  value={newExamDate}
                  onChange={(e) => setNewExamDate(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none"
                  placeholder="e.g. Aug 28, 09:00 AM"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Assessment Type</label>
                <select 
                  value={newExamType}
                  onChange={(e) => setNewExamType(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none cursor-pointer"
                >
                  <option value="Quiz">Quiz</option>
                  <option value="Midterm">Midterm</option>
                  <option value="Final">Final Exam</option>
                </select>
              </div>
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full mt-4 flex items-center justify-center gap-2 bg-blue-600 text-white py-3.5 rounded-xl text-sm font-bold shadow-md hover:bg-blue-700 transition-colors disabled:opacity-70"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : "Publish Exam"}
              </button>
            </form>
          </div>
        </div>
      )}

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
                <button 
                  onClick={() => setActiveTab("schedule")}
                  className={`w-full text-left px-4 py-3 text-sm font-bold rounded-2xl transition-all ${activeTab === "schedule" ? "bg-linear-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}
                >
                  {userRole === "student" ? "My Exam Schedule" : "Global Exam Schedule"}
                </button>
              </li>
              {canManageExams && (
                <li>
                  <button 
                    onClick={() => setActiveTab("plagiarism")}
                    className={`w-full text-left px-4 py-3 text-sm font-bold rounded-2xl transition-all ${activeTab === "plagiarism" ? "bg-linear-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}
                  >
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
          {canManageExams && (
            <button 
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3.5 rounded-2xl text-sm font-bold shadow-md hover:bg-slate-800 transition-colors"
            >
              <Plus size={18} /> Schedule Exam
            </button>
          )}
        </header>

        <div className="px-10 pb-10">
          
          {isLoading ? (
            <div className="flex items-center gap-3 text-slate-500 py-8">
              <Loader2 className="animate-spin" /> Syncing exams with cloud...
            </div>
          ) : activeTab === "schedule" ? (
            // ==========================================
            // VIEW 1: EXAM SCHEDULE
            // ==========================================
            <>
              <div className="flex justify-between items-end mb-6 mt-2">
                <div>
                  <h1 className="text-3xl font-black text-slate-800 mb-2">Academic Assessment</h1>
                  <p className="text-slate-500 font-medium">Manage upcoming exams, seating allocations, and integrity reports.</p>
                </div>
              </div>
              
              <div className={`grid gap-8 ${userRole === "student" ? "grid-cols-2" : "grid-cols-3"}`}>
                <div className={`${userRole === "student" ? "col-span-2" : "col-span-2"} bg-white rounded-4xl p-8 shadow-sm border border-slate-100`}>
                  <h3 className="text-xl font-bold text-slate-800 mb-6">Upcoming & Active Exams ({exams.length})</h3>
                  <div className="space-y-4">
                    {exams.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 border border-slate-200 border-dashed rounded-3xl">No exams scheduled.</div>
                    ) : (
                      exams.map((exam) => (
                        <div key={exam.id} className="p-5 rounded-2xl border border-blue-100 bg-blue-50/30 relative overflow-hidden group hover:border-blue-300 transition-all">
                          <div className="flex justify-between items-start mb-4 relative z-10">
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-100 px-2 py-1 rounded-lg">{exam.exam_type}</span>
                              <h4 className="font-bold text-slate-800 text-lg mt-2">{exam.course_name}</h4>
                            </div>
                            <div className="text-right flex items-center gap-4">
                              <div>
                                <p className="text-sm font-bold text-slate-800">{exam.exam_date}</p>
                              </div>
                              {canManageExams && (
                                <button onClick={() => handleDelete(exam.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                                  <Trash2 size={18} />
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-sm font-medium text-slate-600 relative z-10">
                            <span className="flex items-center gap-1.5"><MapPin size={16} className="text-blue-500"/> Main Hall</span>
                            <span className="flex items-center gap-1.5"><Clock size={16} className="text-blue-500"/> {exam.status}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {canManageExams && (
                  <div className="col-span-1 bg-linear-to-br from-[#8A2387] to-[#E94057] rounded-4xl p-8 text-white shadow-lg relative overflow-hidden h-fit">
                    <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                    <h3 className="text-lg font-bold text-white/90 mb-6 flex items-center gap-2"><ShieldAlert size={20}/> Quick Alerts</h3>
                    <div className="bg-black/20 backdrop-blur-md rounded-2xl p-4 border border-white/10 mb-4 cursor-pointer hover:bg-black/30 transition-colors" onClick={() => setActiveTab("plagiarism")}>
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-red-200">High Match</span>
                        <span className="text-xs font-bold bg-red-500 text-white px-2 py-0.5 rounded-md">84%</span>
                      </div>
                      <p className="text-sm font-bold text-white mb-1">Final Essay Submission</p>
                      <p className="text-xs text-white/70">Click to view details in Console &rarr;</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            // ==========================================
            // VIEW 2: PLAGIARISM & INTEGRITY DASHBOARD
            // ==========================================
            <>
              <div className="flex justify-between items-end mb-6 mt-2">
                <div>
                  <h1 className="text-3xl font-black text-slate-800 mb-2">Academic Integrity Console</h1>
                  <p className="text-slate-500 font-medium">Review automated plagiarism flags and code similarity reports.</p>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-6 mb-8">
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                    <ShieldX size={28} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Active Flags</p>
                    <h3 className="text-2xl font-black text-slate-800">2 Pending</h3>
                  </div>
                </div>
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                    <CheckCircle2 size={28} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Resolved Term</p>
                    <h3 className="text-2xl font-black text-slate-800">14 Cleared</h3>
                  </div>
                </div>
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                    <Search size={28} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Scans Today</p>
                    <h3 className="text-2xl font-black text-slate-800">1,042 Docs</h3>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-4xl p-8 shadow-sm border border-slate-100">
                <h3 className="text-xl font-bold text-slate-800 mb-6">Flagged Submissions Queue</h3>
                
                <div className="overflow-hidden rounded-2xl border border-slate-100">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50/50 text-slate-500 border-b border-slate-100">
                      <tr>
                        <th className="px-6 py-4 font-bold">Student</th>
                        <th className="px-6 py-4 font-bold">Assessment / Course</th>
                        <th className="px-6 py-4 font-bold">Similarity Index</th>
                        <th className="px-6 py-4 font-bold">Detected Source</th>
                        <th className="px-6 py-4 font-bold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {/* Incident 1 */}
                      <tr className="hover:bg-red-50/30 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-800">Marcus Chen</div>
                          <div className="text-xs text-slate-500">ID: 102948</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-700">MEC-401 Final Essay</div>
                          <div className="text-xs text-slate-500">Submitted: Aug 26, 14:20</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-red-100 text-red-700 w-fit">
                            <AlertTriangle size={14} /> 84% Match
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-semibold text-slate-500">
                          Wikipedia, Github Pages
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition-colors shadow-sm text-xs">Review</button>
                          <button className="p-2 text-emerald-500 hover:bg-emerald-50 rounded-xl transition-colors" title="Dismiss Flag"><Check size={18} /></button>
                        </td>
                      </tr>

                      {/* Incident 2 */}
                      <tr className="hover:bg-orange-50/30 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-800">David Kim</div>
                          <div className="text-xs text-slate-500">ID: 102113</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-700">CS-305 Midterm Code</div>
                          <div className="text-xs text-slate-500">Submitted: Aug 25, 09:15</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-orange-100 text-orange-700 w-fit">
                            <AlertTriangle size={14} /> 62% Match
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-semibold text-slate-500">
                          StackOverflow (Code Block)
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition-colors shadow-sm text-xs">Review</button>
                          <button className="p-2 text-emerald-500 hover:bg-emerald-50 rounded-xl transition-colors" title="Dismiss Flag"><Check size={18} /></button>
                        </td>
                      </tr>
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