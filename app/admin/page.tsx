"use client";

import { useState, useEffect } from "react";
import { Search, ShieldCheck, Users, Mail, Plus, Loader2, X, Trash2, Key, Settings, AlertTriangle, ShieldAlert } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function AdminPortal() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"users" | "security">("users");

  // LIVE DATABASE STATE
  const [profiles, setProfiles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // MODAL STATE
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("student");

  useEffect(() => {
    setMounted(true);
    loadProfiles();
  }, []);

  async function loadProfiles() {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*');

    if (!error && data) {
      setProfiles(data);
    }
    setIsLoading(false);
  }

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim()) return;

    setIsSubmitting(true);
    
    // Generate a UUID for the new user profile
    const newId = crypto.randomUUID();

    const { data, error } = await supabase
      .from('profiles')
      .insert([{ 
        id: newId,
        full_name: inviteName, 
        role: inviteRole 
      }])
      .select();

    if (!error && data) {
      setProfiles([data[0], ...profiles]);
      setInviteName("");
      setInviteRole("student");
      setIsModalOpen(false);
    }
    setIsSubmitting(false);
  };

  const handleRevokeAccess = async (id: string) => {
    setProfiles(profiles.filter(p => p.id !== id));
    await supabase.from('profiles').delete().eq('id', id);
  };

  if (!mounted) return null;

  const admins = profiles.filter(p => ["owner", "administration"].includes(p.role));
  const staff = profiles.filter(p => p.role === "teacher");
  const students = profiles.filter(p => p.role === "student");

  return (
    <div className="flex h-screen w-full overflow-hidden relative">

      {/* INVITE USER MODAL */}
      {isModalOpen && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-3xl p-8 w-[400px] shadow-2xl border border-slate-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800">Provision New User</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700"><X size={20}/></button>
            </div>
            
            <form onSubmit={handleInviteUser} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Full Name</label>
                <input 
                  type="text" 
                  required
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. Dr. Weber"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">System Role</label>
                <select 
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none cursor-pointer"
                >
                  <option value="student">Student</option>
                  <option value="teacher">Faculty / Teacher</option>
                  <option value="administration">Administration</option>
                  <option value="owner">System Owner</option>
                </select>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mt-2 flex gap-3">
                <Mail size={16} className="text-blue-600 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-800 font-medium">An invitation email will be simulated, and their profile will be created in the database immediately.</p>
              </div>

              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full mt-4 flex items-center justify-center gap-2 bg-slate-900 text-white py-3.5 rounded-xl text-sm font-bold shadow-md hover:bg-slate-800 transition-colors disabled:opacity-70"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : "Send Invitation"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* CONTEXTUAL SIDEBAR */}
      <aside className="w-72 bg-white/80 backdrop-blur-xl border-r border-slate-100 flex flex-col shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="h-20 flex items-center px-8 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <ShieldCheck size={24} className="text-indigo-600"/> Global Admin
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">Access Control</h3>
            <ul className="space-y-2">
              <li>
                <button 
                  onClick={() => setActiveTab("users")}
                  className={`w-full text-left px-4 py-3 text-sm font-bold rounded-2xl transition-all ${activeTab === "users" ? "bg-gradient-to-r from-blue-50 to-indigo-50 text-indigo-700 shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}
                >
                  User Directory
                </button>
              </li>
              <li>
                <button 
                  onClick={() => setActiveTab("security")}
                  className={`w-full text-left px-4 py-3 text-sm font-bold rounded-2xl transition-all ${activeTab === "security" ? "bg-gradient-to-r from-blue-50 to-indigo-50 text-indigo-700 shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}
                >
                  Security Logs
                </button>
              </li>
            </ul>
          </div>
        </div>
      </aside>

      {/* MAIN WORKSPACE */}
      <main className="flex-1 bg-[#F4F7FE] flex flex-col min-w-0 overflow-y-auto">
        <header className="h-24 flex items-center justify-between px-10 shrink-0">
          <div className="relative w-96 shadow-[0_4px_20px_rgba(0,0,0,0.03)] rounded-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type="text" placeholder="Search profiles by name or role..." className="w-full pl-12 pr-4 py-3.5 bg-white border-none rounded-2xl text-sm outline-none font-medium" />
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3.5 rounded-2xl text-sm font-bold shadow-md hover:bg-slate-800 transition-colors"
          >
            <Plus size={18} /> Invite User
          </button>
        </header>

        <div className="px-10 pb-10">
          
          <div className="flex justify-between items-end mb-6 mt-2">
            <div>
              <h1 className="text-3xl font-black text-slate-800 mb-2">
                {activeTab === "users" ? "Identity & Access Management" : "System Security Logs"}
              </h1>
              <p className="text-slate-500 font-medium">
                {activeTab === "users" ? "Manage user accounts, permission levels, and system access." : "Monitor login attempts, database interactions, and administrative actions."}
              </p>
            </div>
          </div>

          {activeTab === "users" ? (
            // ==========================================
            // VIEW 1: USER DIRECTORY
            // ==========================================
            <>
              {/* METRICS ROW */}
              <div className="grid grid-cols-3 gap-6 mb-8">
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                    <ShieldCheck size={28} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Admins & Owners</p>
                    <h3 className="text-2xl font-black text-slate-800">{admins.length} Users</h3>
                  </div>
                </div>
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                    <Key size={28} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Faculty Staff</p>
                    <h3 className="text-2xl font-black text-slate-800">{staff.length} Users</h3>
                  </div>
                </div>
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                    <Users size={28} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Active Students</p>
                    <h3 className="text-2xl font-black text-slate-800">{students.length} Users</h3>
                  </div>
                </div>
              </div>

              {/* USERS TABLE */}
              <div className="bg-white rounded-4xl p-8 shadow-sm border border-slate-100">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-slate-800">Global Directory</h3>
                </div>
                
                <div className="overflow-hidden rounded-2xl border border-slate-100">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50/50 text-slate-500 border-b border-slate-100">
                      <tr>
                        <th className="px-6 py-4 font-bold">User</th>
                        <th className="px-6 py-4 font-bold">System Role</th>
                        <th className="px-6 py-4 font-bold">Account ID</th>
                        <th className="px-6 py-4 font-bold text-right">Access Control</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {isLoading ? (
                        <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500"><Loader2 className="animate-spin inline mr-2" /> Loading users...</td></tr>
                      ) : profiles.length === 0 ? (
                        <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400">No users found in the system. Invite someone!</td></tr>
                      ) : (
                        profiles.map((profile) => (
                          <tr key={profile.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs shrink-0">
                                  {profile.full_name.substring(0,2).toUpperCase()}
                                </div>
                                <span className="font-bold text-slate-800">{profile.full_name}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-3 py-1 rounded-xl text-xs font-bold uppercase tracking-wider ${
                                profile.role === 'owner' ? 'bg-purple-100 text-purple-700' :
                                profile.role === 'administration' ? 'bg-indigo-100 text-indigo-700' :
                                profile.role === 'teacher' ? 'bg-blue-100 text-blue-700' :
                                'bg-emerald-100 text-emerald-700'
                              }`}>
                                {profile.role}
                              </span>
                            </td>
                            <td className="px-6 py-4 font-mono text-xs text-slate-400 truncate max-w-[150px]">
                              {profile.id}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button 
                                onClick={() => handleRevokeAccess(profile.id)} 
                                className="text-xs font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors"
                              >
                                Revoke Access
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
          ) : (
            // ==========================================
            // VIEW 2: SECURITY LOGS
            // ==========================================
            <div className="bg-white rounded-4xl p-8 shadow-sm border border-slate-100 flex flex-col items-center justify-center py-24 text-center">
               <div className="w-20 h-20 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mb-4 border border-slate-100">
                 <ShieldAlert size={32} />
               </div>
               <h2 className="text-xl font-bold text-slate-700 mb-2">No Anomalies Detected</h2>
               <p className="text-slate-500 max-w-md">System telemetry and PostgreSQL access logs are operating normally. Database row-level security is active.</p>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}