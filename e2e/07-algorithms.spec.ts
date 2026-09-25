import { test, expect } from "@playwright/test";
import { planDegree, type PlanCourse } from "../lib/planner";
import { generateTimetable, type Section, type Room } from "../lib/timetable";

// Pure logic: no browser needed.
const c = (id: string, credits: number, prerequisites: string[] = [], recommended_term: number | null = null): PlanCourse => ({
  id, code: id, credits, prerequisites, recommended_term, requirement: "core",
});

test.describe("Degree planner", () => {
  test("respects prerequisites and finishes in the fewest terms", () => {
    // A → B → C chain plus independent D, E; 10 credits per term.
    const courses = [c("A", 5), c("B", 5, ["A"]), c("C", 5, ["B"]), c("D", 5), c("E", 5)];
    const { terms, blocked } = planDegree(courses, [], 10);
    expect(blocked).toEqual([]);
    expect(terms.length).toBe(3); // the A→B→C chain needs 3 terms; that is the minimum
    const termOf = (id: string) => terms.find((t) => t.courses.some((x) => x.id === id))!.index;
    expect(termOf("A")).toBeLessThan(termOf("B"));
    expect(termOf("B")).toBeLessThan(termOf("C"));
    expect(termOf("A")).toBe(1); // the critical-path course is taken first
    for (const t of terms) expect(t.credits).toBeLessThanOrEqual(10);
  });

  test("courses already completed or in progress are skipped and unlock the rest", () => {
    const { terms } = planDegree([c("A", 5), c("B", 5, ["A"])], ["A"], 30);
    expect(terms).toHaveLength(1);
    expect(terms[0].courses.map((x) => x.id)).toEqual(["B"]);
  });

  test("impossible prerequisites and cycles are reported, not silently dropped", () => {
    const { blocked } = planDegree([c("X", 5, ["OUTSIDE"]), c("Y", 5, ["X"]), c("P", 5, ["Q"]), c("Q", 5, ["P"])], [], 30);
    const reasons = Object.fromEntries(blocked.map((b) => [b.course.id, b.reason]));
    expect(reasons.X).toMatch(/outside this programme/);
    expect(reasons.Y).toMatch(/blocked course/);
    expect(reasons.P).toMatch(/Circular/);
    expect(reasons.Q).toMatch(/Circular/);
  });

  test("a single large course still gets placed even if it exceeds the term limit", () => {
    const { terms } = planDegree([c("THESIS", 40)], [], 30);
    expect(terms[0].courses[0].id).toBe("THESIS");
  });
});

test.describe("Timetable generator", () => {
  const rooms: Room[] = [
    { id: "small", name: "Seminar", capacity: 20 },
    { id: "big", name: "Hall", capacity: 120 },
  ];
  const sec = (id: string, teacherId: string, capacity: number, sessionsPerWeek = 2, durationMin = 90): Section => ({
    id, name: id, teacherId, capacity, sessionsPerWeek, durationMin,
  });
  const clashes = (a: ReturnType<typeof generateTimetable>["assignments"], secs: Section[]) => {
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    const out: string[] = [];
    for (let i = 0; i < a.length; i++)
      for (let j = i + 1; j < a.length; j++) {
        const x = a[i], y = a[j];
        const sameDay = x.days.some((d) => y.days.includes(d));
        const overlap = toMin(x.start) < toMin(y.end) && toMin(y.start) < toMin(x.end);
        const tx = secs.find((s) => s.id === x.sectionId)!.teacherId, ty = secs.find((s) => s.id === y.sectionId)!.teacherId;
        if (sameDay && overlap && (x.roomId === y.roomId || tx === ty)) out.push(`${x.sectionId}/${y.sectionId}`);
      }
    return out;
  };

  test("schedules every section with no teacher or room clashes", () => {
    const secs = [sec("S1", "t1", 100), sec("S2", "t1", 15), sec("S3", "t2", 18), sec("S4", "t2", 90), sec("S5", "t3", 10, 3)];
    const { assignments, unscheduled } = generateTimetable(secs, rooms);
    expect(unscheduled).toEqual([]);
    expect(assignments).toHaveLength(5);
    expect(clashes(assignments, secs)).toEqual([]);
    for (const a of assignments) {
      const s = secs.find((x) => x.id === a.sectionId)!;
      expect(rooms.find((r) => r.id === a.roomId)!.capacity).toBeGreaterThanOrEqual(s.capacity);
      expect(a.days).toHaveLength(s.sessionsPerWeek);
    }
  });

  test("uses the smallest room that fits", () => {
    const { assignments } = generateTimetable([sec("tiny", "t1", 12, 1)], rooms);
    expect(assignments[0].roomId).toBe("small");
  });

  test("meetings of one section are spread across the week", () => {
    const { assignments } = generateTimetable([sec("S", "t1", 10, 2)], rooms);
    const order = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const [d1, d2] = assignments[0].days.map((d) => order.indexOf(d));
    expect(d2 - d1).toBeGreaterThanOrEqual(2);
  });

  test("avoids existing fixed commitments", () => {
    const fixed = ["Mon", "Tue", "Wed", "Thu", "Fri"].map((day) => ({ teacherId: "t1", day, start: "08:00", end: "12:00" }));
    const { assignments } = generateTimetable([sec("S", "t1", 10, 1)], rooms, fixed);
    expect(Number(assignments[0].start.slice(0, 2))).toBeGreaterThanOrEqual(12);
  });

  test("reports what cannot be scheduled and why", () => {
    const { unscheduled } = generateTimetable([sec("Huge", "t1", 500)], rooms);
    expect(unscheduled[0].reason).toMatch(/No room holds 500/);
  });

  test("respects the daily teaching limit and balances load", () => {
    const secs = Array.from({ length: 6 }, (_, i) => sec(`L${i}`, "busy", 10, 1, 120));
    const { assignments } = generateTimetable(secs, rooms, [], { maxTeacherMinutesPerDay: 240 });
    const perDay: Record<string, number> = {};
    for (const a of assignments) for (const d of a.days) perDay[d] = (perDay[d] ?? 0) + 120;
    expect(Math.max(...Object.values(perDay))).toBeLessThanOrEqual(240);
    expect(Object.keys(perDay).length).toBeGreaterThanOrEqual(3); // spread over several days
  });
});
