"use client";

import { useMemo, useState } from "react";
import { Wand2, Check, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Card, Empty, Table, Badge, toast } from "@/components/ui";
import { errorMessage, type Row } from "@/lib/utils";
import { generateTimetable, type Busy, type Section } from "@/lib/timetable";

// Admin tool: builds a clash-free weekly timetable for every section in a term and applies it.
export default function AutoSchedule({ classes, courses, terms, facilities, onApplied }: {
  classes: Row[]; courses: Row[]; terms: Row[]; facilities: Row[]; onApplied: () => void;
}) {
  const [termId, setTermId] = useState(terms.find((t) => t.is_current)?.id ?? terms[0]?.id ?? "");
  const [maxHours, setMaxHours] = useState(6);
  const [preview, setPreview] = useState<ReturnType<typeof generateTimetable> | null>(null);
  const [applying, setApplying] = useState(false);

  const inTerm = classes.filter((c) => c.term_id === termId);
  const rooms = facilities.filter((f) => f.bookable && ["classroom", "lecture_hall", "lab"].includes(f.type)).map((f) => ({ id: f.id, name: f.name, capacity: f.capacity }));

  const sections: Section[] = useMemo(
    () =>
      inTerm.map((c) => {
        const credits = courses.find((x) => x.id === c.course_id)?.credits ?? 5;
        return { id: c.id, name: c.name, teacherId: c.teacher_id, capacity: c.capacity ?? 20, sessionsPerWeek: credits >= 5 ? 2 : 1, durationMin: 90 };
      }),
    [inTerm, courses]
  );

  // Everything outside this term keeps its slot and blocks its teacher and room.
  const fixed: Busy[] = classes
    .filter((c) => c.term_id !== termId && c.days && c.start_time && c.end_time)
    .flatMap((c) => String(c.days).split(",").map((day) => ({ teacherId: c.teacher_id, roomId: c.facility_id, day, start: c.start_time, end: c.end_time })));

  const run = () => setPreview(generateTimetable(sections, rooms, fixed, { maxTeacherMinutesPerDay: maxHours * 60 }));

  const apply = async () => {
    if (!preview) return;
    setApplying(true);
    try {
      // Clear the old slots first so sections can swap times without tripping the clash checks.
      const ids = preview.assignments.map((a) => a.sectionId);
      const { error: clearError } = await supabase.from("classes").update({ days: null, start_time: null, end_time: null }).in("id", ids);
      if (clearError) throw clearError;
      for (const a of preview.assignments) {
        const room = rooms.find((r) => r.id === a.roomId);
        const { error } = await supabase.from("classes").update({ days: a.days.join(","), start_time: a.start, end_time: a.end, facility_id: a.roomId, room: room?.name ?? null }).eq("id", a.sectionId);
        if (error) throw error;
      }
      toast(`Timetable applied to ${preview.assignments.length} section(s).`);
      setPreview(null);
      onApplied();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
    setApplying(false);
  };

  const nameOf = (id: string) => inTerm.find((c) => c.id === id)?.name ?? id;
  const roomOf = (id: string) => rooms.find((r) => r.id === id)?.name ?? id;

  return (
    <Card title="Automatic timetable" action={
      <div className="flex flex-wrap gap-2 items-center">
        <select aria-label="Term to schedule" value={termId} onChange={(e) => { setTermId(e.target.value); setPreview(null); }} className="text-sm font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none">
          {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <label className="text-xs font-bold text-slate-500 flex items-center gap-2">Max hours/teacher/day
          <input aria-label="Max teaching hours per day" type="number" min="1" max="10" value={maxHours} onChange={(e) => setMaxHours(Number(e.target.value) || 6)} className="w-16 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
        </label>
        <button onClick={run} disabled={!sections.length || !rooms.length} className="flex items-center gap-2 text-sm font-bold text-white bg-indigo-600 px-4 py-2 rounded-xl disabled:opacity-40"><Wand2 size={16} /> Generate</button>
      </div>
    }>
      <p className="text-sm text-slate-500 mb-4">
        Places every section of the term so that no teacher or room is double-booked, rooms fit the class size, and teaching load is spread across the week.
        {" "}{sections.length} section(s), {rooms.length} bookable room(s) from Facilities.
      </p>
      {!rooms.length ? (
        <Empty>Add classrooms, labs or lecture halls under Facilities first.</Empty>
      ) : !sections.length ? (
        <Empty>No sections are assigned to this term yet.</Empty>
      ) : !preview ? (
        <Empty>Click “Generate” to preview a timetable.</Empty>
      ) : (
        <div className="space-y-4">
          <Table headers={["Section", "Days", "Time", "Room"]} empty={preview.assignments.length === 0 && "Nothing could be scheduled."}>
            {preview.assignments.map((a) => (
              <tr key={a.sectionId}>
                <td className="px-6 py-3 font-bold text-slate-800">{nameOf(a.sectionId)}</td>
                <td className="px-6 py-3">{a.days.join(", ")}</td>
                <td className="px-6 py-3">{a.start}–{a.end}</td>
                <td className="px-6 py-3">{roomOf(a.roomId)}</td>
              </tr>
            ))}
          </Table>
          {preview.unscheduled.map((u) => (
            <p key={u.section.id} className="text-sm text-red-600 flex items-center gap-2"><AlertTriangle size={14} /> {u.section.name}: {u.reason}</p>
          ))}
          <div className="flex items-center gap-3">
            <button onClick={apply} disabled={applying || !preview.assignments.length} className="flex items-center gap-2 text-sm font-bold text-white bg-emerald-600 px-5 py-2.5 rounded-xl disabled:opacity-40">
              {applying ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Apply timetable
            </button>
            <Badge color={preview.unscheduled.length ? "orange" : "green"}>{preview.assignments.length} placed • {preview.unscheduled.length} unplaced</Badge>
          </div>
        </div>
      )}
    </Card>
  );
}
