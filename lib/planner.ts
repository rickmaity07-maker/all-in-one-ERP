// Degree planner: orders a student's remaining courses into terms so that every prerequisite
// comes first and the degree finishes in as few terms as possible.
//
// Strategy (critical-path list scheduling): each term, take the courses whose prerequisites are
// already satisfied, preferring the ones that unlock the longest chain of later courses, then the
// programme's recommended term, until the credit limit for the term is reached.

export type PlanCourse = {
  id: string;
  code: string;
  title?: string;
  credits: number;
  prerequisites: string[];
  recommended_term?: number | null;
  requirement?: string;
};

export type PlanResult = {
  terms: { index: number; courses: PlanCourse[]; credits: number }[];
  blocked: { course: PlanCourse; reason: string }[];
};

export function planDegree(
  remaining: PlanCourse[],
  satisfied: Iterable<string>,
  maxCreditsPerTerm = 30,
  maxTerms = 20
): PlanResult {
  const done = new Set(satisfied);
  const pending = new Map(remaining.filter((c) => !done.has(c.id)).map((c) => [c.id, c]));
  const blocked: PlanResult["blocked"] = [];

  // Prerequisites that are neither satisfied nor part of the plan can never be met.
  // Decide against the full list first, then remove, so dependants get the right reason below.
  const outside = [...pending.values()].filter((c) => c.prerequisites.some((p) => !done.has(p) && !pending.has(p)));
  for (const c of outside) {
    blocked.push({ course: c, reason: "Requires a course outside this programme that has not been completed" });
    pending.delete(c.id);
  }
  // Remove anything that depends (directly or not) on a blocked course.
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of [...pending.values()]) {
      if (c.prerequisites.some((p) => blocked.some((b) => b.course.id === p))) {
        blocked.push({ course: c, reason: "Depends on a blocked course" });
        pending.delete(c.id);
        changed = true;
      }
    }
  }

  // Longest chain of courses that each course unlocks (its "height" in the dependency graph).
  const height = new Map<string, number>();
  const heightOf = (id: string, seen = new Set<string>()): number => {
    if (height.has(id)) return height.get(id)!;
    if (seen.has(id)) return 0; // cycle guard; cycles are reported below
    seen.add(id);
    const dependents = [...pending.values()].filter((c) => c.prerequisites.includes(id));
    const h = dependents.length ? 1 + Math.max(...dependents.map((d) => heightOf(d.id, seen))) : 0;
    height.set(id, h);
    return h;
  };
  for (const id of pending.keys()) heightOf(id);

  const terms: PlanResult["terms"] = [];
  for (let t = 1; pending.size && t <= maxTerms; t++) {
    const available = [...pending.values()]
      .filter((c) => c.prerequisites.every((p) => done.has(p)))
      .sort(
        (a, b) =>
          (height.get(b.id) ?? 0) - (height.get(a.id) ?? 0) ||
          (a.recommended_term ?? 99) - (b.recommended_term ?? 99) ||
          (a.requirement === "core" ? -1 : 0) - (b.requirement === "core" ? -1 : 0) ||
          a.code.localeCompare(b.code)
      );
    if (!available.length) break; // only cycles remain
    const picked: PlanCourse[] = [];
    let credits = 0;
    for (const c of available) {
      if (credits + c.credits > maxCreditsPerTerm && picked.length) continue;
      picked.push(c);
      credits += c.credits;
    }
    // Prerequisites taken this term only count from next term on.
    for (const c of picked) {
      pending.delete(c.id);
      done.add(c.id);
    }
    terms.push({ index: t, courses: picked, credits });
  }
  for (const c of pending.values()) blocked.push({ course: c, reason: "Circular prerequisites" });
  return { terms, blocked };
}
