"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { NotebookPen, ChevronLeft, ChevronRight, CalendarDays, BarChart3 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, isStaff } from "@/lib/session";
import { usePeople } from "@/lib/useChildren";
import { ModuleShell, Field, Card, Badge, Empty, Loading, AccessDenied, inputClass, toast } from "@/components/ui";
import { errorMessage, localDate, type Row } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type TabId = "week" | "load";

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const monday = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));

// One week of homework for a student (students and parents), and how heavy each day is for a class (teachers).
export default function Homework() {
  const { role, profile } = useSession();
  const t = useT();
  const staff = isStaff(role);
  const { people, ready } = usePeople();
  const [tab, setTab] = useState<TabId>(staff ? "load" : "week");
  const [start, setStart] = useState(() => monday(new Date()));
  const [who, setWho] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [classes, setClasses] = useState<Row[]>([]);
  const [cls, setCls] = useState("");
  const [load, setLoad] = useState<Row[] | null>(null);
  const [heavy, setHeavy] = useState(3);

  const days = Array.from({ length: 7 }, (_, i) => localDate(addDays(start, i)));
  const student = who || people[0]?.id || "";
  const classId = cls || classes[0]?.id || "";

  useEffect(() => {
    let off = false;
    void supabase.from("app_settings").select("value").eq("key", "homework_daily_limit").maybeSingle().then(({ data }) => {
      if (!off && data) setHeavy(Number(data.value) || 3);
    });
    if (staff) {
      let q = supabase.from("classes").select("id, name").order("name");
      if (role === "teacher") q = q.eq("teacher_id", profile?.id ?? "");
      void q.then(({ data }) => !off && setClasses(data ?? []));
    }
    return () => { off = true; };
  }, [staff, role, profile?.id]);

  useEffect(() => {
    if (tab !== "week" || !student) return;
    let off = false;
    void supabase.rpc("homework_for", { p_student: student, p_from: days[0], p_to: days[6] }).then(({ data, error }) => {
      if (off) return;
      if (error) toast(errorMessage(error), "error");
      setRows(data ?? []);
    });
    return () => { off = true; };
  }, [tab, student, days[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab !== "load" || !classId) return;
    let off = false;
    void supabase.rpc("homework_load", { p_class: classId, p_from: days[0], p_to: days[6] }).then(({ data, error }) => {
      if (off) return;
      if (error) toast(errorMessage(error), "error");
      setLoad(data ?? []);
    });
    return () => { off = true; };
  }, [tab, classId, days[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  if (role === "alumni") return <AccessDenied message="The homework planner is for current students, their parents and staff." />;

  const today = localDate();
  const dayName = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const status = (h: Row) => (h.submitted ? { label: "Handed in", color: "green" } : h.due_date < today ? { label: "Missing", color: "red" } : { label: "To do", color: "blue" });
  const todo = (rows ?? []).filter((h) => !h.submitted && h.due_date >= today).length;
  const missing = (rows ?? []).filter((h) => !h.submitted && h.due_date < today).length;

  const weekNav = (
    <div className="flex items-center gap-2">
      <button onClick={() => setStart(addDays(start, -7))} aria-label={t("Previous week")} className="p-2 rounded-xl bg-slate-100"><ChevronLeft size={16} /></button>
      <button onClick={() => setStart(monday(new Date()))} className="px-3 py-2 rounded-xl bg-slate-100 text-sm font-bold">{t("This week")}</button>
      <button onClick={() => setStart(addDays(start, 7))} aria-label={t("Next week")} className="p-2 rounded-xl bg-slate-100"><ChevronRight size={16} /></button>
      <span className="text-sm font-semibold text-slate-500">{dayName(days[0])} – {dayName(days[6])}</span>
    </div>
  );

  const tabs = [
    ...(staff ? [{ id: "load" as TabId, label: "Class load", icon: BarChart3 }] : []),
    { id: "week" as TabId, label: staff ? "A student's week" : "This week", icon: CalendarDays },
  ];

  return (
    <ModuleShell title="Homework Planner" icon={NotebookPen} tabs={tabs} activeTab={tab} onTab={setTab}>
      {!ready ? <Loading /> : tab === "load" ? (
        <div className="space-y-4">
          {classes.length === 0 ? <Empty>You have no classes.</Empty> : (
            <>
              <Field label="Class">
                <select className={inputClass} value={classId} onChange={(e) => { if (e.target.value !== classId) setLoad(null); setCls(e.target.value); }}>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              {weekNav}
              <p className="text-sm text-slate-500">{t("The most homework any one student in this class already has due each day. More than {n} is a heavy day.", { n: heavy })}</p>
              {!load ? <Loading /> : (
                <div className="grid grid-cols-7 gap-2 items-end h-56" aria-label={t("Homework due each day")}>
                  {load.map((d) => {
                    const over = d.heaviest > heavy;
                    const full = d.heaviest >= heavy;
                    return (
                      <div key={d.day} className="flex flex-col items-center gap-1 h-full justify-end">
                        <span data-testid={`load-${d.day}`} className={`text-sm font-black ${over ? "text-red-600" : full ? "text-orange-600" : "text-slate-700"}`}>{d.heaviest}</span>
                        <div className={`w-full rounded-t-xl ${over ? "bg-red-400" : full ? "bg-orange-400" : "bg-indigo-300"}`} style={{ height: `${Math.min(100, (d.heaviest / Math.max(heavy + 1, 1)) * 100)}%`, minHeight: 4 }} />
                        <span className="text-[11px] text-slate-500 text-center">{dayName(d.day)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-slate-400">{t("Set homework on the E-Learning page; the due-date box warns you there too.")} <Link href="/e-learning" className="font-bold text-indigo-600">{t("Open E-Learning")}</Link></p>
            </>
          )}
        </div>
      ) : people.length === 0 ? <Empty>No children are linked to your account yet.</Empty> : (
        <div className="space-y-4">
          {people.length > 1 && (
            <Field label={staff ? "Student" : "Child"}>
              <select className={inputClass} value={student} onChange={(e) => { if (e.target.value !== student) setRows(null); setWho(e.target.value); }}>
                {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </Field>
          )}
          {weekNav}
          {rows && (
            <div className="flex flex-wrap gap-2" role="status">
              <Badge color="blue">{t("{n} to do", { n: todo })}</Badge>
              {missing > 0 && <Badge color="red">{t("{n} missing", { n: missing })}</Badge>}
            </div>
          )}
          {!rows ? <Loading /> : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-7 gap-3">
              {days.map((d) => {
                const due = rows.filter((h) => h.due_date === d);
                return (
                  <Card key={d} className={d === today ? "ring-2 ring-indigo-300" : ""}>
                    <p className={`text-xs font-black uppercase mb-2 ${due.length > heavy ? "text-red-600" : "text-slate-500"}`}>{dayName(d)}</p>
                    {due.length === 0 ? <p className="text-xs text-slate-300">—</p> : (
                      <ul className="space-y-2">
                        {due.map((h) => {
                          const s = status(h);
                          return (
                            <li key={h.id} className="text-sm" data-testid="homework-item">
                              <p className="font-bold text-slate-800 leading-tight">{h.title}</p>
                              {h.class_name && <p className="text-[11px] text-slate-500">{h.class_name}</p>}
                              <Badge color={s.color}>{t(s.label)}</Badge>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
          {role === "student" && todo > 0 && <Link href="/e-learning" className="inline-block text-sm font-bold text-indigo-600">{t("Hand in work on the E-Learning page")}</Link>}
        </div>
      )}
    </ModuleShell>
  );
}
