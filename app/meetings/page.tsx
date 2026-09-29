"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Plus, Trash2, UserRound, X, CheckCircle2, MapPin } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, isAdmin } from "@/lib/session";
import { ModuleShell, Modal, Field, SubmitButton, ActionButton, Card, Badge, Empty, Loading, AccessDenied, inputClass, toast, confirmAction } from "@/components/ui";
import { errorMessage, localDate, type Row } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type TabId = "slots" | "book" | "mine";
const LENGTHS = [10, 15, 20, 30];
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
const byDay = (rows: Row[]) => {
  const out: Record<string, Row[]> = {};
  for (const r of [...rows].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) (out[day(r.starts_at)] ??= []).push(r);
  return Object.entries(out);
};

// Parent–teacher meetings: teachers publish slots, parents book one about their child.
export default function Meetings() {
  const { role, profile } = useSession();
  const t = useT();
  const teacher = role === "teacher" || isAdmin(role);
  const parent = role === "parent";
  const [tab, setTab] = useState<TabId>(parent ? "book" : "slots");
  const [slots, setSlots] = useState<Row[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [teachers, setTeachers] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ date: localDate(), from: "16:00", to: "18:00", length: "15", location: "" });
  const [booking, setBooking] = useState<Row | null>(null);
  const [b, setB] = useState({ student_id: "", note: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [s, p, tt] = await Promise.all([
      supabase.from("meeting_slots").select("*").gte("ends_at", new Date(Date.now() - 86400_000).toISOString()).order("starts_at"),
      teacher ? supabase.from("profiles").select("id, full_name") : Promise.resolve({ data: [] as Row[] }),
      parent ? supabase.rpc("my_childrens_teachers") : Promise.resolve({ data: [] as Row[] }),
    ]);
    return { s: s.data ?? [], p: p.data ?? [], t: (tt.data ?? []) as Row[] };
  }, [teacher, parent]);
  const apply = (x: Awaited<ReturnType<typeof load>>) => {
    setSlots(x.s);
    setNames(Object.fromEntries(x.p.map((r) => [r.id, r.full_name])));
    setTeachers(x.t);
    setLoading(false);
  };
  useEffect(() => {
    let off = false;
    load().then((x) => !off && apply(x));
    return () => { off = true; };
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  const reload = async () => apply(await load());

  const teacherNames = useMemo(() => Object.fromEntries(teachers.map((x) => [x.teacher_id, x.teacher_name])), [teachers]);
  const childName = (id?: string) => names[id ?? ""] ?? teachers.find((x) => x.student_id === id)?.student_name ?? "—";

  if (!teacher && !parent) return <AccessDenied message="Parent meetings are for teachers and parents." />;

  // Teachers: publish a block of slots, e.g. 16:00–18:00 in 15-minute meetings.
  const addSlots = async (e: React.FormEvent) => {
    e.preventDefault();
    const start = new Date(`${f.date}T${f.from}`);
    const end = new Date(`${f.date}T${f.to}`);
    const len = Number(f.length) * 60_000;
    if (!(end > start)) return toast(t("End time must be after start time."), "error");
    if (start < new Date()) return toast(t("Slots must be in the future."), "error");
    const rows: Row[] = [];
    for (let s = start.getTime(); s + len <= end.getTime(); s += len) {
      rows.push({ teacher_id: profile?.id, starts_at: new Date(s).toISOString(), ends_at: new Date(s + len).toISOString(), location: f.location.trim() || null });
    }
    if (rows.length > 40) return toast(t("That's more than 40 slots — choose a shorter time or longer meetings."), "error");
    setBusy(true);
    let made = 0;
    let clash = 0;
    for (const r of rows) {
      const { error } = await supabase.from("meeting_slots").insert(r);
      if (!error) made++;
      else if (/overlap|conflict|exclusion/i.test(error.message)) clash++;
      else { setBusy(false); return toast(errorMessage(error), "error"); }
    }
    setBusy(false);
    toast(clash ? t("{n} slots added ({c} skipped: you already have something then).", { n: made, c: clash }) : t("{n} slots added.", { n: made }));
    setAdding(false);
    void reload();
  };
  const removeSlot = async (s: Row) => {
    if (!confirmAction(t("Remove this free slot?"))) return;
    const { error } = await supabase.from("meeting_slots").delete().eq("id", s.id);
    if (error) return toast(errorMessage(error), "error");
    toast(t("Slot removed."));
    void reload();
  };
  const cancel = async (s: Row) => {
    if (!confirmAction(t("Cancel this meeting? The other person is told."))) return;
    const { error } = await supabase.rpc("cancel_meeting", { p_slot: s.id });
    if (error) return toast(errorMessage(error), "error");
    toast(t("Meeting cancelled."));
    void reload();
  };
  const book = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!booking) return;
    setBusy(true);
    const { error } = await supabase.rpc("book_meeting", { p_slot: booking.id, p_student: b.student_id, p_note: b.note });
    setBusy(false);
    if (error) {
      toast(errorMessage(error), "error");
      return void reload();
    }
    toast(t("Meeting booked. The teacher has been told."));
    setBooking(null);
    setTab("mine");
    void reload();
  };

  const mine = slots.filter((s) => s.teacher_id === profile?.id && new Date(s.ends_at) > new Date());
  const myBookings = slots.filter((s) => s.booked_by === profile?.id && new Date(s.ends_at) > new Date());
  const free = slots.filter((s) => !s.booked_by && new Date(s.starts_at) > new Date());
  const childrenOf = (teacherId: string) => teachers.filter((x) => x.teacher_id === teacherId);
  const teacherIds = Array.from(new Set(teachers.map((x) => x.teacher_id)));

  const slotRow = (s: Row, actions: React.ReactNode, extra?: React.ReactNode) => (
    <div key={s.id} className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-slate-100">
      <span className="font-mono font-bold text-slate-800 w-28">{time(s.starts_at)}–{time(s.ends_at)}</span>
      {s.location && <span className="text-xs text-slate-500 flex items-center gap-1"><MapPin size={12} /> {s.location}</span>}
      <span className="flex-1 min-w-0 text-sm">{extra}</span>
      {actions}
    </div>
  );

  return (
    <ModuleShell
      title="Parent Meetings"
      icon={CalendarClock}
      tabs={[
        ...(teacher ? [{ id: "slots" as TabId, label: "My meeting slots", icon: CalendarClock }] : []),
        ...(parent ? [{ id: "book" as TabId, label: "Book a meeting", icon: Plus }, { id: "mine" as TabId, label: `My bookings (${myBookings.length})`, icon: CheckCircle2 }] : []),
      ]}
      activeTab={tab}
      onTab={setTab}
      action={teacher && tab === "slots" && <ActionButton icon={Plus} onClick={() => setAdding(true)}>Add slots</ActionButton>}
    >
      {adding && (
        <Modal title="Add meeting slots" icon={CalendarClock} onClose={() => setAdding(false)}>
          <form onSubmit={addSlots} className="space-y-4">
            <Field label="Date"><input type="date" required min={localDate()} className={inputClass} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="From"><input type="time" required className={inputClass} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
              <Field label="To"><input type="time" required className={inputClass} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
              <Field label="Each meeting">
                <select className={inputClass} value={f.length} onChange={(e) => setF({ ...f, length: e.target.value })}>
                  {LENGTHS.map((m) => <option key={m} value={m}>{t("{n} min", { n: m })}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Place or video link"><input className={inputClass} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder={t("e.g. Room 4")} /></Field>
            <SubmitButton busy={busy}>Add slots</SubmitButton>
          </form>
        </Modal>
      )}
      {booking && (
        <Modal title={`${t("Book")} ${day(booking.starts_at)} ${time(booking.starts_at)}`} icon={CalendarClock} onClose={() => setBooking(null)}>
          <form onSubmit={book} className="space-y-4">
            <p className="text-sm text-slate-600">{t("With")} <b>{teacherNames[booking.teacher_id]}</b>{booking.location ? ` · ${booking.location}` : ""}</p>
            <Field label="About">
              <select required className={inputClass} value={b.student_id} onChange={(e) => setB({ ...b, student_id: e.target.value })}>
                {childrenOf(booking.teacher_id).map((c) => <option key={c.student_id} value={c.student_id}>{c.student_name}</option>)}
              </select>
            </Field>
            <Field label="What would you like to discuss? (optional)"><textarea rows={2} maxLength={500} className={inputClass} value={b.note} onChange={(e) => setB({ ...b, note: e.target.value })} /></Field>
            <SubmitButton busy={busy}>Book meeting</SubmitButton>
          </form>
        </Modal>
      )}

      {loading ? <Loading /> : tab === "slots" ? (
        mine.length === 0 ? <Empty>No upcoming slots. Click “Add slots” to offer times for parents to book.</Empty> : (
          <div className="space-y-6">
            {byDay(mine).map(([d, rows]) => (
              <Card key={d} title={d}>
                <div className="space-y-2">
                  {rows.map((s) => slotRow(s,
                    s.booked_by
                      ? <button onClick={() => cancel(s)} className="text-xs font-bold text-red-600 flex items-center gap-1"><X size={14} /> {t("Cancel")}</button>
                      : <button onClick={() => removeSlot(s)} aria-label={t("Remove")} className="text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>,
                    s.booked_by
                      ? <span className="flex items-center gap-2"><Badge color="green">{t("booked")}</Badge><UserRound size={14} className="text-slate-400" /> {names[s.booked_by] ?? "—"} · {t("about")} <b>{childName(s.student_id)}</b>{s.note && <span className="text-slate-500"> — {s.note}</span>}</span>
                      : <Badge color="slate">{t("free")}</Badge>))}
                </div>
              </Card>
            ))}
          </div>
        )
      ) : tab === "book" ? (
        teacherIds.length === 0 ? <Empty>Your child isn&apos;t in any classes yet, so there is nobody to book.</Empty> : (
          <div className="space-y-6">
            {teacherIds.map((tid) => {
              const open = free.filter((s) => s.teacher_id === tid);
              const kids = childrenOf(tid);
              return (
                <Card key={tid} title={teacherNames[tid]}>
                  <p className="text-xs text-slate-500 mb-4">{kids.map((k) => `${k.student_name} · ${k.class_name}`).join(" — ")}</p>
                  {open.length === 0 ? <p className="text-sm text-slate-400">{t("No free times at the moment.")}</p> : (
                    <div className="space-y-4">
                      {byDay(open).map(([d, rows]) => (
                        <div key={d}>
                          <p className="text-xs font-bold uppercase text-slate-400 mb-2">{d}</p>
                          <div className="flex flex-wrap gap-2">
                            {rows.map((s) => (
                              <button key={s.id} onClick={() => { setBooking(s); setB({ student_id: kids[0]?.student_id ?? "", note: "" }); }}
                                className="px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 text-sm font-bold hover:bg-indigo-100">
                                {time(s.starts_at)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )
      ) : myBookings.length === 0 ? <Empty>No meetings booked.</Empty> : (
        <div className="space-y-2">
          {myBookings.map((s) => slotRow(s,
            <button onClick={() => cancel(s)} className="text-xs font-bold text-red-600 flex items-center gap-1"><X size={14} /> {t("Cancel")}</button>,
            <span>{day(s.starts_at)} · {t("with")} <b>{teacherNames[s.teacher_id] ?? "—"}</b> · {t("about")} {childName(s.student_id)}</span>))}
        </div>
      )}
    </ModuleShell>
  );
}
