// Automatic timetable generation.
// Every section meets at the same time on one or more days (e.g. Mon + Wed, 09:00–10:30) in one room.
// Hard rules: no teacher or room is in two places at once, the room must hold the section's capacity,
// and nobody exceeds the daily teaching limit. Soft goal: spread each teacher's load evenly across the week.
// Sections are placed most-constrained first (biggest classes, fewest suitable rooms, most sessions).

export type Section = { id: string; name: string; teacherId: string | null; capacity: number; sessionsPerWeek: number; durationMin: number };
export type Room = { id: string; name: string; capacity: number };
export type Busy = { teacherId?: string | null; roomId?: string | null; day: string; start: string; end: string };
export type Assignment = { sectionId: string; days: string[]; start: string; end: string; roomId: string };
export type Options = { days?: string[]; dayStart?: string; dayEnd?: string; stepMin?: number; maxTeacherMinutesPerDay?: number };

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// Day combinations that keep a rest day between meetings where possible.
function dayPatterns(days: string[], n: number): string[][] {
  if (n <= 1) return days.map((d) => [d]);
  const out: string[][] = [];
  const pick = (start: number, acc: string[]) => {
    if (acc.length === n) return out.push(acc);
    for (let i = start; i < days.length; i++) pick(i + 1, [...acc, days[i]]);
  };
  pick(0, []);
  const gap = (p: string[]) => Math.min(...p.slice(1).map((d, i) => days.indexOf(d) - days.indexOf(p[i])));
  return out.sort((a, b) => gap(b) - gap(a));
}

export function generateTimetable(sections: Section[], rooms: Room[], fixed: Busy[] = [], opts: Options = {}) {
  const days = opts.days ?? ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const dayStart = toMin(opts.dayStart ?? "08:00");
  const dayEnd = toMin(opts.dayEnd ?? "18:00");
  const step = opts.stepMin ?? 30;
  const maxLoad = opts.maxTeacherMinutesPerDay ?? 6 * 60;

  const busy: { teacherId?: string | null; roomId?: string | null; day: string; s: number; e: number }[] = fixed.map((b) => ({
    teacherId: b.teacherId, roomId: b.roomId, day: b.day, s: toMin(b.start), e: toMin(b.end),
  }));
  const overlaps = (day: string, s: number, e: number, pred: (b: (typeof busy)[number]) => boolean) =>
    busy.some((b) => b.day === day && pred(b) && b.s < e && s < b.e);
  const teacherLoad = (t: string | null, day: string) =>
    t ? busy.filter((b) => b.teacherId === t && b.day === day).reduce((m, b) => m + (b.e - b.s), 0) : 0;

  const fitting = (sec: Section) => rooms.filter((r) => r.capacity >= sec.capacity).sort((a, b) => a.capacity - b.capacity);
  const order = [...sections].sort(
    (a, b) => fitting(a).length - fitting(b).length || b.capacity - a.capacity || b.sessionsPerWeek - a.sessionsPerWeek || a.name.localeCompare(b.name)
  );

  const assignments: Assignment[] = [];
  const unscheduled: { section: Section; reason: string }[] = [];

  for (const sec of order) {
    const candidates = fitting(sec);
    if (!candidates.length) {
      unscheduled.push({ section: sec, reason: `No room holds ${sec.capacity} students` });
      continue;
    }
    let best: { a: Assignment; score: number } | null = null;
    for (const pattern of dayPatterns(days, Math.min(sec.sessionsPerWeek, days.length))) {
      for (let s = dayStart; s + sec.durationMin <= dayEnd; s += step) {
        const e = s + sec.durationMin;
        if (sec.teacherId && pattern.some((d) => overlaps(d, s, e, (b) => b.teacherId === sec.teacherId))) continue;
        if (sec.teacherId && pattern.some((d) => teacherLoad(sec.teacherId, d) + sec.durationMin > maxLoad)) continue;
        const room = candidates.find((r) => !pattern.some((d) => overlaps(d, s, e, (b) => b.roomId === r.id)));
        if (!room) continue;
        // Lower is better: busy teacher days, wasted seats, then later start times.
        const load = pattern.reduce((m, d) => m + teacherLoad(sec.teacherId, d), 0);
        const score = load * 10 + (room.capacity - sec.capacity) + (s - dayStart) / 60;
        if (!best || score < best.score) best = { a: { sectionId: sec.id, days: pattern, start: toTime(s), end: toTime(e), roomId: room.id }, score };
      }
    }
    if (!best) {
      unscheduled.push({ section: sec, reason: "No free slot for this teacher and a suitable room" });
      continue;
    }
    assignments.push(best.a);
    for (const d of best.a.days) busy.push({ teacherId: sec.teacherId, roomId: best.a.roomId, day: d, s: toMin(best.a.start), e: toMin(best.a.end) });
  }
  return { assignments, unscheduled };
}
