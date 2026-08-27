"use client";

import { useState } from "react";
import { Search, Plus, Bell, MoreHorizontal, CheckCircle2, Clock, PlayCircle, Settings, Code, Wrench } from "lucide-react";

// 1. MOCK DATA
const MOCK_TASKS = [
  { id: 1, title: "Render Kern Watch Dial Assembly", category: "horology", status: "In Progress", type: "Blender Workflow", icon: PlayCircle, color: "orange" },
  { id: 2, title: "Calibrate SCARA Kinematics Solver", category: "mechatronics", status: "Pending", type: "Interactive Simulation", icon: Settings, color: "cyan" },
  { id: 3, title: "Compile Klipper firmware for LattePanda", category: "mechatronics", status: "In Progress", type: "Hardware Config", icon: Wrench, color: "blue" },
  { id: 4, title: "Design 6-inch Mud-Terrain Rover Wheel", category: "mechatronics", status: "Done", type: "SolidWorks CAD", icon: Wrench, color: "emerald" },
  { id: 5, title: "Optimize Ultra-Thin Dual-Barrel Escapement", category: "horology", status: "Pending", type: "Kinematic Analysis", icon: Settings, color: "purple" },
  { id: 6, title: "Deploy Next.js Portfolio to Vercel", category: "software", status: "In Progress", type: "Web Dev", icon: Code, color: "pink" },
];

export default function TasksPortal() {
  // 2. STATE MANAGEMENT
  const [activeCategory, setActiveCategory] = useState<string | "all">("all");
  const [tasks, setTasks] = useState(MOCK_TASKS);

  // Filter logic
  const filteredTasks = activeCategory === "all" ? tasks : tasks.filter(t => t.category === activeCategory);

  // Toggle status logic
  const toggleTaskStatus = (id: number) => {
    setTasks(tasks.map(t => {
      if (t.id === id) {
        const nextStatus = t.status === "Pending" ? "In Progress" : t.status === "In Progress" ? "Done" : "Pending";
        return { ...t, status: nextStatus };
      }
      return t;
    }));
  };

  return (
    <>
      <aside className="w-72 bg-white/80 backdrop-blur-xl border-r border-slate-100 flex flex-col shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="h-20 flex items-center px-8 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">Workspace</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">Categories</h3>
            <ul className="space-y-2">
              <li>
                <button 
                  onClick={() => setActiveCategory("all")}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-2xl transition-all ${activeCategory === "all" ? "bg-slate-800 text-white shadow-md" : "text-slate-500 hover:bg-slate-50"}`}
                >
                  All Projects
                </button>
              </li>
              <li>
                <button 
                  onClick={() => setActiveCategory("mechatronics")}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-2xl transition-all ${activeCategory === "mechatronics" ? "bg-linear-to-r from-blue-50 to-indigo-50 text-blue-600 shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}
                >
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span> Mechatronics
                </button>
              </li>
              <li>
                <button 
                  onClick={() => setActiveCategory("horology")}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-2xl transition-all ${activeCategory === "horology" ? "bg-linear-to-r from-orange-50 to-pink-50 text-orange-600 shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}
                >
                  <span className="w-2 h-2 rounded-full bg-orange-500"></span> Horological Design
                </button>
              </li>
              <li>
                <button 
                  onClick={() => setActiveCategory("software")}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-2xl transition-all ${activeCategory === "software" ? "bg-linear-to-r from-pink-50 to-purple-50 text-pink-600 shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}
                >
                  <span className="w-2 h-2 rounded-full bg-pink-500"></span> Software Dev
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
            <input type="text" placeholder="Search tasks..." className="w-full pl-12 pr-4 py-3.5 bg-white border-none rounded-2xl text-sm outline-none font-medium" />
          </div>
          <button className="flex items-center gap-2 bg-linear-to-r from-blue-600 to-indigo-600 text-white px-6 py-3.5 rounded-2xl text-sm font-bold shadow-[0_8px_16px_rgba(79,70,229,0.3)] hover:scale-105 transition-all">
            <Plus size={18} /> Create Task
          </button>
        </header>

        <div className="px-10 pb-10">
          <div className="bg-white rounded-4xl p-8 shadow-[0_8px_24px_rgba(0,0,0,0.02)] border border-slate-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800">Priority Workflow ({filteredTasks.length})</h3>
            </div>
            
            <div className="space-y-4">
              {filteredTasks.map((task) => {
                const Icon = task.icon;
                return (
                  <div key={task.id} className="flex items-center justify-between p-5 rounded-2xl border border-slate-100 hover:shadow-md transition-all bg-white group">
                    <div className="flex items-center gap-5">
                      <div className={`w-12 h-12 rounded-xl bg-${task.color}-50 text-${task.color}-500 flex items-center justify-center`}>
                        <Icon size={24} />
                      </div>
                      <div>
                        <h4 className={`font-bold text-base mb-1 ${task.status === 'Done' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{task.title}</h4>
                        <p className="text-xs font-medium text-slate-500 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span> {task.type}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <button 
                        onClick={() => toggleTaskStatus(task.id)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors
                          ${task.status === 'Done' ? 'bg-emerald-100 text-emerald-700' : 
                            task.status === 'In Progress' ? 'bg-orange-50 text-orange-600' : 
                            'bg-slate-100 text-slate-600'}`}
                      >
                        {task.status}
                      </button>
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