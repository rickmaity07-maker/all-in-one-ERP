"use client";

import { useState, useEffect } from "react";
import { Search, Bell, Plus, BookOpen, Video, FileText, ClipboardList, Users, CloudUpload, PlayCircle, Loader2, Trash2, X, Download, GraduationCap } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function ELearningPortal() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"lectures" | "materials" | "assignments" | "roster">("lectures");
  
  // LIVE DATABASE STATE
  const [materials, setMaterials] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // UPLOAD MODAL STATE
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState("Video");
  const [newSize, setNewSize] = useState("");

  useEffect(() => {
    setMounted(true);
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    
    // Fetch Course Materials & Assignments
    const { data: materialsData } = await supabase
      .from('course_materials')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (materialsData) setMaterials(materialsData);

    // Fetch Enrolled Students from Registrar for the Roster
    const { data: studentData } = await supabase
      .from('registrar_records')
      .select('*')
      .eq('enrollment_status', 'Active');
      
    if (studentData) setStudents(studentData);

    setIsLoading(false);
  }

  if (!mounted) return null;

  // ADD NEW MATERIAL / ASSIGNMENT
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newSize) return;
    
    setIsUploading(true);
    const iconColor = newType === 'Video' ? 'purple' : newType === 'Assignment' ? 'orange' : 'blue';

    const { data, error } = await supabase
      .from('course_materials')
      .insert([{ 
        title: newTitle, 
        file_type: newType, 
        size_mb: parseFloat(newSize),
        icon_color: iconColor 
      }])
      .select();
      
    if (!error && data) {
      setMaterials([data[0], ...materials]);
      setNewTitle("");
      setNewSize("");
      setIsModalOpen(false);
      
      // Auto-switch tab based on what they uploaded
      if (newType === 'Assignment') setActiveTab("assignments");
      else if (newType === 'Video') setActiveTab("lectures");
      else setActiveTab("materials");
    }
    setIsUploading(false);
  };

  // DELETE ITEM
  const handleDelete = async (id: string) => {
    setMaterials(materials.filter(m => m.id !== id));
    await supabase.from('course_materials').delete().eq('id', id);
  };

  // FILTER LOGIC FOR TABS
  const videoLectures = materials.filter(m => m.file_type === 'Video' || m.file_type === 'MP4');
  const studyDocs = materials.filter(m => m.file_type === 'PDF' || m.file_type === 'Code' || m.file_type === 'Archive');
  const assignments = materials.filter(m => m.file_type === 'Assignment');

  return (
    <div className="flex h-screen w-full overflow-hidden relative">
      
      {/* UPLOAD MODAL */}
      {isModalOpen && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-3xl p-8 w-112.5 shadow-2xl border border-slate-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <CloudUpload size={20} className="text-indigo-600"/> Upload File
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700"><X size={20}/></button>
            </div>
            
            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Resource Title</label>
                <input 
                  type="text" 
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="e.g. Kinematics Final Project"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">File Type</label>
                  <select 
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                  >
                    <option value="Video">Video (MP4)</option>
                    <option value="PDF">Document (PDF)</option>
                    <option value="Assignment">Assignment</option>
                    <option value="Code">Code File</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">File Size (MB)</label>
                  <input 
                    type="number" 
                    step="0.1"
                    required
                    value={newSize}
                    onChange={(e) => setNewSize(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="e.g. 24.5"
                  />
                </div>
              </div>
              <button 
                type="submit" 
                disabled={isUploading}
                className="w-full mt-6 flex items-center justify-center gap-2 bg-indigo-600 text-white py-3.5 rounded-xl text-sm font-bold shadow-md hover:bg-indigo-700 transition-colors disabled:opacity-70"
              >
                {isUploading ? <Loader2 size={16} className="animate-spin" /> : "Confirm Upload"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SECONDARY SIDEBAR */}
      <aside className="w-72 bg-white border-r border-slate-100 flex flex-col shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="h-20 flex items-center px-8 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <BookOpen size={24} className="text-indigo-600"/> E-Learning
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">Course Management</h3>
            <ul className="space-y-1">
              <li>
                <button onClick={() => setActiveTab("lectures")} className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-2xl transition-all ${activeTab === "lectures" ? "bg-indigo-50 text-indigo-700 shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}>
                  <Video size={18} /> All Lectures
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab("materials")} className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-2xl transition-all ${activeTab === "materials" ? "bg-indigo-50 text-indigo-700 shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}>
                  <FileText size={18} /> Study Materials
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">Classroom</h3>
            <ul className="space-y-1">
              <li>
                <button onClick={() => setActiveTab("assignments")} className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-2xl transition-all ${activeTab === "assignments" ? "bg-indigo-50 text-indigo-700 shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}>
                  <ClipboardList size={18} /> Assignments
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab("roster")} className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-2xl transition-all ${activeTab === "roster" ? "bg-indigo-50 text-indigo-700 shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}>
                  <Users size={18} /> Student Roster
                </button>
              </li>
            </ul>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 bg-[#F4F7FE] flex flex-col min-w-0 overflow-y-auto">
        <header className="h-24 flex items-center justify-between px-10 shrink-0">
          <div className="relative w-112.5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] rounded-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type="text" placeholder="Search lectures or documents..." className="w-full pl-12 pr-4 py-3.5 bg-white border-none rounded-2xl text-sm outline-none font-medium" />
          </div>
          <div className="flex items-center gap-6">
            <button className="relative p-2 text-slate-400 hover:text-indigo-600 transition-colors">
              <Bell size={22} />
            </button>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-xl text-sm font-bold shadow-md hover:scale-105 transition-all"
            >
              <Plus size={18} /> Create Module
            </button>
          </div>
        </header>

        <div className="px-10 pb-10">
          <div className="mb-8 mt-2">
            <h1 className="text-3xl font-black text-slate-800 mb-2">Advanced Mechatronics & Kinematics</h1>
            <p className="text-slate-500 font-medium">Manage your course curriculum, upload lectures, and track engagement.</p>
          </div>
          
          {isLoading ? (
            <div className="flex items-center gap-3 text-slate-500 p-8">
              <Loader2 className="animate-spin" /> Syncing with database...
            </div>
          ) : activeTab === "lectures" ? (
            // ==========================================
            // VIEW 1: LECTURES
            // ==========================================
            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2 bg-linear-to-br from-indigo-900 to-[#2A0845] rounded-4xl p-10 flex flex-col justify-between aspect-video relative overflow-hidden group shadow-xl">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  <button className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md hover:scale-110 transition-all border border-white/30 shadow-2xl">
                    <PlayCircle size={32} className="text-white ml-1" />
                  </button>
                </div>
                <div className="mt-auto relative z-10">
                  <span className="bg-pink-500 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-lg mb-3 inline-block">Week 4</span>
                  <h2 className="text-3xl font-black text-white">Module 4: SCARA Manipulator Simulation</h2>
                </div>
              </div>

              <div onClick={() => setIsModalOpen(true)} className="col-span-1 bg-white border-2 border-dashed border-indigo-200 rounded-4xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-indigo-50/50 hover:border-indigo-400 transition-all group">
                <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <CloudUpload size={28} />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">Upload New Media</h3>
                <p className="text-sm text-slate-500 font-medium px-4">Click here to add files to the database.</p>
              </div>

              <div className="col-span-3 mt-4">
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center justify-between">
                  Video Archive <span className="bg-slate-200 text-slate-600 px-3 py-1 rounded-xl text-xs">{videoLectures.length}</span>
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {videoLectures.map((video) => (
                    <div key={video.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 group hover:border-indigo-200 transition-colors">
                      <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center shrink-0">
                        <PlayCircle size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-slate-800 text-sm truncate">{video.title}</h4>
                        <div className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                          <span className="font-semibold text-purple-600">{video.file_type}</span> • {video.size_mb} MB
                        </div>
                      </div>
                      <button onClick={() => handleDelete(video.id)} className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : activeTab === "materials" ? (
            // ==========================================
            // VIEW 2: STUDY MATERIALS
            // ==========================================
            <div className="bg-white rounded-4xl p-8 shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-800">Course Materials ({studyDocs.length})</h3>
              </div>
              <div className="space-y-3">
                {studyDocs.map((doc) => (
                  <div key={doc.id} className="group flex items-center justify-between p-4 rounded-2xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-blue-100 text-blue-600">
                        <FileText size={18} />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">{doc.title}</h4>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">{doc.file_type} • {doc.size_mb} MB</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleDelete(doc.id)} className="p-2 text-slate-400 hover:text-red-500 bg-white rounded-lg shadow-sm border border-slate-200"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : activeTab === "assignments" ? (
            // ==========================================
            // VIEW 3: ASSIGNMENTS 
            // ==========================================
            <div className="bg-white rounded-4xl p-8 shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-800">Homework & Dropbox ({assignments.length})</h3>
                <button 
                  onClick={() => {
                    setNewType("Assignment");
                    setIsModalOpen(true);
                  }}
                  className="flex items-center gap-2 text-sm font-bold text-orange-600 bg-orange-50 px-4 py-2 rounded-xl hover:bg-orange-100 transition-colors"
                >
                  <Plus size={16} /> New Assignment
                </button>
              </div>
              
              <div className="space-y-4">
                {assignments.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 border border-slate-200 border-dashed rounded-3xl">No active assignments. Click "New Assignment" to add one!</div>
                ) : (
                  assignments.map((doc) => (
                    <div key={doc.id} className="group flex items-center justify-between p-5 rounded-2xl border border-slate-100 hover:border-orange-200 bg-slate-50 transition-all">
                      <div className="flex items-center gap-5">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-orange-100 text-orange-600">
                          <ClipboardList size={22} />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-800 text-base">{doc.title}</h4>
                          <p className="text-xs text-slate-500 font-medium mt-1">Required File Size: Max {doc.size_mb} MB • Active Drop Box</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button className="px-4 py-2 text-sm font-bold bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm">View Submissions</button>
                        <button onClick={() => handleDelete(doc.id)} className="p-2 text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={18} /></button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            // ==========================================
            // VIEW 4: STUDENT ROSTER (Pulls from DB)
            // ==========================================
            <div className="bg-white rounded-4xl p-8 shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <GraduationCap size={24} className="text-indigo-600" /> Class Roster
                </h3>
                <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg text-xs font-bold">{students.length} Enrolled</span>
              </div>
              
              <div className="overflow-hidden rounded-2xl border border-slate-100">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50/50 text-slate-500 border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-4 font-bold">Student Name</th>
                      <th className="px-6 py-4 font-bold">Degree / Major</th>
                      <th className="px-6 py-4 font-bold text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {students.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-8 text-center text-slate-400">
                          No active students found. Add a student in the Registrar tab first!
                        </td>
                      </tr>
                    ) : (
                      students.map((student) => (
                        <tr key={student.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-bold text-slate-800">{student.student_name}</div>
                          </td>
                          <td className="px-6 py-4 text-slate-600 font-medium">{student.major}</td>
                          <td className="px-6 py-4 text-right">
                            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold uppercase tracking-wider">{student.enrollment_status}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}