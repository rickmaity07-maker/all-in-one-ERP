"use client";

import { useState } from "react";
import { Search, Bell, Plus, FileText, Video, ClipboardList, PlayCircle, UploadCloud, MoreVertical, FileDown, BookOpen, Users, ChevronLeft, ChevronRight } from "lucide-react";

const MOCK_MATERIALS = [
  { id: 1, title: "Week 4 Syllabus & Reading List", type: "PDF Document", size: "2.4 MB", icon: FileDown, color: "pink" },
  { id: 2, title: "Homework Assignment #4", type: "Word Document", size: "1.1 MB", icon: FileText, color: "blue" },
];

export default function TeacherPortal() {
  const [activeTab, setActiveTab] = useState<"lectures" | "materials">("lectures");
  const [materials, setMaterials] = useState(MOCK_MATERIALS);
  const [isSubSidebarCollapsed, setIsSubSidebarCollapsed] = useState(false);

  const handleSimulatedUpload = () => {
    const newMaterial = {
      id: materials.length + 1,
      title: `LattePanda Ubuntu Config Specs v${materials.length + 1}`,
      type: "PDF Document",
      size: "4.2 MB",
      icon: FileDown,
      color: "pink"
    };
    setMaterials([newMaterial, ...materials]);
    setActiveTab("materials");
  };

  return (
    <>
      {/* COLLAPSIBLE CONTEXTUAL SIDEBAR */}
      <aside className={`bg-white/80 backdrop-blur-xl border-r border-slate-100 flex flex-col shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)] transition-all duration-300 ease-in-out ${isSubSidebarCollapsed ? "w-20" : "w-72"}`}>
        
        {/* Header & Collapse Toggle */}
        <div className={`h-20 flex items-center border-b border-slate-100 px-6 ${isSubSidebarCollapsed ? "justify-center" : "justify-between"}`}>
          {!isSubSidebarCollapsed && (
            <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2 truncate">
              <BookOpen size={22} className="text-indigo-600 shrink-0"/> E-Learning
            </h2>
          )}
          <button 
            onClick={() => setIsSubSidebarCollapsed(!isSubSidebarCollapsed)}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
            title={isSubSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isSubSidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div>
            {!isSubSidebarCollapsed && <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">Course Management</h3>}
            <ul className="space-y-2">
              <li>
                <button 
                  onClick={() => setActiveTab("lectures")}
                  title="All Lectures"
                  className={`w-full flex items-center rounded-2xl transition-all ${
                    activeTab === "lectures" 
                      ? "bg-linear-to-r from-purple-50 to-indigo-50 text-indigo-700 shadow-xs" 
                      : "text-slate-500 hover:bg-slate-50"
                  } ${isSubSidebarCollapsed ? "p-3 justify-center" : "px-4 py-3 gap-3"}`}
                >
                  <Video size={18} className="shrink-0" />
                  {!isSubSidebarCollapsed && <span className="text-sm font-bold whitespace-nowrap">All Lectures</span>}
                </button>
              </li>
              <li>
                <button 
                  onClick={() => setActiveTab("materials")}
                  title="Study Materials"
                  className={`w-full flex items-center rounded-2xl transition-all ${
                    activeTab === "materials" 
                      ? "bg-linear-to-r from-purple-50 to-indigo-50 text-indigo-700 shadow-xs" 
                      : "text-slate-500 hover:bg-slate-50"
                  } ${isSubSidebarCollapsed ? "p-3 justify-center" : "px-4 py-3 gap-3"}`}
                >
                  <FileText size={18} className="shrink-0" />
                  {!isSubSidebarCollapsed && <span className="text-sm font-bold whitespace-nowrap">Study Materials</span>}
                </button>
              </li>
            </ul>
          </div>

          <div>
            {!isSubSidebarCollapsed && <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">Classroom</h3>}
            <ul className="space-y-2">
              <li>
                <button 
                  title="Assignments"
                  className={`w-full flex items-center text-slate-500 hover:bg-slate-50 rounded-2xl transition-all ${isSubSidebarCollapsed ? "p-3 justify-center" : "px-4 py-3 gap-3"}`}
                >
                  <ClipboardList size={18} className="shrink-0" />
                  {!isSubSidebarCollapsed && <span className="text-sm font-semibold whitespace-nowrap">Assignments</span>}
                </button>
              </li>
              <li>
                <button 
                  title="Student Roster"
                  className={`w-full flex items-center text-slate-500 hover:bg-slate-50 rounded-2xl transition-all ${isSubSidebarCollapsed ? "p-3 justify-center" : "px-4 py-3 gap-3"}`}
                >
                  <Users size={18} className="shrink-0" />
                  {!isSubSidebarCollapsed && <span className="text-sm font-semibold whitespace-nowrap">Student Roster</span>}
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
            <input type="text" placeholder="Search lectures or documents..." className="w-full pl-12 pr-4 py-3.5 bg-white border-none rounded-2xl text-sm outline-none font-medium" />
          </div>
          <div className="flex items-center gap-6">
            <button className="relative p-2 text-slate-400 hover:text-indigo-500 transition-colors">
              <Bell size={22} />
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-orange-500 rounded-full border-2 border-[#F4F7FE]"></span>
            </button>
            <button className="flex items-center gap-2 bg-linear-to-r from-purple-600 to-indigo-600 text-white px-6 py-3.5 rounded-2xl text-sm font-bold shadow-[0_8px_16px_rgba(99,102,241,0.3)] hover:scale-105 transition-all">
              <Plus size={18} /> Create Module
            </button>
          </div>
        </header>

        <div className="px-10 pb-10">
          <div className="flex justify-between items-end mb-6 mt-2">
            <div>
              <h1 className="text-3xl font-black text-slate-800 mb-2">Advanced Mechatronics & Kinematics</h1>
              <p className="text-slate-500 font-medium">Manage your course curriculum, upload lectures, and track engagement.</p>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-8">
            <div className="col-span-2 space-y-8">
              {activeTab === "lectures" && (
                <div className="w-full aspect-video bg-linear-to-br from-[#2A0845] to-[#6441A5] rounded-4xl overflow-hidden relative group cursor-pointer shadow-[0_16px_32px_rgba(100,65,165,0.25)] border border-white/10">
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors z-10 flex items-center justify-center">
                    <div className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
                      <PlayCircle size={40} className="text-white fill-white/20" />
                    </div>
                  </div>
                  <div className="w-full h-full flex items-end p-8 relative z-20 bg-linear-to-t from-black/80 via-black/20 to-transparent">
                    <div className="w-full">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="bg-pink-500 text-white text-xs font-black px-3 py-1 rounded-xl uppercase tracking-wider">Week 4</span>
                      </div>
                      <h3 className="text-white font-black text-2xl drop-shadow-md">Module 4: SCARA Manipulator Simulation</h3>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-4xl p-8 shadow-[0_8px_24px_rgba(0,0,0,0.02)] border border-slate-100">
                <h3 className="text-xl font-bold text-slate-800 mb-6">Course Materials ({materials.length})</h3>
                <div className="space-y-4">
                  {materials.map((mat) => {
                    const Icon = mat.icon;
                    return (
                      <div key={mat.id} className="flex items-center justify-between p-5 rounded-2xl border border-slate-100 bg-white group">
                        <div className="flex items-center gap-5">
                          <div className="w-12 h-12 rounded-xl bg-pink-50 text-pink-500 flex items-center justify-center">
                            <Icon size={24} />
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-800 text-base mb-1">{mat.title}</h4>
                            <p className="text-xs font-medium text-slate-500">{mat.type} • {mat.size}</p>
                          </div>
                        </div>
                        <button className="text-slate-300 hover:text-slate-500"><MoreVertical size={20} /></button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="col-span-1 space-y-8">
              <div 
                onClick={handleSimulatedUpload}
                className="border-2 border-dashed border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 rounded-4xl p-10 flex flex-col items-center justify-center text-center transition-all cursor-pointer group shadow-inner"
              >
                <div className="w-16 h-16 bg-white rounded-2xl shadow-[0_8px_16px_rgba(99,102,241,0.15)] flex items-center justify-center mb-6 group-hover:-translate-y-2 transition-transform duration-300">
                  <UploadCloud size={32} className="text-indigo-600" />
                </div>
                <h3 className="font-bold text-slate-800 mb-2 text-lg">Upload New Media</h3>
                <p className="text-sm font-medium text-slate-500 px-2 leading-relaxed">Click here to simulate an upload.</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}