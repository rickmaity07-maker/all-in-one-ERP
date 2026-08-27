"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { 
  Book, CheckSquare, Shield, User, MessageSquare, 
  Calendar, Wallet, LogOut, GraduationCap, Building, 
  ClipboardCheck, Users as UsersIcon, Menu, ChevronLeft
} from "lucide-react";
import { useState, useEffect } from "react";

export default function GlobalSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  
  const [userRole, setUserRole] = useState<string>("student");
  const [mounted, setMounted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedRole = localStorage.getItem("erp_mock_role");
    if (savedRole) setUserRole(savedRole);
  }, [pathname]);

  if (pathname === "/") return null;
  if (!mounted) return null;

  const isActive = (path: string) => pathname.startsWith(path);
  const handleLogout = () => {
    localStorage.removeItem("erp_mock_role");
    router.push("/");
  };

  // Helper function to keep our link rendering extremely clean
  const renderLink = (path: string, icon: any, label: string, visibleRoles?: string[]) => {
    if (visibleRoles && !visibleRoles.includes(userRole)) return null;
    
    const active = isActive(path);
    const Icon = icon;
    
    return (
      <Link 
        href={path} 
        title={!isExpanded ? label : ""}
        className={`flex items-center rounded-2xl transition-all group overflow-hidden ${
          active ? "text-white bg-white/20 shadow-[0_4px_12px_rgba(255,255,255,0.1)]" : "text-white/50 hover:text-white hover:bg-white/10"
        } ${isExpanded ? "px-4 py-3 justify-start w-full" : "w-12 h-12 justify-center mx-auto"}`}
      >
        <Icon size={22} className="shrink-0 group-hover:scale-110 transition-transform" />
        {isExpanded && <span className="ml-4 font-semibold text-sm whitespace-nowrap opacity-100 transition-opacity duration-300">{label}</span>}
      </Link>
    );
  };

  return (
    <nav className={`bg-linear-to-b from-[#2A0845] to-[#6441A5] flex flex-col items-center py-6 justify-between shrink-0 shadow-[4px_0_24px_rgba(100,65,165,0.15)] z-20 transition-all duration-300 ease-in-out overflow-y-auto hide-scrollbar ${isExpanded ? "w-64" : "w-20"}`}>
      
      <div className={`flex flex-col gap-2 w-full ${isExpanded ? "px-6" : "px-4"}`}>
        
        {/* Toggle Button & Header */}
        <div className={`flex w-full items-center mb-4 ${isExpanded ? "justify-between" : "justify-center"}`}>
          {isExpanded && <span className="font-black text-white text-lg tracking-tight whitespace-nowrap">Kern OS</span>}
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all"
          >
            {isExpanded ? <ChevronLeft size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Workspace Brand / Role Indicator */}
        <div className={`shrink-0 bg-white/10 rounded-2xl flex items-center justify-center text-white mb-4 shadow-inner border border-white/20 transition-all ${isExpanded ? "py-3 px-4 justify-between w-full" : "w-12 h-12 flex-col mx-auto"}`}>
          {!isExpanded ? (
            <>
              <span className="font-bold text-[9px] uppercase tracking-wider text-white/90">Role</span>
              <span className="text-[10px] uppercase font-black text-cyan-400">{userRole.substring(0,3)}</span>
            </>
          ) : (
            <>
              <span className="font-bold text-xs uppercase tracking-wider text-white/90">Current Role</span>
              <span className="text-xs uppercase font-black text-cyan-400">{userRole}</span>
            </>
          )}
        </div>
        
        {/* Navigation Links using the Helper */}
        {renderLink("/teacher", Book, "E-Learning")}
        {renderLink("/exams", ClipboardCheck, "Examinations")}
        {renderLink("/registrar", GraduationCap, "Registrar (SIS)")}
        {renderLink("/housing", Building, "Housing & Facilities")}
        {renderLink("/chat", MessageSquare, "Communications")}
        {renderLink("/calendar", Calendar, "Master Calendar")}
        
        {/* Role-Restricted Links */}
        {renderLink("/tasks", CheckSquare, "Task Management", ["owner", "administration", "teacher"])}
        {renderLink("/admissions", UsersIcon, "Admissions CRM", ["owner", "administration"])}
        {renderLink("/finance", Wallet, "Finance & Billing", ["owner", "administration"])}
        {renderLink("/admin", Shield, "Global Admin", ["owner", "administration"])}
      </div>
      
      {/* Bottom Profile / Logout */}
      <div className={`flex flex-col gap-2 w-full mt-4 shrink-0 ${isExpanded ? "px-6" : "px-4"}`}>
        <button 
          onClick={handleLogout} 
          title={!isExpanded ? "Log Out" : ""}
          className={`flex items-center text-pink-400 hover:text-pink-300 hover:bg-pink-500/20 rounded-2xl transition-all ${isExpanded ? "px-4 py-3 justify-start w-full" : "w-12 h-12 justify-center mx-auto"}`}
        >
          <LogOut size={22} className="shrink-0" />
          {isExpanded && <span className="ml-4 font-semibold text-sm whitespace-nowrap">Secure Log Out</span>}
        </button>
      </div>

    </nav>
  );
}