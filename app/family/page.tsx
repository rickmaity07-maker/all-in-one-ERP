"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HeartHandshake, UserCheck, BookMarked, Wallet, AlertTriangle, Plane, GraduationCap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { Card, Empty, Loading, Badge, StatCard, AccessDenied } from "@/components/ui";
import { fmtDate, money, type Row } from "@/lib/utils";

type ChildData = {
  id: string;
  name: string;
  relationship: string;
  record: Row | null;
  classes: Row[];
  attendance: Row[];
  assessments: Row[];
  grades: Row[];
  invoices: Row[];
};

const rate = (rows: Row[]) => {
  const counted = rows.filter((r) => r.status !== "Excused");
  return counted.length ? Math.round((counted.filter((r) => r.status === "Present" || r.status === "Late").length / counted.length) * 100) : null;
};

function weighted(assessments: Row[], grades: Row[]) {
  let sum = 0;
  let weights = 0;
  for (const a of assessments) {
    const g = grades.find((x) => x.assessment_id === a.id);
    if (g?.score === null || g?.score === undefined) continue;
    sum += (Number(g.score) / Number(a.max_points)) * Number(a.weight);
    weights += Number(a.weight);
  }
  return weights ? Math.round((sum / weights) * 1000) / 10 : null;
}

// Parents see a read-only overview of each linked child. Row-level security limits every query to their own children.
export default function FamilyPortal() {
  const { role, profile } = useSession();
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState<ChildData[]>([]);

  useEffect(() => {
    if (role !== "parent" || !profile) return;
    let cancelled = false;
    (async () => {
      const { data: links } = await supabase.from("guardian_links").select("*").eq("guardian_id", profile.id);
      const ids = (links ?? []).map((l) => l.student_id);
      if (!ids.length) {
        if (!cancelled) setLoading(false);
        return;
      }
      const [names, records, enrollments, attendance, grades, invoices] = await Promise.all([
        supabase.from("profiles").select("id, full_name").in("id", ids),
        supabase.from("registrar_records").select("*").in("profile_id", ids),
        supabase.from("class_enrollments").select("*").in("student_id", ids),
        supabase.from("attendance").select("*").in("student_id", ids).order("session_date", { ascending: false }),
        supabase.from("grades").select("*").in("student_id", ids),
        supabase.from("invoices").select("*").in("student_id", ids).order("created_at", { ascending: false }),
      ]);
      const classIds = [...new Set((enrollments.data ?? []).map((e) => e.class_id))];
      const [classes, assessments] = await Promise.all([
        classIds.length ? supabase.from("classes").select("*").in("id", classIds) : Promise.resolve({ data: [] as Row[] }),
        classIds.length ? supabase.from("assessments").select("*").in("class_id", classIds) : Promise.resolve({ data: [] as Row[] }),
      ]);
      if (cancelled) return;
      setChildren(
        ids.map((id) => {
          const mine = (enrollments.data ?? []).filter((e) => e.student_id === id).map((e) => e.class_id);
          return {
            id,
            name: names.data?.find((n) => n.id === id)?.full_name ?? "Student",
            relationship: links?.find((l) => l.student_id === id)?.relationship ?? "Parent",
            record: records.data?.find((r) => r.profile_id === id) ?? null,
            classes: (classes.data ?? []).filter((c) => mine.includes(c.id)),
            attendance: (attendance.data ?? []).filter((a) => a.student_id === id),
            assessments: (assessments.data ?? []).filter((a) => mine.includes(a.class_id)),
            grades: (grades.data ?? []).filter((g) => g.student_id === id),
            invoices: (invoices.data ?? []).filter((i) => i.student_id === id),
          };
        })
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [role, profile]);

  if (role !== "parent") return <AccessDenied message="The family portal is for parents and guardians." />;

  return (
    <main className="flex-1 bg-[#F4F7FE] overflow-y-auto">
      <div className="px-4 md:px-10 py-6 md:py-10 space-y-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-800 mb-2 flex items-center gap-3"><HeartHandshake className="text-pink-500" /> My Children</h1>
          <p className="text-slate-500 font-medium">Attendance, grades and fees for each child linked to your account.</p>
        </div>

        {loading ? (
          <Loading label="Loading your family overview..." />
        ) : children.length === 0 ? (
          <Empty>No children are linked to your account yet. Please contact the school office.</Empty>
        ) : (
          children.map((c) => {
            const overall = rate(c.attendance);
            const due = c.invoices.filter((i) => i.status === "Pending").reduce((s, i) => s + Number(i.amount), 0);
            const absences = c.attendance.filter((a) => a.status === "Absent" || a.status === "Late").slice(0, 6);
            return (
              <section key={c.id} className="space-y-6" aria-label={c.name}>
                <div className="bg-linear-to-br from-[#2A0845] to-[#6441A5] rounded-3xl md:rounded-4xl p-6 md:p-8 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-black">{c.name}</h2>
                    <p className="text-white/70 font-medium">{c.relationship} • {c.record?.major ?? "No academic record yet"}{c.record?.enrollment_status ? ` • ${c.record.enrollment_status}` : ""}</p>
                  </div>
                  <Link href="/leave" className="bg-white/20 hover:bg-white/30 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 w-fit">
                    <Plane size={16} /> Report an absence
                  </Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                  <StatCard label="Attendance" value={overall === null ? "No sessions" : `${overall}%`} icon={overall !== null && overall < 80 ? AlertTriangle : UserCheck} color={overall !== null && overall < 80 ? "red" : "emerald"} />
                  <StatCard label="GPA" value={c.record?.gpa ?? "—"} icon={GraduationCap} color="indigo" />
                  <StatCard label="Balance Due" value={money(due)} icon={Wallet} color={due > 0 ? "orange" : "blue"} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card title="Grades by class">
                    {c.classes.length === 0 ? (
                      <Empty>Not enrolled in any classes yet.</Empty>
                    ) : (
                      <div className="space-y-3">
                        {c.classes.map((cls) => {
                          const list = c.assessments.filter((a) => a.class_id === cls.id);
                          const avg = weighted(list, c.grades);
                          const att = rate(c.attendance.filter((a) => a.class_id === cls.id));
                          return (
                            <div key={cls.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50">
                              <div className="flex items-center justify-between gap-3">
                                <p className="font-bold text-slate-800 flex items-center gap-2"><BookMarked size={16} className="text-indigo-500" /> {cls.name}</p>
                                <Badge color={avg === null ? "slate" : avg >= 60 ? "green" : "red"}>{avg === null ? "No grades" : `${avg}%`}</Badge>
                              </div>
                              <p className="text-xs text-slate-500 mt-1">{cls.teacher_name ?? "Teacher TBA"} • attendance {att === null ? "—" : `${att}%`}</p>
                              {list.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-3">
                                  {list.map((a) => {
                                    const g = c.grades.find((x) => x.assessment_id === a.id);
                                    return (
                                      <span key={a.id} className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1">
                                        {a.title}: <b>{g?.score ?? "—"}</b>/{a.max_points}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>

                  <div className="space-y-6">
                    <Card title="Recent absences & lates">
                      {absences.length === 0 ? (
                        <Empty>No absences recorded.</Empty>
                      ) : (
                        <div className="space-y-2">
                          {absences.map((a) => (
                            <div key={a.id} className="flex items-center justify-between text-sm p-3 rounded-xl border border-slate-100">
                              <span className="text-slate-700 font-semibold">{c.classes.find((x) => x.id === a.class_id)?.name ?? "Class"} • {fmtDate(a.session_date)}</span>
                              <Badge color={a.status === "Absent" ? "red" : "orange"}>{a.status}</Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                    <Card title="Invoices" action={<Link href="/finance" className="text-sm font-bold text-indigo-600">Open billing</Link>}>
                      {c.invoices.length === 0 ? (
                        <Empty>No invoices.</Empty>
                      ) : (
                        <div className="space-y-2">
                          {c.invoices.slice(0, 5).map((i) => (
                            <div key={i.id} className="flex items-center justify-between text-sm p-3 rounded-xl border border-slate-100">
                              <span className="text-slate-700">{i.description}</span>
                              <span className="flex items-center gap-2 font-bold">{money(i.amount)} <Badge color={i.status === "Paid" ? "green" : "orange"}>{i.status}</Badge></span>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  </div>
                </div>
              </section>
            );
          })
        )}
      </div>
    </main>
  );
}
