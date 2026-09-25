"use client";

import { useCallback, useEffect, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { isAndroidApp, isTauri, openExternal } from "./utils";

// Android updates are a new APK from the latest GitHub release (the desktop updater does not run on phones).
// latest.json is the file the desktop updater reads; fetched through the app (plugin-http), so there is
// no browser CORS and no GitHub API rate limit.
const REPO = "https://github.com/rickmaity07-maker/all-in-one-ERP";
const LATEST_JSON = `${REPO}/releases/latest/download/latest.json`;
let apkUrl: string | null = null;

const newer = (a: string, b: string) => {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
};

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "none" }
  | { state: "available"; version: string; notes?: string }
  | { state: "downloading"; percent: number }
  | { state: "installing" }
  | { state: "apk-opened"; version: string }
  | { state: "error"; message: string }
  | { state: "unsupported" };

// Shared across every component that uses the hook, so the banner and the
// Settings page show the same state and never download twice.
let status: UpdateStatus = { state: "idle" };
let pending: Update | null = null;
const listeners = new Set<(s: UpdateStatus) => void>();
const setStatus = (s: UpdateStatus) => {
  status = s;
  listeners.forEach((l) => l(s));
};

export async function checkForUpdate(): Promise<UpdateStatus> {
  if (!isTauri()) {
    setStatus({ state: "unsupported" });
    return status;
  }
  if (status.state === "downloading" || status.state === "installing") return status;
  setStatus({ state: "checking" });
  if (isAndroidApp()) {
    try {
      const { fetch: nativeFetch } = await import("@tauri-apps/plugin-http");
      const res = await nativeFetch(LATEST_JSON);
      if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
      const rel = await res.json();
      const latest = String(rel.version ?? "").replace(/^v/, "");
      apkUrl = null;
      if (latest && newer(latest, await getAppVersion())) {
        // The APK is attached a few minutes after the desktop build; only offer it once it exists.
        const url = `${REPO}/releases/download/v${latest}/all-in-one-erp-${latest}.apk`;
        const head = await nativeFetch(url, { method: "HEAD" });
        if (head.ok) apkUrl = url;
      }
      setStatus(apkUrl ? { state: "available", version: latest, notes: rel.notes ?? undefined } : { state: "none" });
    } catch (e) {
      setStatus({ state: "error", message: e instanceof Error ? e.message : String(e) });
    }
    return status;
  }
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    pending = await check();
    setStatus(pending ? { state: "available", version: pending.version, notes: pending.body ?? undefined } : { state: "none" });
  } catch (e) {
    setStatus({ state: "error", message: e instanceof Error ? e.message : String(e) });
  }
  return status;
}

export async function installUpdate() {
  if (isAndroidApp()) {
    if (!apkUrl) await checkForUpdate();
    if (!apkUrl || status.state !== "available") return;
    // The browser downloads the APK; opening it installs the update over this version (same signing key).
    const version = status.version;
    await openExternal(apkUrl);
    setStatus({ state: "apk-opened", version });
    return;
  }
  if (!pending) {
    const s = await checkForUpdate();
    if (s.state !== "available") return;
  }
  try {
    let total = 0;
    let done = 0;
    setStatus({ state: "downloading", percent: 0 });
    await pending!.downloadAndInstall((event) => {
      if (event.event === "Started") total = event.data.contentLength ?? 0;
      else if (event.event === "Progress") {
        done += event.data.chunkLength;
        setStatus({ state: "downloading", percent: total ? Math.min(100, Math.round((done / total) * 100)) : 0 });
      } else if (event.event === "Finished") setStatus({ state: "installing" });
    });
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (e) {
    setStatus({ state: "error", message: e instanceof Error ? e.message : String(e) });
  }
}

export async function getAppVersion(): Promise<string> {
  if (!isTauri()) return process.env.NEXT_PUBLIC_APP_VERSION ?? "web";
  const { getVersion } = await import("@tauri-apps/api/app");
  return getVersion();
}

export function useUpdater() {
  const [s, setS] = useState<UpdateStatus>(status);
  useEffect(() => {
    listeners.add(setS);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  const check = useCallback(() => checkForUpdate(), []);
  const install = useCallback(() => installUpdate(), []);
  return { status: s, check, install };
}
