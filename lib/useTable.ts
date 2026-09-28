"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { errorMessage, type Row } from "./utils";
import { toast } from "@/components/ui";
import { cacheRows, cachedRows, isNetworkError, myQueuedOps, online, withId, writeOrQueue } from "./offline";

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
  // Only the newest load may update the rows (an older, slower response must not overwrite newer data).
  const loadSeq = useRef(0);
  // Loads still on their way. A change saved meanwhile would be overwritten by their older answer,
  // so after such a change the table is loaded again.
  const inFlight = useRef(0);
  // Rows saved on this device but not yet synced stay visible whatever a load returns.
  const apply = useCallback((fetched: Row[]) => {
    setRows((prev) => {
      const pending = prev.filter((r) => r._pending && !fetched.some((f) => f.id === r.id));
      return ascending ? [...fetched, ...pending] : [...pending, ...fetched];
    });
  }, [ascending]);
  const cacheKey = `${table}|${eqKey}|${orderBy}|${ascending}`;

  // The copy kept on this device, with the changes still waiting to sync applied (so they show after
  // reopening a page offline, even when the page was never loaded online on this device).
  const deviceRows = useCallback(async (): Promise<{ rows: Row[]; cachedAt: string } | null> => {
    const cached = await cachedRows(cacheKey);
    const waiting = (await myQueuedOps()).filter((o) => o.table === table && !o.error);
    if (!cached && !waiting.length) return null;
    let rows = cached?.rows ?? [];
    for (const op of waiting) {
      const vals = (Array.isArray(op.values) ? op.values : op.values ? [op.values] : []) as Row[];
      if (op.kind === "insert") rows = ascending ? [...rows, ...vals.map((v) => ({ ...v, _pending: true }))] : [...vals.map((v) => ({ ...v, _pending: true })), ...rows];
      if (op.kind === "update") rows = rows.map((r) => (r.id === op.id ? { ...r, ...vals[0], _pending: true } : r));
      if (op.kind === "delete") rows = rows.filter((r) => r.id !== op.id);
    }
    return { rows, cachedAt: cached?.at ?? new Date().toISOString() };
  }, [cacheKey, table, ascending]);

  // onSlow: called with the device copy when the server hasn't answered within a few seconds
  // (a phone that thinks it's online but has no signal), so the page isn't left empty meanwhile.
  const fetchRows = useCallback(async (onSlow?: (r: { rows: Row[]; cachedAt: string }) => void): Promise<{ rows: Row[]; cachedAt: string | null }> => {
    let query = supabase.from(table).select("*");
    for (const [k, v] of Object.entries(JSON.parse(eqKey) as Record<string, string>)) query = query.eq(k, v);
    let result: Awaited<typeof query> | null = null;
    const slow = onSlow ? setTimeout(() => void deviceRows().then((r) => r && onSlow(r)), 6000) : undefined;
    try {
      result = online() ? await query.order(orderBy, { ascending }) : null;
    } catch {
      result = null;
    } finally {
      clearTimeout(slow);
    }
    if (!result || (result.error && isNetworkError(result.error))) {
      const local = await deviceRows();
      if (local) return local;
      if (result?.error) toast(`Could not load ${table.replace(/_/g, " ")}: you're offline.`, "error");
      return { rows: [], cachedAt: null };
    }
    if (result.error) toast(`Could not load ${table.replace(/_/g, " ")}: ${result.error.message}`, "error");
    else void cacheRows(cacheKey, result.data ?? []);
    return { rows: (result.data ?? []) as Row[], cachedAt: null };
  }, [table, orderBy, ascending, eqKey, cacheKey, deviceRows]);

  // Refreshes in place: the rows on screen stay until the new ones arrive (no loading flash that
  // would reset what the page is showing, e.g. a confirmation message).
  const reload = useCallback(async () => {
    if (!enabled) return;
    const mine = ++loadSeq.current;
    inFlight.current++;
    const r = await fetchRows((early) => {
      if (mine === loadSeq.current) {
        apply(early.rows);
        setOfflineSince(early.cachedAt);
        setLoading(false);
      }
    }).finally(() => inFlight.current--);
    if (mine !== loadSeq.current) return;
    apply(r.rows);
    setOfflineSince(r.cachedAt);
    setLoading(false);
  }, [fetchRows, enabled, apply]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = () => {
      const mine = ++loadSeq.current;
      inFlight.current++;
      return fetchRows((early) => {
        if (!cancelled && mine === loadSeq.current) {
          apply(early.rows);
          setOfflineSince(early.cachedAt);
          setLoading(false);
        }
      }).finally(() => inFlight.current--).then((r) => {
        if (cancelled || mine !== loadSeq.current) return;
        apply(r.rows);
        setOfflineSince(r.cachedAt);
        setLoading(false);
      });
    };
    void load();
    // Once offline changes have reached the server, show the server's version (and drop the "pending" copies).
    const onSynced = () => {
      setRows((prev) => prev.filter((r) => !r._pending));
      void load();
    };
    window.addEventListener("erp:synced", onSynced);
    return () => {
      cancelled = true;
      window.removeEventListener("erp:synced", onSynced);
    };
  }, [fetchRows, enabled, apply]);

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
      if (inFlight.current) void reload();
      if (successMsg) toast(successMsg);
      return data[0] as Row;
    },
    [table, ascending, reload]
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
      if (inFlight.current) void reload();
      if (successMsg) toast(successMsg);
      return true;
    },
    [table, reload]
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
      if (inFlight.current) void reload();
      if (successMsg) toast(successMsg);
      return true;
    },
    [table, reload]
  );

  return { rows, setRows, loading, reload, insert, update, remove, offlineSince };
}
