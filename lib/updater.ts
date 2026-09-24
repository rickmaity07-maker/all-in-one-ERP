"use client";

import { useCallback, useEffect, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { isTauri } from "./utils";

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "none" }
  | { state: "available"; version: string; notes?: string }
  | { state: "downloading"; percent: number }
  | { state: "installing" }
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
