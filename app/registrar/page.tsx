"use client";

import { useState, useEffect } from "react";
import { Search, GraduationCap, FileText, Download, Award, CheckCircle2, Clock, Plus, Loader2, X, Trash2, AlertTriangle, Mail, Printer, ShieldAlert } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function RegistrarPortal() {
  const [userRole, setUserRole] = useState<string>("student");
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"main" | "secondary">("main");

  // LIVE DATABASE STATE
  const [records, setRecords] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // MODAL STATE
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newStudentName, setNewStudentName] = useState("");
  const [newMajor, setNewMajor] = useState("B.Eng. Mechatronics");
  const [newGpa, setNewGpa] = useState("");

  useEffect(() => {
    setMounted(true);
    const savedRole = localStorage.getItem("erp_mock_role") || "student";
    setUserRole(savedRole);
    loadRecords();
  }, []);

  async function loadRecords() {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('registrar_records')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setRecords(data);
    }
    setIsLoading(false);
  }

  const handleAddRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName.trim() || !newGpa) return;

    setIsSubmitting(true);
    const { data, error } = await supabase
      .from('registrar_records')
      .insert([{ 
        student_name: newStudentName, 
        major: newMajor, 
        gpa: parseFloat(newGpa),
        enrollment_status: 'Active' 
      }])
      .select();

    if (!error && data) {
      setRecords([data[0], ...records]);
      setNewStudentName("");
      setNewGpa("");
      setIsModalOpen(false);
      setActiveTab("main");
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    setRecords(records.filter(r => r.id !== id));
    await supabase.from('registrar_records').delete().eq('id', id);
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    setRecords(records.map(r => r.id === id ? { ...r, enrollment_status: newStatus } : r));
    await supabase.from('registrar_records').update({ enrollment_status: newStatus }).eq('id', id);
  };

  if (!mounted) return null;

  // Filter for Probation Dashboard
  const probationStudents = records.filter(r => r.enrollment_status === 'Probation');

  return (
    <div className="flex h-screen w-full overflow-hidden relative">
      
      {/* ADD STUDENT MODAL */}
      {isModalOpen && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-3xl p-8 w-100 shadow-2xl border border-slate-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800">Add Student Record</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700"><X size={20}/></button>
            </div>
            
            <form onSubmit={handleAddRecord} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Student Name</label>
                <input 
                  type="text" 
                  required
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="e.g. Elena Rodriguez"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Major / Program</label>
                <input 
                  type="text" 
                  required
                  value={newMajor}
                  onChange={(e) => setNewMajor(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="e.g. B.S. Computer Science"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Current GPA</label>
                <input 
                  type="number"
                  step="0.1" 
                  max="4.0"
                  required
                  value={newGpa}
                  onChange={(e) => setNewGpa(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none"
                  placeholder="e.g. 3.8"
                />
              </div>
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full mt-4 flex items-center justify-center gap-2 bg-indigo-600 text-white py-3.5 rounded-xl text-sm font-bold shadow-md hover:bg-indigo-700 transition-colors disabled:opacity-70"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : "Save Record"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* CONTEXTUAL SIDEBAR */}
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
                <button 
                  onClick={() => setActiveTab("main")}
                  className={`w-full text-left px-4 py-3 text-sm font-bold rounded-2xl transition-all ${activeTab === "main" ? "bg-linear-to-r from-purple-50 to-indigo-50 text-indigo-700 shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}
                >
                  {userRole === "student" ? "My Degree Audit" : "Global Student Directory"}
                </button>
              </li>
              <li>
                <button 
                  onClick={() => setActiveTab("secondary")}
                  className={`w-full text-left px-4 py-3 text-sm font-bold rounded-2xl transition-all ${activeTab === "secondary" ? "bg-linear-to-r from-purple-50 to-indigo-50 text-indigo-700 shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}
                >
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
          {["owner", "administration", "teacher"].includes(userRole) && (
            <button 
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 bg-linear-to-r from-blue-600 to-indigo-600 text-white px-6 py-3.5 rounded-2xl text-sm font-bold shadow-md hover:scale-105 transition-all"
            >
              <Plus size={18} /> Add Student
            </button>
          )}
        </header>

        <div className="px-10 pb-10">
          
          {isLoading ? (
            <div className="flex items-center gap-3 text-slate-500 py-8">
              <Loader2 className="animate-spin" /> Syncing records with cloud...
            </div>
          ) : userRole === "student" ? (
            // ==========================================
            // STUDENT SPECIFIC VIEWS
            // ==========================================
            activeTab === "main" ? (
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
            ) : (
              // STUDENT TRANSCRIPT TAB
              <div className="bg-white rounded-4xl p-8 shadow-sm border border-slate-100">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-xl font-bold text-slate-800">Official Transcripts</h3>
                    <p className="text-slate-500 text-sm mt-1">Request certified copies of your academic record.</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-6 mt-8">
                  <div className="border border-slate-200 rounded-3xl p-6 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all cursor-pointer group">
                    <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Download size={24} />
                    </div>
                    <h4 className="text-lg font-bold text-slate-800 mb-2">Digital Transcript (PDF)</h4>
                    <p className="text-sm text-slate-500 mb-6">Instant download. Digitally signed and certified by the Registrar's Office.</p>
                    <button className="w-full py-3 bg-slate-900 text-white rounded-xl text-sm font-bold shadow-md hover:bg-slate-800 transition-colors">Generate PDF</button>
                  </div>

                  <div className="border border-slate-200 rounded-3xl p-6 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all cursor-pointer group">
                    <div className="w-14 h-14 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Mail size={24} />
                    </div>
                    <h4 className="text-lg font-bold text-slate-800 mb-2">Mailed Physical Copy</h4>
                    <p className="text-sm text-slate-500 mb-6">Official sealed document mailed directly to an employer or institution.</p>
                    <button className="w-full py-3 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold shadow-sm hover:bg-slate-50 transition-colors">Request Mail Delivery</button>
                  </div>
                </div>
              </div>
            )
          ) : (
            // ==========================================
            // ADMIN SPECIFIC VIEWS
            // ==========================================
            activeTab === "main" ? (
              <div className="bg-white rounded-4xl p-8 shadow-sm border border-slate-100">
                <h3 className="text-xl font-bold text-slate-800 mb-6">Global Enrollment Directory ({records.length})</h3>
                
                <div className="overflow-hidden rounded-2xl border border-slate-100">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50/50 text-slate-500 border-b border-slate-100">
                      <tr>
                        <th className="px-6 py-4 font-bold">Student Name</th>
                        <th className="px-6 py-4 font-bold">Major / Program</th>
                        <th className="px-6 py-4 font-bold">GPA</th>
                        <th className="px-6 py-4 font-bold">Status</th>
                        <th className="px-6 py-4 font-bold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {records.length === 0 ? (
                        <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400">No student records found.</td></tr>
                      ) : (
                        records.map((record) => (
                          <tr key={record.id} className="hover:bg-indigo-50/30 transition-colors group">
                            <td className="px-6 py-4 font-bold text-slate-800">{record.student_name}</td>
                            <td className="px-6 py-4 text-slate-600">{record.major}</td>
                            <td className="px-6 py-4 font-bold text-indigo-600">{record.gpa}</td>
                            <td className="px-6 py-4">
                              <select 
                                value={record.enrollment_status}
                                onChange={(e) => handleStatusChange(record.id, e.target.value)}
                                className={`text-xs font-bold uppercase tracking-wider rounded-xl px-2 py-1 outline-none cursor-pointer ${
                                  record.enrollment_status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 
                                  record.enrollment_status === 'Probation' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                <option value="Active">Active</option>
                                <option value="Probation">Probation</option>
                                <option value="Graduated">Graduated</option>
                              </select>
                            </td>
                            <td className="px-6 py-4 text-right flex items-center justify-end gap-3">
                              <button className="text-slate-400 hover:text-indigo-600 transition-colors" title="Download Transcript"><Download size={18} /></button>
                              <button onClick={() => handleDelete(record.id)} className="text-slate-400 hover:text-red-500 transition-colors" title="Delete Record"><Trash2 size={18} /></button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              // ADMIN PROBATION TAB
              <>
                <div className="flex justify-between items-end mb-6 mt-2">
                  <div>
                    <h1 className="text-3xl font-black text-slate-800 mb-2">Academic Probation & Intervention</h1>
                    <p className="text-slate-500 font-medium">Review students falling below academic standing requirements.</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-6 mb-8">
                  <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                      <ShieldAlert size={28} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">At Risk</p>
                      <h3 className="text-2xl font-black text-slate-800">{probationStudents.length} Students</h3>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-4xl p-8 shadow-sm border border-slate-100">
                  <h3 className="text-xl font-bold text-slate-800 mb-6">Intervention Queue</h3>
                  
                  <div className="overflow-hidden rounded-2xl border border-slate-100">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50/50 text-slate-500 border-b border-slate-100">
                        <tr>
                          <th className="px-6 py-4 font-bold">Student Name</th>
                          <th className="px-6 py-4 font-bold">Program</th>
                          <th className="px-6 py-4 font-bold">Critical GPA</th>
                          <th className="px-6 py-4 font-bold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {probationStudents.length === 0 ? (
                          <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 font-medium">No students are currently on academic probation.</td></tr>
                        ) : (
                          probationStudents.map((record) => (
                            <tr key={record.id} className="hover:bg-orange-50/30 transition-colors group">
                              <td className="px-6 py-4 font-bold text-slate-800">{record.student_name}</td>
                              <td className="px-6 py-4 text-slate-600">{record.major}</td>
                              <td className="px-6 py-4">
                                <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-red-100 text-red-700 w-fit">
                                  <AlertTriangle size={14} /> {record.gpa}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right space-x-2">
                                <button className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition-colors shadow-sm text-xs">Schedule Counseling</button>
                                <button 
                                  onClick={() => handleStatusChange(record.id, 'Active')}
                                  className="px-4 py-2 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-colors shadow-sm text-xs"
                                >
                                  Lift Probation
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
            )
          )}
        </div>
      </main>
    </div>
  );
}