"use client";

import { supabase } from "./supabase";
import type { Row } from "./utils";

// Offline mode.
// Reads: the last rows each page loaded are kept on the device, so pages still show data offline.
// Writes: changes made without a connection are stored on the device (IndexedDB) and replayed in
// order as soon as the connection returns. New rows get their id on the device, so a replay that
// already reached the server is recognised (duplicate id) instead of creating a second copy.
// Everything is kept per signed-in user and never replayed under someone else's account.

export type QueuedOp = {
  key: string; // queue order + identity
  userId: string;
  table: string;
  kind: "insert" | "update" | "delete" | "upsert";
  values?: Row | Row[];
  id?: string; // update/delete target
  onConflict?: string; // upsert
  label: string; // shown to the user ("Register for 12 Mar")
  createdAt: string;
  error?: string; // set when the server refused it after reconnecting
};

const DB = "erp-offline";
let dbPromise: Promise<IDBDatabase | null> | null = null;
const openDb = () =>
  (dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("cache");
        req.result.createObjectStore("queue");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  }));
async function tx<T>(store: "cache" | "queue", mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    const t = db.transaction(store, mode);
    const req = run(t.objectStore(store));
    t.oncomplete = () => resolve(req.result);
    t.onerror = t.onabort = () => resolve(undefined);
  });
}

// "Failed to fetch" (Chromium), "Load failed" (WebKit), "NetworkError…" (Firefox): the request never reached the server.
export const isNetworkError = (e: unknown) =>
  /failed to fetch|load failed|networkerror|network request failed|fetch failed|ERR_INTERNET_DISCONNECTED|ERR_NETWORK/i.test(
    String((e as { message?: string })?.message ?? e ?? ""),
  );
export const online = () => typeof navigator === "undefined" || navigator.onLine;

// The signed-in user, remembered from auth events. (Asking supabase.auth.getSession() on every data
// load would queue each call behind the client's session lock and slow every page down.)
let userId: string | null | undefined;
let userKnown: () => void = () => {};
const firstAuthEvent = new Promise<void>((resolve) => (userKnown = resolve));
if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange((_event, session) => {
    userId = session?.user.id ?? null;
    userKnown();
  });
}
async function currentUser() {
  if (userId === undefined) await Promise.race([firstAuthEvent, new Promise((r) => setTimeout(r, 3000))]);
  return userId ?? null;
}

// ---------- Read cache ----------
export async function cacheRows(key: string, rows: Row[]) {
  const uid = await currentUser();
  if (uid) await tx("cache", "readwrite", (s) => s.put({ rows, at: new Date().toISOString() }, `${uid}|${key}`));
}
export async function cachedRows(key: string): Promise<{ rows: Row[]; at: string } | null> {
  const uid = await currentUser();
  if (!uid) return null;
  return ((await tx<{ rows: Row[]; at: string }>("cache", "readonly", (s) => s.get(`${uid}|${key}`))) as { rows: Row[]; at: string } | undefined) ?? null;
}

// ---------- Write queue ----------
type Listener = (state: { pending: number; failed: number; syncing: boolean }) => void;
const listeners = new Set<Listener>();
let syncing = false;
let lastState = { pending: 0, failed: 0, syncing: false };

export function onQueueChange(fn: Listener) {
  listeners.add(fn);
  fn(lastState);
  return () => void listeners.delete(fn);
}
async function allOps(): Promise<QueuedOp[]> {
  const all = ((await tx<QueuedOp[]>("queue", "readonly", (s) => s.getAll() as IDBRequest<QueuedOp[]>)) ?? []) as QueuedOp[];
  return all.sort((a, b) => a.key.localeCompare(b.key));
}
export async function myQueuedOps() {
  const uid = await currentUser();
  return (await allOps()).filter((o) => o.userId === uid);
}
async function publish() {
  const mine = await myQueuedOps();
  lastState = { pending: mine.filter((o) => !o.error).length, failed: mine.filter((o) => o.error).length, syncing };
  listeners.forEach((l) => l(lastState));
}

let seq = 0;
export async function enqueue(op: Omit<QueuedOp, "key" | "userId" | "createdAt">) {
  const uid = await currentUser();
  if (!uid) throw new Error("Sign in first.");
  const key = `${Date.now().toString().padStart(15, "0")}-${(seq++).toString().padStart(6, "0")}`;
  const full: QueuedOp = { ...op, key, userId: uid, createdAt: new Date().toISOString() };
  await tx("queue", "readwrite", (s) => s.put(full, key));
  await publish();
  return full;
}
export async function discard(key: string) {
  await tx("queue", "readwrite", (s) => s.delete(key));
  await publish();
}

// Gives new rows their id on the device so replays are idempotent.
const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16));
export const withId = (values: Row) => (values.id ? values : { ...values, id: uuid() });

async function send(op: QueuedOp) {
  const t = supabase.from(op.table);
  switch (op.kind) {
    case "insert":
      return (await t.insert(op.values as Row[])).error;
    case "upsert":
      return (await t.upsert(op.values as Row[], op.onConflict ? { onConflict: op.onConflict } : undefined)).error;
    case "update":
      return (await t.update(op.values as Row).eq("id", op.id!)).error;
    case "delete":
      return (await t.delete().eq("id", op.id!)).error;
  }
}

// Replays this user's queued changes in order. Stops at the first network failure (still offline);
// a change the server refuses is kept, marked with the reason, so the user can see and discard it.
export async function flush(): Promise<{ synced: number; failed: number }> {
  if (syncing || !online()) return { synced: 0, failed: 0 };
  const uid = await currentUser();
  if (!uid) return { synced: 0, failed: 0 };
  const ops = (await allOps()).filter((o) => o.userId === uid && !o.error);
  if (!ops.length) return { synced: 0, failed: 0 };
  syncing = true;
  await publish();
  let synced = 0;
  let failed = 0;
  try {
    for (const op of ops) {
      let error: { message: string; code?: string } | null | undefined;
      try {
        error = await send(op);
      } catch (e) {
        error = { message: String((e as Error)?.message ?? e) };
      }
      if (error && isNetworkError(error)) break;
      // Duplicate id on an insert: an earlier attempt already reached the server.
      if (!error || (op.kind === "insert" && error.code === "23505" && /_pkey/.test(error.message))) {
        await tx("queue", "readwrite", (s) => s.delete(op.key));
        synced++;
      } else {
        await tx("queue", "readwrite", (s) => s.put({ ...op, error: error.message }, op.key));
        failed++;
      }
    }
  } finally {
    syncing = false;
    await publish();
  }
  if (synced || failed) window.dispatchEvent(new CustomEvent("erp:synced", { detail: { synced, failed } }));
  return { synced, failed };
}

// Runs a write now, or queues it when there is no connection. Returns queued: true when it was stored on the device.
export async function writeOrQueue(op: Omit<QueuedOp, "key" | "userId" | "createdAt">): Promise<{ error: { message: string } | null; queued: boolean }> {
  if (online()) {
    try {
      const error = await send({ ...op, key: "", userId: "", createdAt: "" });
      if (!error || !isNetworkError(error)) return { error: error ?? null, queued: false };
    } catch (e) {
      if (!isNetworkError(e)) return { error: { message: String((e as Error)?.message ?? e) }, queued: false };
    }
  }
  await enqueue(op);
  return { error: null, queued: true };
}

let started = false;
export function startOfflineSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("online", () => void flush());
  // Mobile networks often come back without an "online" event; retry quietly while anything is waiting.
  setInterval(() => {
    if (lastState.pending > 0) void flush();
  }, 20_000);
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "INITIAL_SESSION") setTimeout(() => void flush().then(publish), 500);
  });
  void publish();
}
