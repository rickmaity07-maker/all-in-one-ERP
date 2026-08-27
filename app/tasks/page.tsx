"use client";

import { useState, useEffect } from "react";
import { Search, Plus, PlayCircle, Settings, Code, Wrench, Loader2, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function TasksPortal() {
  const [activeCategory, setActiveCategory] = useState<string | "all">("all");
  
  // LIVE DATABASE STATE
  const [tasks, setTasks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // MODAL STATE
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newCategory, setNewCategory] = useState("mechatronics");
  const [newType, setNewType] = useState("Hardware Config");

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setTasks(data);
    }
    setIsLoading(false);
  }

  // 1. CREATE TASK
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    setIsSubmitting(true);
    // We are storing Category in 'assignee' and Type in 'priority' to avoid altering your DB schema
    const { data, error } = await supabase
      .from('tasks')
      .insert([{ 
        task_title: newTaskTitle, 
        assignee: newCategory, 
        priority: newType, 
        status: 'Pending' 
      }])
      .select();

    if (!error && data) {
      setTasks([data[0], ...tasks]);
      setNewTaskTitle("");
      setNewType("");
      setIsModalOpen(false);
    }
    setIsSubmitting(false);
  };

  // 2. TOGGLE STATUS
  const toggleTaskStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === "Pending" ? "In Progress" : currentStatus === "In Progress" ? "Done" : "Pending";
    
    // Optimistic UI update
    setTasks(tasks.map(t => t.id === id ? { ...t, status: nextStatus } : t));
    
    // Cloud update
    await supabase.from('tasks').update({ status: nextStatus }).eq('id', id);
  };

  // 3. DELETE TASK
  const handleDelete = async (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
    await supabase.from('tasks').delete().eq('id', id);
  };

  // FILTER LOGIC
  const filteredTasks = activeCategory === "all" ? tasks : tasks.filter(t => t.assignee === activeCategory);

  // DYNAMIC ICON MAPPER
  const getCategoryDetails = (category: string) => {
    switch (category) {
      case 'horology': return { icon: PlayCircle, color: 'orange' };
      case 'software': return { icon: Code, color: 'pink' };
      default: return { icon: Wrench, color: 'blue' }; // mechatronics
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden relative">

      {/* CREATE TASK MODAL */}
      {isModalOpen && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-3xl p-8 w-[400px] shadow-2xl border border-slate-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800">New Task</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700"><X size={20}/></button>
            </div>
            
            <form onSubmit={handleAddTask} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Task Title</label>
                <input 
                  type="text" 
                  required
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. Calibrate SCARA Kinematics"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Category</label>
                <select 
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none cursor-pointer"
                >
                  <option value="mechatronics">Mechatronics</option>
                  <option value="horology">Horological Design</option>
                  <option value="software">Software Dev</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Workflow Type</label>
                <input 
                  type="text" 
                  required
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. SolidWorks CAD"
                />
              </div>
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full mt-4 flex items-center justify-center gap-2 bg-slate-900 text-white py-3.5 rounded-xl text-sm font-bold shadow-md hover:bg-slate-800 transition-colors disabled:opacity-70"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : "Save to Workspace"}
              </button>
            </form>
          </div>
        </div>
      )}

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
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-2xl transition-all ${activeCategory === "mechatronics" ? "bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-600 shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}
                >
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span> Mechatronics
                </button>
              </li>
              <li>
                <button 
                  onClick={() => setActiveCategory("horology")}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-2xl transition-all ${activeCategory === "horology" ? "bg-gradient-to-r from-orange-50 to-pink-50 text-orange-600 shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}
                >
                  <span className="w-2 h-2 rounded-full bg-orange-500"></span> Horological Design
                </button>
              </li>
              <li>
                <button 
                  onClick={() => setActiveCategory("software")}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-2xl transition-all ${activeCategory === "software" ? "bg-gradient-to-r from-pink-50 to-purple-50 text-pink-600 shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}
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
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3.5 rounded-2xl text-sm font-bold shadow-[0_8px_16px_rgba(79,70,229,0.3)] hover:scale-105 transition-all"
          >
            <Plus size={18} /> Create Task
          </button>
        </header>

        <div className="px-10 pb-10">
          <div className="bg-white rounded-4xl p-8 shadow-[0_8px_24px_rgba(0,0,0,0.02)] border border-slate-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800">Priority Workflow ({filteredTasks.length})</h3>
            </div>
            
            {isLoading ? (
              <div className="flex items-center gap-3 text-slate-500 py-8">
                <Loader2 className="animate-spin" /> Syncing tasks with cloud...
              </div>
            ) : (
              <div className="space-y-4">
                {filteredTasks.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 border border-slate-200 border-dashed rounded-3xl">No tasks in this category.</div>
                ) : (
                  filteredTasks.map((task) => {
                    const { icon: Icon, color } = getCategoryDetails(task.assignee);
                    return (
                      <div key={task.id} className="flex items-center justify-between p-5 rounded-2xl border border-slate-100 hover:shadow-md transition-all bg-white group">
                        <div className="flex items-center gap-5">
                          <div className={`w-12 h-12 rounded-xl bg-${color}-50 text-${color}-500 flex items-center justify-center shrink-0`}>
                            <Icon size={24} />
                          </div>
                          <div>
                            <h4 className={`font-bold text-base mb-1 ${task.status === 'Done' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{task.task_title}</h4>
                            <p className="text-xs font-medium text-slate-500 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span> {task.priority}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <button 
                            onClick={() => toggleTaskStatus(task.id, task.status)}
                            className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors
                              ${task.status === 'Done' ? 'bg-emerald-100 text-emerald-700' : 
                                task.status === 'In Progress' ? 'bg-orange-50 text-orange-600' : 
                                'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                          >
                            {task.status}
                          </button>
                          <button 
                            onClick={() => handleDelete(task.id)}
                            className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}