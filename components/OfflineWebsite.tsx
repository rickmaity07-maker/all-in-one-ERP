"use client";

import { useEffect } from "react";
import { useSession } from "@/lib/session";
import { isTauri } from "@/lib/utils";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
// Pages worth having offline (the sidebar's main sections).
const PAGES = [
  "/", "/dashboard", "/announcements", "/classes", "/attendance", "/gradebook", "/e-learning", "/exams", "/finance",
  "/calendar", "/chat", "/tasks", "/logistics", "/campus-life", "/library", "/leave", "/family", "/meetings",
  "/interventions", "/credentials", "/settings", "/academics", "/degree-audit",
];

// Web version only: registers the service worker (public/sw.js) that lets the site open without a
// connection, and after sign-in asks it to save the main pages. The apps already carry their pages.
export default function OfflineWebsite() {
  const { profile } = useSession();
  useEffect(() => {
    if (isTauri() || !("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register(`${BASE}/sw.js?v=${process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"}`, { scope: `${BASE}/` }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!profile || isTauri() || !("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    const slash = BASE ? "/" : "";
    void navigator.serviceWorker.ready.then((reg) =>
      reg.active?.postMessage({ type: "warm", pages: PAGES.map((p) => (p === "/" ? "/" : `${p}${slash}`)) }));
  }, [profile]);
  return null;
}
