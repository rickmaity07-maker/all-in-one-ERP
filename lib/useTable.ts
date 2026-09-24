"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { errorMessage, type Row } from "./utils";
import { toast } from "@/components/ui";

type Options = {
  orderBy?: string;
  ascending?: boolean;
  // Extra filters applied on load, e.g. { enrollment_status: "Active" }
  eq?: Record<string, string | number | boolean>;
  enabled?: boolean;
};

// Small CRUD wrapper around one Supabase table: loads rows, and keeps local state
// in sync after insert/update/delete. Every failure surfaces as a toast.
export function useTable(table: string, { orderBy = "created_at", ascending = false, eq, enabled = true }: Options = {}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const eqKey = JSON.stringify(eq ?? {});

  const fetchRows = useCallback(async () => {
    let query = supabase.from(table).select("*");
    for (const [k, v] of Object.entries(JSON.parse(eqKey) as Record<string, string>)) query = query.eq(k, v);
    const { data, error } = await query.order(orderBy, { ascending });
    if (error) toast(`Could not load ${table.replace(/_/g, " ")}: ${error.message}`, "error");
    return data ?? [];
  }, [table, orderBy, ascending, eqKey]);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setRows(await fetchRows());
    setLoading(false);
  }, [fetchRows, enabled]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchRows().then((data) => {
      if (cancelled) return;
      setRows(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchRows, enabled]);

  const insert = useCallback(
    async (values: Row, successMsg?: string) => {
      const { data, error } = await supabase.from(table).insert([values]).select();
      if (error || !data) {
        toast(errorMessage(error), "error");
        return null;
      }
      setRows((prev) => (ascending ? [...prev, data[0]] : [data[0], ...prev]));
      if (successMsg) toast(successMsg);
      return data[0] as Row;
    },
    [table, ascending]
  );

  const update = useCallback(
    async (id: string, values: Row, successMsg?: string) => {
      const { data, error } = await supabase.from(table).update(values).eq("id", id).select();
      if (error) {
        toast(errorMessage(error), "error");
        return false;
      }
      if (!data?.length) {
        toast("You don't have permission to change this record.", "error");
        return false;
      }
      setRows((prev) => prev.map((r) => (r.id === id ? data[0] : r)));
      if (successMsg) toast(successMsg);
      return true;
    },
    [table]
  );

  const remove = useCallback(
    async (id: string, successMsg?: string) => {
      const { data, error } = await supabase.from(table).delete().eq("id", id).select("id");
      if (error) {
        toast(errorMessage(error), "error");
        return false;
      }
      if (!data?.length) {
        toast("You don't have permission to delete this record.", "error");
        return false;
      }
      setRows((prev) => prev.filter((r) => r.id !== id));
      if (successMsg) toast(successMsg);
      return true;
    },
    [table]
  );

  return { rows, setRows, loading, reload, insert, update, remove };
}
