"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";

export type Person = { id: string; full_name: string };

// The students a page is about: a parent's linked children, a student themself, or (for staff) every active student.
export function usePeople() {
  const { role, profile } = useSession();
  const [people, setPeople] = useState<Person[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!profile) return;
    let off = false;
    (async () => {
      let list: Person[] = [];
      if (role === "student") list = [{ id: profile.id, full_name: profile.full_name ?? "" }];
      else if (role === "parent") {
        const ids = ((await supabase.from("guardian_links").select("student_id").eq("guardian_id", profile.id)).data ?? []).map((l) => l.student_id);
        if (ids.length) list = ((await supabase.from("profiles").select("id, full_name").in("id", ids).order("full_name")).data ?? []) as Person[];
      } else if (role !== "alumni") {
        list = ((await supabase.from("profiles").select("id, full_name").eq("role", "student").eq("active", true).order("full_name")).data ?? []) as Person[];
      }
      if (!off) {
        setPeople(list);
        setReady(true);
      }
    })();
    return () => {
      off = true;
    };
  }, [role, profile]);

  return { people, ready };
}
