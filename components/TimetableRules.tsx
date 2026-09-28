"use client";

import { useState } from "react";
import { CalendarOff, UserX, UserCheck, Trash2, Plus, Clock } from "lucide-react";
import { useSession, isAdmin } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import { Card, Field, SubmitButton, Table, Badge, Empty, IconButton, inputClass, toast, confirmAction } from "@/components/ui";
import { fmtDate, localDate, type Row } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const weekday = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" });
const overlaps = (s1: string, e1: string, s2: string, e2: string) => s1 < e2 && s2 < e1;
const minutes = (s: string, e: string) => {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return m(e) - m(s);
};
const meetsOn = (c: Row, day: string) => String(c.days ?? "").split(",").map((d) => d.trim()).includes(day);

// Teachers record when they can't teach (used by the auto-scheduler); administrators record an
// absence and get the free, least-loaded colleagues suggested as cover for each affected class.
export default function TimetableRules({ classes, staff }: { classes: Row[]; staff: Row[] }) {
  const { role, profile } = useSession();
  const t = useT();
  const admin = isAdmin(role);
  const unavailability = useTable("teacher_unavailability", { orderBy: "day", ascending: true });
  const absences = useTable("teacher_absences", { orderBy: "absent_on", ascending: true });
  const covers = useTable("cover_assignments", { orderBy: "cover_date", ascending: true });
  const [slot, setSlot] = useState({ day: "Mon", start_time: "08:00", end_time: "12:00", reason: "" });
  const [absence, setAbsence] = useState({ teacher_id: "", absent_on: localDate(), reason: "" });
  const [busy, setBusy] = useState(false);

  const name = (id?: string) => staff.find((s) => s.id === id)?.full_name ?? "—";
  const today = localDate();
  const mine = unavailability.rows.filter((u) => u.teacher_id === profile?.id);
  const myCovers = covers.rows.filter((c) => c.substitute_id === profile?.id && c.cover_date >= today);

  const addSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (slot.end_time <= slot.start_time) return toast("End time must be after start time.", "error");
    setBusy(true);
    await unavailability.insert({ teacher_id: profile?.id, ...slot, reason: slot.reason || null }, "Saved. The timetable builder will keep this time free.");
    setBusy(false);
    setSlot({ ...slot, reason: "" });
  };
  const addAbsence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (absences.rows.some((a) => a.teacher_id === absence.teacher_id && a.absent_on === absence.absent_on)) return toast("That absence is already recorded.", "error");
    setBusy(true);
    await absences.insert({ teacher_id: absence.teacher_id, absent_on: absence.absent_on, reason: absence.reason || null }, "Absence recorded. Choose cover below.");
    setBusy(false);
  };

  // Who is free to cover this class on that date, least busy first.
  const suggestions = (cls: Row, date: string, absentId: string) => {
    const day = weekday(date);
    return staff
      .filter((s) => s.id !== absentId && s.id !== cls.teacher_id)
      .filter((s) => !absences.rows.some((a) => a.teacher_id === s.id && a.absent_on === date))
      .filter((s) => !unavailability.rows.some((u) => u.teacher_id === s.id && u.day === day && overlaps(u.start_time, u.end_time, cls.start_time, cls.end_time)))
      .filter((s) => !classes.some((c) => c.teacher_id === s.id && meetsOn(c, day) && c.start_time && overlaps(c.start_time, c.end_time, cls.start_time, cls.end_time)))
      .filter((s) => !covers.rows.some((cv) => cv.substitute_id === s.id && cv.cover_date === date && (() => {
        const other = classes.find((c) => c.id === cv.class_id);
        return other && overlaps(other.start_time, other.end_time, cls.start_time, cls.end_time);
      })()))
      .map((s): Row & { load: number } => ({
        ...s,
        load: classes.filter((c) => c.teacher_id === s.id && meetsOn(c, day) && c.start_time).reduce((m, c) => m + minutes(c.start_time, c.end_time), 0)
          + covers.rows.filter((cv) => cv.substitute_id === s.id && cv.cover_date === date).length * 60,
      }))
      .sort((a, b) => a.load - b.load);
  };

  const upcoming = absences.rows.filter((a) => a.absent_on >= today);

  return (
    <div className="space-y-6">
      {myCovers.length > 0 && (
        <Card title="My cover duties">
          <div className="space-y-2">
            {myCovers.map((cv) => {
              const c = classes.find((x) => x.id === cv.class_id);
              return (
                <div key={cv.id} className="flex flex-wrap items-center gap-3 text-sm p-3 rounded-xl bg-indigo-50/60">
                  <UserCheck size={16} className="text-indigo-600" />
                  <b>{c?.name ?? "—"}</b>
                  <span>{fmtDate(cv.cover_date)} · {c?.start_time}–{c?.end_time}</span>
                  {c?.room && <span className="text-slate-500">{c.room}</span>}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card title="When I can't teach">
        <p className="text-sm text-slate-500 mb-4">{t("Times you are never available (e.g. school run on Monday mornings). The automatic timetable keeps them free.")}</p>
        <form onSubmit={addSlot} className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end mb-4">
          <Field label="Day">
            <select className={inputClass} value={slot.day} onChange={(e) => setSlot({ ...slot, day: e.target.value })}>
              {DAYS.map((d) => <option key={d} value={d}>{t(d)}</option>)}
            </select>
          </Field>
          <Field label="From"><input type="time" className={inputClass} value={slot.start_time} onChange={(e) => setSlot({ ...slot, start_time: e.target.value })} /></Field>
          <Field label="To"><input type="time" className={inputClass} value={slot.end_time} onChange={(e) => setSlot({ ...slot, end_time: e.target.value })} /></Field>
          <Field label="Reason"><input className={inputClass} value={slot.reason} onChange={(e) => setSlot({ ...slot, reason: e.target.value })} placeholder={t("optional")} /></Field>
          <SubmitButton busy={busy}><Plus size={16} /> Add</SubmitButton>
        </form>
        {mine.length === 0 ? <p className="text-sm text-slate-400">{t("No blocked times.")}</p> : (
          <div className="flex flex-wrap gap-2">
            {mine.map((u) => (
              <span key={u.id} className="inline-flex items-center gap-2 text-sm bg-slate-100 rounded-xl px-3 py-1.5">
                <CalendarOff size={14} /> {t(u.day)} {u.start_time}–{u.end_time}{u.reason ? ` · ${u.reason}` : ""}
                <button onClick={() => unavailability.remove(u.id, "Removed.")} aria-label={t("Remove")} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
              </span>
            ))}
          </div>
        )}
      </Card>

      {admin && (
        <>
          <Card title="Everyone's blocked times">
            <Table headers={["Teacher", "Day", "Time", "Reason", ""]} empty={unavailability.rows.length === 0 && "No blocked times recorded."}>
              {unavailability.rows.map((u) => (
                <tr key={u.id}>
                  <td className="px-6 py-3 font-bold text-slate-800">{name(u.teacher_id)}</td>
                  <td className="px-6 py-3">{t(u.day)}</td>
                  <td className="px-6 py-3">{u.start_time}–{u.end_time}</td>
                  <td className="px-6 py-3 text-sm text-slate-500">{u.reason ?? "—"}</td>
                  <td className="px-6 py-3 text-right"><IconButton icon={Trash2} title="Remove" danger onClick={() => confirmAction("Remove this blocked time?") && unavailability.remove(u.id, "Removed.")} /></td>
                </tr>
              ))}
            </Table>
          </Card>

          <Card title="Cover for an absence">
            <form onSubmit={addAbsence} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end mb-6">
              <Field label="Absent teacher">
                <select required className={inputClass} value={absence.teacher_id} onChange={(e) => setAbsence({ ...absence, teacher_id: e.target.value })}>
                  <option value="">{t("Select…")}</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </Field>
              <Field label="Date"><input type="date" required min={today} className={inputClass} value={absence.absent_on} onChange={(e) => setAbsence({ ...absence, absent_on: e.target.value })} /></Field>
              <Field label="Reason"><input className={inputClass} value={absence.reason} onChange={(e) => setAbsence({ ...absence, reason: e.target.value })} placeholder={t("e.g. ill")} /></Field>
              <SubmitButton busy={busy}><UserX size={16} /> Record absence</SubmitButton>
            </form>

            {upcoming.length === 0 ? <Empty>No upcoming absences.</Empty> : (
              <div className="space-y-4">
                {upcoming.map((a) => {
                  const day = weekday(a.absent_on);
                  const affected = classes.filter((c) => c.teacher_id === a.teacher_id && meetsOn(c, day) && c.start_time).sort((x, y) => x.start_time.localeCompare(y.start_time));
                  return (
                    <div key={a.id} className="p-4 rounded-2xl border border-slate-100" aria-label={`Absence ${name(a.teacher_id)} ${a.absent_on}`}>
                      <div className="flex flex-wrap items-center gap-3 mb-3">
                        <Badge color="red">{t("absent")}</Badge>
                        <b className="text-slate-800">{name(a.teacher_id)}</b>
                        <span className="text-sm text-slate-500">{fmtDate(a.absent_on)} ({t(day)}){a.reason ? ` · ${a.reason}` : ""}</span>
                        <button onClick={() => confirmAction("Remove this absence and its cover?") && absences.remove(a.id, "Absence removed.")} className="ml-auto text-xs font-bold text-slate-400 hover:text-red-600">{t("Remove")}</button>
                      </div>
                      {affected.length === 0 ? <p className="text-sm text-slate-400">{t("No classes that day.")}</p> : (
                        <ul className="space-y-2">
                          {affected.map((c) => {
                            const cover = covers.rows.find((cv) => cv.class_id === c.id && cv.cover_date === a.absent_on);
                            const free = cover ? [] : suggestions(c, a.absent_on, a.teacher_id);
                            return (
                              <li key={c.id} className="flex flex-wrap items-center gap-3 text-sm">
                                <span className="font-semibold min-w-40"><Clock size={12} className="inline mr-1 text-slate-400" />{c.start_time}–{c.end_time} {c.name}</span>
                                {cover ? (
                                  <>
                                    <Badge color="green">{t("covered by")} {name(cover.substitute_id)}</Badge>
                                    <button onClick={() => covers.remove(cover.id, "Cover removed.")} className="text-xs text-slate-400 hover:text-red-600">{t("Change")}</button>
                                  </>
                                ) : free.length === 0 ? (
                                  <Badge color="orange">{t("nobody free")}</Badge>
                                ) : (
                                  free.slice(0, 3).map((s) => (
                                    <button key={s.id} onClick={() => covers.insert({ class_id: c.id, cover_date: a.absent_on, substitute_id: s.id, absence_id: a.id }, `${s.full_name} will cover ${c.name}.`)}
                                      className="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 font-bold hover:bg-indigo-100" title={t("{h} h teaching that day", { h: Math.round(s.load / 60 * 10) / 10 })}>
                                      {t("Assign")} {s.full_name}
                                    </button>
                                  ))
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
