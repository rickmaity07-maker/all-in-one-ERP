"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { errorMessage, type Row } from "./utils";
import { toast } from "@/components/ui";
import { cacheRows, cachedRows, isNetworkError, online, withId, writeOrQueue } from "./offline";

type Options = {
  orderBy?: string;
  ascending?: boolean;
  // Extra filters applied on load, e.g. { enrollment_status: "Active" }
  eq?: Record<string, string | number | boolean>;
  enabled?: boolean;
};

export const SAVED_OFFLINE = "Saved on this device — it will sync when you're back online.";

// Small CRUD wrapper around one Supabase table: loads rows, and keeps local state
// in sync after insert/update/delete. Every failure surfaces as a toast.
// Offline, it shows the rows last loaded on this device and stores changes to sync later.
export function useTable(table: string, { orderBy = "created_at", ascending = false, eq, enabled = true }: Options = {}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  // When the rows came from the device because the server couldn't be reached: when they were saved.
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const eqKey = JSON.stringify(eq ?? {});
  const cacheKey = `${table}|${eqKey}|${orderBy}|${ascending}`;

  const fetchRows = useCallback(async (): Promise<{ rows: Row[]; cachedAt: string | null }> => {
    let query = supabase.from(table).select("*");
    for (const [k, v] of Object.entries(JSON.parse(eqKey) as Record<string, string>)) query = query.eq(k, v);
    let result: Awaited<typeof query> | null = null;
    try {
      result = online() ? await query.order(orderBy, { ascending }) : null;
    } catch {
      result = null;
    }
    if (!result || (result.error && isNetworkError(result.error))) {
      const cached = await cachedRows(cacheKey);
      if (cached) return { rows: cached.rows, cachedAt: cached.at };
      if (result?.error) toast(`Could not load ${table.replace(/_/g, " ")}: you're offline.`, "error");
      return { rows: [], cachedAt: null };
    }
    if (result.error) toast(`Could not load ${table.replace(/_/g, " ")}: ${result.error.message}`, "error");
    else void cacheRows(cacheKey, result.data ?? []);
    return { rows: (result.data ?? []) as Row[], cachedAt: null };
  }, [table, orderBy, ascending, eqKey, cacheKey]);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    const r = await fetchRows();
    setRows(r.rows);
    setOfflineSince(r.cachedAt);
    setLoading(false);
  }, [fetchRows, enabled]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchRows().then((r) => {
      if (cancelled) return;
      setRows(r.rows);
      setOfflineSince(r.cachedAt);
      setLoading(false);
    });
    // Once offline changes have reached the server, show the server's version.
    const onSynced = () => void fetchRows().then((r) => !cancelled && (setRows(r.rows), setOfflineSince(r.cachedAt)));
    window.addEventListener("erp:synced", onSynced);
    return () => {
      cancelled = true;
      window.removeEventListener("erp:synced", onSynced);
    };
  }, [fetchRows, enabled]);

  const insert = useCallback(
    async (values: Row, successMsg?: string) => {
      if (!online()) {
        const row = withId(values);
        await writeOrQueue({ table, kind: "insert", values: [row], label: successMsg ?? `New ${table.replace(/_/g, " ")}` });
        const local = { created_at: new Date().toISOString(), ...row, _pending: true };
        setRows((prev) => (ascending ? [...prev, local] : [local, ...prev]));
        toast(SAVED_OFFLINE);
        return local as Row;
      }
      const { data, error } = await supabase.from(table).insert([values]).select();
      if (error && isNetworkError(error)) {
        // The connection dropped mid-save: keep it on the device instead of losing it.
        const row = withId(values);
        await writeOrQueue({ table, kind: "insert", values: [row], label: successMsg ?? `New ${table.replace(/_/g, " ")}` });
        const local = { created_at: new Date().toISOString(), ...row, _pending: true };
        setRows((prev) => (ascending ? [...prev, local] : [local, ...prev]));
        toast(SAVED_OFFLINE);
        return local as Row;
      }
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
      const queueIt = async () => {
        await writeOrQueue({ table, kind: "update", id, values, label: successMsg ?? `Change to ${table.replace(/_/g, " ")}` });
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...values, _pending: true } : r)));
        toast(SAVED_OFFLINE);
        return true;
      };
      if (!online()) return queueIt();
      const { data, error } = await supabase.from(table).update(values).eq("id", id).select();
      if (error && isNetworkError(error)) return queueIt();
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
      const queueIt = async () => {
        await writeOrQueue({ table, kind: "delete", id, label: successMsg ?? `Delete from ${table.replace(/_/g, " ")}` });
        setRows((prev) => prev.filter((r) => r.id !== id));
        toast(SAVED_OFFLINE);
        return true;
      };
      if (!online()) return queueIt();
      const { data, error } = await supabase.from(table).delete().eq("id", id).select("id");
      if (error && isNetworkError(error)) return queueIt();
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

  return { rows, setRows, loading, reload, insert, update, remove, offlineSince };
}
