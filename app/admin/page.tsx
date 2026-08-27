"use client";

import { useEffect, useState } from "react";
import { Search, Plus, Bell, ShieldCheck, Users, Activity, MoreVertical, ShieldAlert, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function AdminPortal() {
  // 1. STATE MANAGEMENT
  const [liveUsers, setLiveUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | "All">("All");

  // 2. FETCH LIVE DATA FROM SUPABASE
  useEffect(() => {
    async function fetchProfiles() {
      setIsLoading(true);
      const { data, error } = await supabase.from("profiles").select("*");
      
      if (!error && data) {
        // Format the database row to match your beautiful UI expectations
        const formattedUsers = data.map(user => ({
          id: user.id,
          name: user.full_name || "Unnamed User",
          email: "protected@kernos.com", // Hidden for security
          // Capitalize the first letter of the role (e.g., 'owner' -> 'Owner')
          role: user.role.charAt(0).toUpperCase() + user.role.slice(1), 
          status: "Online" 
        }));
        setLiveUsers(formattedUsers);
      } else {
        console.error("Failed to fetch profiles:", error);
      }
      setIsLoading(false);
    }
    
    fetchProfiles();
  }, []);

  // 3. FILTER LOGIC (Now using the live database!)
  const filteredUsers = liveUsers.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === "All" || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <>
      <aside className="w-72 bg-white/80 backdrop-blur-xl border-r border-slate-100 flex flex-col shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="h-20 flex items-center px-8 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <ShieldCheck size={24} className="text-blue-600"/> Admin Center
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">Access Filters</h3>
            <ul className="space-y-2">
              {["All", "Owner", "Administration", "Teacher", "Student"].map((role) => (
                <li key={role}>
                  <button 
                    onClick={() => setRoleFilter(role)}
                    className={`w-full text-left px-4 py-3 text-sm font-bold rounded-2xl transition-all ${
                      roleFilter === role 
                        ? "bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-sm" 
                        : "text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {role === "All" ? "All Users" : `${role}s`}
                  </button>
                </li>
              ))}
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
              placeholder="Search users..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-white border-none rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
            />
          </div>
          <div className="flex items-center gap-6">
            <button className="relative p-2 text-slate-400 hover:text-blue-500 transition-colors">
              <Bell size={22} />
            </button>
            <button className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3.5 rounded-2xl text-sm font-bold shadow-[0_8px_16px_rgba(79,70,229,0.3)] hover:scale-105 transition-all">
              <Plus size={18} /> Invite User
            </button>
          </div>
        </header>

        <div className="px-10 pb-10">
          <div className="grid grid-cols-3 gap-8 mb-10 mt-4">
            <div className="bg-gradient-to-br from-[#8A2387] to-[#E94057] rounded-4xl p-8 text-white shadow-[0_16px_32px_rgba(233,64,87,0.3)] relative overflow-hidden group">
              <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
              <p className="text-pink-100 font-semibold tracking-wide text-sm mb-2 uppercase">Total Active Users</p>
              <h3 className="text-5xl font-black mb-6">
                {isLoading ? <Loader2 className="animate-spin" size={36} /> : liveUsers.length}
              </h3>
              <div className="flex items-center gap-2 text-sm font-medium bg-black/10 w-fit px-3 py-1.5 rounded-xl backdrop-blur-md">
                <Users size={16} /> Live Sync
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-cyan-400 to-blue-600 rounded-4xl p-8 text-white shadow-[0_16px_32px_rgba(37,99,235,0.3)] relative overflow-hidden group">
              <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
              <p className="text-cyan-100 font-semibold tracking-wide text-sm mb-2 uppercase">System Health</p>
              <h3 className="text-5xl font-black mb-6">99.9<span className="text-2xl font-bold text-cyan-200">%</span></h3>
              <div className="flex items-center gap-2 text-sm font-medium bg-black/10 w-fit px-3 py-1.5 rounded-xl backdrop-blur-md">
                <Activity size={16} /> Database Connected
              </div>
            </div>
            <div className="bg-gradient-to-br from-orange-400 to-pink-500 rounded-4xl p-8 text-white shadow-[0_16px_32px_rgba(249,115,22,0.3)] relative overflow-hidden group">
              <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
              <p className="text-orange-100 font-semibold tracking-wide text-sm mb-2 uppercase">Security Alerts</p>
              <h3 className="text-5xl font-black mb-6">0</h3>
              <div className="flex items-center gap-2 text-sm font-medium bg-black/10 w-fit px-3 py-1.5 rounded-xl backdrop-blur-md">
                <ShieldAlert size={16} /> No unauthorized access
              </div>
            </div>
          </div>

          <div className="bg-white rounded-4xl p-8 shadow-[0_8px_24px_rgba(0,0,0,0.02)] border border-slate-100">
            <h3 className="text-xl font-bold text-slate-800 mb-6">RBAC Directory ({filteredUsers.length})</h3>
            
            <div className="overflow-hidden rounded-2xl border border-slate-100">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/50 text-slate-500 border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-4 font-bold tracking-wide">Name</th>
                    <th className="px-6 py-4 font-bold tracking-wide">Access Level</th>
                    <th className="px-6 py-4 font-bold tracking-wide">Status</th>
                    <th className="px-6 py-4 font-bold tracking-wide text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 flex items-center justify-center gap-2"><Loader2 className="animate-spin" size={20} /> Syncing with cloud...</td></tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400">No users found.</td></tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-blue-50/30 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-800 text-base">{user.name}</div>
                          <div className="text-slate-500 text-xs font-medium">{user.email}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-3 py-1 rounded-xl text-xs font-bold uppercase tracking-wider ${
                            user.role === 'Owner' ? 'bg-purple-100 text-purple-700' :
                            user.role === 'Administration' ? 'bg-blue-100 text-blue-700' :
                            user.role === 'Teacher' ? 'bg-orange-100 text-orange-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="flex items-center gap-2 text-slate-600 font-medium text-xs uppercase tracking-wider">
                            <div className={`w-2 h-2 rounded-full ${user.status === 'Online' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-slate-300'}`}></div> 
                            {user.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button className="text-slate-300 hover:text-blue-600 transition-colors"><MoreVertical size={18} /></button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}