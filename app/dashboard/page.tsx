"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard, ClipboardCheck, Calendar, Wrench, GraduationCap, Wallet, Users, Book,
  ArrowRight, MessageSquare, Library, Megaphone, Pin, School, Clock,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, isAdmin, isStaff } from "@/lib/session";
import { Card, Empty, Loading, StatCard, Badge } from "@/components/ui";
import { fmtDate, money, type Row } from "@/lib/utils";

async function count(table: string, filter?: (q: ReturnType<typeof base>) => ReturnType<typeof base>) {
  let q = base(table);
  if (filter) q = filter(q);
  const { count: c } = await q;
  return c ?? 0;
}
const base = (table: string) => supabase.from(table).select("id", { count: "exact", head: true });

export default function Dashboard() {
  const { profile, role } = useSession();
  const profileId = profile?.id;
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [events, setEvents] = useState<Row[]>([]);
  const [exams, setExams] = useState<Row[]>([]);
  const [notices, setNotices] = useState<Row[]>([]);
  const [todayClasses, setTodayClasses] = useState<Row[]>([]);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const weekday = new Date().toLocaleDateString("en-US", { weekday: "short" });
      const [students, openTickets, materials, books, applicants, pendingInvoices, evts, exs, ann, cls, enr] = await Promise.all([
        count("registrar_records", (q) => q.eq("enrollment_status", "Active")),
        count("maintenance_tickets", (q) => q.neq("status", "Resolved")),
        count("course_materials"),
        count("library_books"),
        isAdmin(role) ? count("admissions", (q) => q.neq("status", "Approved")) : Promise.resolve(0),
        supabase.from("invoices").select("amount").eq("status", "Pending"),
        supabase.from("calendar_events").select("*").gte("event_date", today).order("event_date").limit(6),
        supabase.from("exams").select("*").eq("status", "Upcoming").order("created_at", { ascending: false }).limit(5),
        supabase.from("announcements").select("*").order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(3),
        supabase.from("classes").select("*").like("days", `%${weekday}%`).order("start_time"),
        supabase.from("class_enrollments").select("class_id"),
      ]);
      setNotices(ann.data ?? []);
      const enrolled = new Set((enr.data ?? []).map((e) => e.class_id));
      setTodayClasses(
        (cls.data ?? []).filter((c) => (isAdmin(role) ? false : isStaff(role) ? c.teacher_id === profileId : enrolled.has(c.id)))
      );
      setStats({
        students,
        openTickets,
        materials,
        books,
        applicants,
        outstanding: (pendingInvoices.data ?? []).reduce((s, r) => s + Number(r.amount), 0),
      });
      setEvents(evts.data ?? []);
      setExams(exs.data ?? []);
      setLoading(false);
    })();
  }, [role, profileId]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <main className="flex-1 bg-[#F4F7FE] overflow-y-auto">
      <div className="px-10 py-10 space-y-8">
        <div className="bg-linear-to-br from-[#2A0845] to-[#6441A5] rounded-4xl p-10 text-white shadow-lg relative overflow-hidden">
          <div className="absolute right-0 top-0 w-72 h-72 bg-cyan-500/20 rounded-full blur-3xl"></div>
          <div className="relative z-10">
            <p className="text-white/70 font-semibold flex items-center gap-2 mb-2"><LayoutDashboard size={18} /> Dashboard</p>
            <h1 className="text-4xl font-black mb-2">{greeting}, {profile?.full_name?.split(" ")[0]}.</h1>
            <p className="text-white/70 font-medium">
              Signed in as <span className="uppercase font-black text-cyan-300">{role}</span>. Here is what is happening across campus today.
            </p>
          </div>
        </div>

        {loading ? (
          <Loading label="Loading campus overview..." />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-6">
              {isStaff(role) && <StatCard label="Active Students" value={stats.students} icon={GraduationCap} color="indigo" />}
              <StatCard label="Open Tickets" value={stats.openTickets} icon={Wrench} color="orange" />
              <StatCard label="Course Resources" value={stats.materials} icon={Book} color="blue" />
              <StatCard label="Library Titles" value={stats.books} icon={Library} color="purple" />
              {isAdmin(role) && <StatCard label="Open Applications" value={stats.applicants} icon={Users} color="emerald" />}
              {(isAdmin(role) || role === "student") && (
                <StatCard label={role === "student" ? "My Balance Due" : "Outstanding Tuition"} value={money(stats.outstanding)} icon={Wallet} color="pink" />
              )}
            </div>

            {(notices.length > 0 || todayClasses.length > 0) && (
              <div className="grid grid-cols-2 gap-6">
                <Card title="Notice Board" action={<Link href="/announcements" className="text-sm font-bold text-indigo-600 flex items-center gap-1">All notices <ArrowRight size={14} /></Link>}>
                  {notices.length === 0 ? (
                    <Empty>No announcements.</Empty>
                  ) : (
                    <div className="space-y-3">
                      {notices.map((n) => (
                        <div key={n.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50">
                          <p className="font-bold text-slate-800 text-sm flex items-center gap-2">{n.pinned ? <Pin size={14} className="text-indigo-500" /> : <Megaphone size={14} className="text-slate-400" />} {n.title}</p>
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{n.body}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
                <Card title="Today's Classes" action={<Link href="/classes" className="text-sm font-bold text-indigo-600 flex items-center gap-1">Timetable <ArrowRight size={14} /></Link>}>
                  {todayClasses.length === 0 ? (
                    <Empty>No classes today.</Empty>
                  ) : (
                    <div className="space-y-3">
                      {todayClasses.map((c) => (
                        <div key={c.id} className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-slate-50/50">
                          <div className="flex items-center gap-3">
                            <School size={18} className="text-indigo-500" />
                            <div>
                              <p className="font-bold text-slate-800 text-sm">{c.name}</p>
                              <p className="text-xs text-slate-500">{c.room || "Room TBA"}{isStaff(role) ? "" : ` • ${c.teacher_name ?? ""}`}</p>
                            </div>
                          </div>
                          <span className="text-xs font-bold text-slate-600 flex items-center gap-1"><Clock size={12} /> {c.start_time}–{c.end_time}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            )}

            <div className="grid grid-cols-2 gap-6">
              <Card title="Upcoming Events" action={<Link href="/calendar" className="text-sm font-bold text-indigo-600 flex items-center gap-1">Calendar <ArrowRight size={14} /></Link>}>
                {events.length === 0 ? (
                  <Empty>Nothing scheduled.</Empty>
                ) : (
                  <div className="space-y-3">
                    {events.map((e) => (
                      <div key={e.id} className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-slate-50/50">
                        <div className="flex items-center gap-3">
                          <Calendar size={18} className="text-indigo-500" />
                          <div>
                            <p className="font-bold text-slate-800 text-sm">{e.event_title}</p>
                            <p className="text-xs text-slate-500">{fmtDate(e.event_date)} {e.start_time ? `• ${e.start_time}` : ""} {e.location ? `• ${e.location}` : ""}</p>
                          </div>
                        </div>
                        <Badge color="blue">{e.event_type}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card title="Upcoming Exams" action={<Link href="/exams" className="text-sm font-bold text-indigo-600 flex items-center gap-1">Exams <ArrowRight size={14} /></Link>}>
                {exams.length === 0 ? (
                  <Empty>No upcoming exams.</Empty>
                ) : (
                  <div className="space-y-3">
                    {exams.map((e) => (
                      <div key={e.id} className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-slate-50/50">
                        <div className="flex items-center gap-3">
                          <ClipboardCheck size={18} className="text-blue-500" />
                          <div>
                            <p className="font-bold text-slate-800 text-sm">{e.course_name}</p>
                            <p className="text-xs text-slate-500">{e.exam_date} {e.location ? `• ${e.location}` : ""}</p>
                          </div>
                        </div>
                        <Badge color="purple">{e.exam_type}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <div className="grid grid-cols-4 gap-4">
              {[
                { href: "/chat", label: "Open Messages", icon: MessageSquare },
                { href: "/e-learning", label: "Course Content", icon: Book },
                { href: "/housing", label: "Report an Issue", icon: Wrench },
                { href: "/library", label: "Browse Library", icon: Library },
              ].map((l) => (
                <Link key={l.href} href={l.href} className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm flex items-center gap-3 font-bold text-slate-700 hover:border-indigo-200 hover:text-indigo-700 transition-all">
                  <l.icon size={20} /> {l.label}
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
