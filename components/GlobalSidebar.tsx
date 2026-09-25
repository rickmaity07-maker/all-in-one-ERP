"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Book, CheckSquare, Shield, MessageSquare,
  Calendar, Wallet, LogOut, GraduationCap, Building,
  ClipboardCheck, Users as UsersIcon, Menu, ChevronLeft,
  Cpu, Briefcase, Library, Ticket, Car, LayoutDashboard, Settings,
  School, UserCheck, BookMarked, Megaphone, Plane, HeartHandshake, X,
  Layers, Route, DoorOpen, Award, Activity, Plug,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSession, type Role } from "@/lib/session";
import { initials } from "@/lib/utils";
import NotificationBell from "./NotificationBell";

type NavItem = { path: string; icon: LucideIcon; label: string; roles?: Role[] };

const EVERYONE_BUT_PARENTS: Role[] = ["owner", "administration", "teacher", "student"];

// One list drives the desktop sidebar and the phone menu.
const NAV: NavItem[] = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/family", icon: HeartHandshake, label: "My Children", roles: ["parent"] },
  { path: "/announcements", icon: Megaphone, label: "Notice Board" },
  { path: "/academics", icon: Layers, label: "Courses & Registration", roles: EVERYONE_BUT_PARENTS },
  { path: "/degree-audit", icon: Route, label: "Degree Audit" },
  { path: "/classes", icon: School, label: "Classes & Timetable", roles: EVERYONE_BUT_PARENTS },
  { path: "/attendance", icon: UserCheck, label: "Attendance", roles: EVERYONE_BUT_PARENTS },
  { path: "/gradebook", icon: BookMarked, label: "Gradebook", roles: EVERYONE_BUT_PARENTS },
  { path: "/e-learning", icon: Book, label: "E-Learning", roles: EVERYONE_BUT_PARENTS },
  { path: "/exams", icon: ClipboardCheck, label: "Examinations", roles: EVERYONE_BUT_PARENTS },
  { path: "/registrar", icon: GraduationCap, label: "Registrar (SIS)", roles: EVERYONE_BUT_PARENTS },
  { path: "/housing", icon: Building, label: "Housing & Facilities", roles: EVERYONE_BUT_PARENTS },
  { path: "/facilities", icon: DoorOpen, label: "Rooms & Assets", roles: EVERYONE_BUT_PARENTS },
  { path: "/credentials", icon: Award, label: "Credentials & Badges" },
  { path: "/chat", icon: MessageSquare, label: "Communications" },
  { path: "/calendar", icon: Calendar, label: "Master Calendar" },
  { path: "/leave", icon: Plane, label: "Leave & Absence" },
  { path: "/makerspace", icon: Cpu, label: "MakerSpace & Labs", roles: EVERYONE_BUT_PARENTS },
  { path: "/careers", icon: Briefcase, label: "Career & Portfolio", roles: EVERYONE_BUT_PARENTS },
  { path: "/library", icon: Library, label: "Digital Library", roles: EVERYONE_BUT_PARENTS },
  { path: "/campus-life", icon: Ticket, label: "Student Life" },
  { path: "/logistics", icon: Car, label: "Logistics & Transport" },
  { path: "/tasks", icon: CheckSquare, label: "Task Management", roles: ["owner", "administration", "teacher"] },
  { path: "/admissions", icon: UsersIcon, label: "Admissions CRM", roles: ["owner", "administration"] },
  { path: "/finance", icon: Wallet, label: "Finance & Billing", roles: ["owner", "administration", "student", "parent"] },
  { path: "/analytics", icon: Activity, label: "Analytics & Risk", roles: ["owner", "administration", "teacher"] },
  { path: "/integrations", icon: Plug, label: "Integrations & API", roles: ["owner", "administration"] },
  { path: "/admin", icon: Shield, label: "Global Admin", roles: ["owner", "administration"] },
];

export default function GlobalSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, role, signOut } = useSession();
  const [isExpanded, setIsExpanded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the phone menu after navigating.
  useEffect(() => {
    setMobileOpen(false); // eslint-disable-line react-hooks/set-state-in-effect
  }, [pathname]);

  if (pathname === "/" || pathname.startsWith("/verify")) return null;

  const items = NAV.filter((n) => !n.roles || n.roles.includes(role));
  const handleLogout = async () => {
    await signOut();
    router.push("/");
  };

  const renderLink = ({ path, icon: Icon, label }: NavItem, wide: boolean) => {
    const active = pathname.startsWith(path);
    return (
      <Link
        key={path}
        href={path}
        title={!wide ? label : ""}
        className={`flex items-center rounded-2xl transition-all group overflow-hidden shrink-0 ${
          active ? "text-white bg-white/20 shadow-[0_4px_12px_rgba(255,255,255,0.1)]" : "text-white/50 hover:text-white hover:bg-white/10"
        } ${wide ? "px-4 py-3 justify-start w-full" : "w-12 h-12 justify-center mx-auto"}`}
      >
        <Icon size={22} className="shrink-0 group-hover:scale-110 transition-transform" />
        {wide && <span className="ml-4 font-semibold text-sm whitespace-nowrap">{label}</span>}
      </Link>
    );
  };

  const identity = (wide: boolean) => (
    <div className={`shrink-0 bg-white/10 rounded-2xl flex items-center justify-center text-white shadow-inner border border-white/20 transition-all ${wide ? "py-3 px-4 justify-between w-full gap-3" : "w-12 h-12 flex-col mx-auto"}`}>
      {!wide ? (
        <>
          <span className="font-bold text-[9px] uppercase tracking-wider text-white/90">Role</span>
          <span className="text-[10px] uppercase font-black text-cyan-400">{role.substring(0, 3)}</span>
        </>
      ) : (
        <>
          <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs shrink-0">{initials(profile?.full_name)}</span>
          <span className="flex-1 min-w-0">
            <span className="block font-bold text-xs truncate">{profile?.full_name}</span>
            <span className="block text-[10px] uppercase font-black text-cyan-400">{role}</span>
          </span>
        </>
      )}
    </div>
  );

  const logoutButton = (wide: boolean) => (
    <button
      onClick={handleLogout}
      title={!wide ? "Log Out" : ""}
      className={`flex items-center text-pink-400 hover:text-pink-300 hover:bg-pink-500/20 rounded-2xl transition-all ${wide ? "px-4 py-3 justify-start w-full" : "w-12 h-12 justify-center mx-auto"}`}
    >
      <LogOut size={22} className="shrink-0" />
      {wide && <span className="ml-4 font-semibold text-sm whitespace-nowrap">Secure Log Out</span>}
    </button>
  );

  return (
    <>
      {/* PHONE: top bar + slide-out menu */}
      <div className="md:hidden h-14 shrink-0 z-40 bg-linear-to-r from-[#2A0845] to-[#6441A5] flex items-center justify-between px-4 text-white">
        <button onClick={() => setMobileOpen(true)} aria-label="Open menu" className="p-2 -ml-2"><Menu size={22} /></button>
        <span className="font-black tracking-tight">Kern OS</span>
        {profile && <NotificationBell userId={profile.id} expanded={false} />}
      </div>
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-72 max-w-[85%] h-full bg-linear-to-b from-[#2A0845] to-[#6441A5] flex flex-col p-5 gap-2 overflow-y-auto">
            <div className="flex items-center justify-between mb-3 text-white">
              <span className="font-black text-lg">Kern OS</span>
              <button onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={22} /></button>
            </div>
            {identity(true)}
            <div className="h-2" />
            {items.map((n) => renderLink(n, true))}
            <div className="mt-4 border-t border-white/10 pt-4 flex flex-col gap-2">
              {renderLink({ path: "/settings", icon: Settings, label: "Settings & Updates" }, true)}
              {logoutButton(true)}
            </div>
          </div>
          <button aria-label="Close menu" className="flex-1 bg-black/40" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* DESKTOP sidebar */}
      <nav className={`hidden md:flex bg-linear-to-b from-[#2A0845] to-[#6441A5] flex-col items-center py-6 justify-between shrink-0 shadow-[4px_0_24px_rgba(100,65,165,0.15)] z-20 transition-all duration-300 ease-in-out overflow-y-auto hide-scrollbar ${isExpanded ? "w-64" : "w-20"}`}>
        <div className={`flex flex-col gap-2 w-full ${isExpanded ? "px-6" : "px-4"}`}>
          <div className={`flex w-full items-center mb-4 ${isExpanded ? "justify-between" : "justify-center"}`}>
            {isExpanded && <span className="font-black text-white text-lg tracking-tight whitespace-nowrap">Kern OS</span>}
            <button onClick={() => setIsExpanded(!isExpanded)} className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all" aria-label="Toggle sidebar">
              {isExpanded ? <ChevronLeft size={20} /> : <Menu size={20} />}
            </button>
          </div>
          <div className="mb-2">{identity(isExpanded)}</div>
          {profile && <div className="mb-2"><NotificationBell userId={profile.id} expanded={isExpanded} /></div>}
          {items.map((n) => renderLink(n, isExpanded))}
        </div>

        <div className={`flex flex-col gap-2 w-full mt-4 shrink-0 ${isExpanded ? "px-6" : "px-4"}`}>
          {renderLink({ path: "/settings", icon: Settings, label: "Settings & Updates" }, isExpanded)}
          {logoutButton(isExpanded)}
        </div>
      </nav>
    </>
  );
}
