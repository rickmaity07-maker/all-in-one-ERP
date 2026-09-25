import { createClient, type SupportedStorage } from '@supabase/supabase-js';

// Values are baked in at build time from .env.local (locally) or GitHub secrets (release builds).
// Only ever use the public "anon" key here — the service_role key must never ship inside the app.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Where the sign-in session is kept. Browser engines write localStorage to disk only every few
// seconds, so closing the app right after signing in (common on phones) could forget the login.
// IndexedDB writes are on disk once the transaction completes. localStorage is kept in step too,
// as a fallback (private windows without IndexedDB) and for sessions saved by older versions.
const DB = 'erp-auth';
const STORE = 'kv';
let dbPromise: Promise<IDBDatabase | null> | null = null;
const openDb = () =>
  (dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  }));
const idb = async <T,>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> => {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, mode);
    const req = run(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = tx.onabort = () => resolve(undefined);
  });
};
const local = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
  remove: (k: string) => { try { localStorage.removeItem(k); } catch {} },
};
const durableStorage: SupportedStorage = {
  async getItem(key) {
    const v = await idb<string>('readonly', (s) => s.get(key));
    return typeof v === 'string' ? v : local.get(key);
  },
  async setItem(key, value) {
    local.set(key, value);
    await idb('readwrite', (s) => s.put(value, key));
  },
  async removeItem(key) {
    local.remove(key);
    await idb('readwrite', (s) => s.delete(key));
  },
};

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  { auth: { storage: typeof window !== 'undefined' ? durableStorage : undefined } },
);
