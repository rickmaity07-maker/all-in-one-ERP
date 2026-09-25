"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fmtDateTime, type Row } from "@/lib/utils";

// Live notifications (grades, notices, messages, approvals…) written by database triggers.
export default function NotificationBell({ userId, expanded }: { userId: string; expanded: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  // Screen position of the panel on wide screens. It is placed on the screen itself (position: fixed)
  // because the sidebar scrolls and would otherwise clip a panel sticking out to its right.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const toggle = () => {
    if (!open && button.current && window.matchMedia("(min-width: 768px)").matches) {
      const r = button.current.getBoundingClientRect();
      setPos({ left: r.right + 12, top: Math.max(8, Math.min(r.top, window.innerHeight - Math.min(window.innerHeight * 0.7, 560) - 8)) });
    } else {
      setPos(null);
    }
    setOpen(!open);
  };
  const panel = useRef<HTMLDivElement>(null);
  const instance = useId();

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(40)
      .then(({ data }) => !cancelled && setItems(data ?? []));
    const sub = supabase
      .channel(`notifications-${userId}-${instance}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload) =>
        setItems((prev) => (prev.some((n) => n.id === payload.new.id) ? prev : [payload.new as Row, ...prev].slice(0, 40)))
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(sub);
    };
  }, [userId, instance]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const unread = items.filter((n) => !n.read_at);

  const markRead = async (ids: string[]) => {
    if (!ids.length) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read_at: now } : n)));
    await supabase.from("notifications").update({ read_at: now }).in("id", ids);
  };

  const openItem = (n: Row) => {
    markRead([n.id]);
    setOpen(false);
    if (n.link) router.push(n.link);
  };

  return (
    <div className="relative" ref={panel}>
      <button
        ref={button}
        onClick={toggle}
        title="Notifications"
        aria-label={`Notifications${unread.length ? ` (${unread.length} unread)` : ""}`}
        className={`relative flex items-center rounded-2xl transition-all text-white/70 hover:text-white hover:bg-white/10 ${expanded ? "px-4 py-3 w-full" : "w-12 h-12 justify-center mx-auto"}`}
      >
        <Bell size={22} className="shrink-0" />
        {expanded && <span className="ml-4 font-semibold text-sm">Notifications</span>}
        {unread.length > 0 && (
          <span className={`absolute ${expanded ? "right-3" : "top-1.5 right-1.5"} min-w-5 h-5 px-1 rounded-full bg-pink-500 text-white text-[10px] font-black flex items-center justify-center`}>
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          style={pos ? { left: pos.left, top: pos.top } : undefined}
          className={`fixed ${pos ? "w-96" : "left-2 right-2 top-16"} max-h-[70vh] bg-white rounded-3xl shadow-2xl border border-slate-100 z-50 flex flex-col overflow-hidden`}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="font-black text-slate-800">Notifications</h3>
            <div className="flex items-center gap-2">
              <button onClick={() => markRead(unread.map((n) => n.id))} disabled={!unread.length} className="text-xs font-bold text-indigo-600 disabled:opacity-40 flex items-center gap-1">
                <CheckCheck size={14} /> Mark all read
              </button>
              <button onClick={() => setOpen(false)} aria-label="Close notifications" className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
            </div>
          </div>
          <div className="overflow-y-auto">
            {items.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-400">You&apos;re all caught up.</p>
            ) : (
              items.map((n) => (
                <button key={n.id} onClick={() => openItem(n)} className={`w-full text-left px-5 py-3 border-b border-slate-50 hover:bg-slate-50 flex gap-3 ${n.read_at ? "" : "bg-indigo-50/40"}`}>
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.read_at ? "bg-transparent" : "bg-indigo-500"}`} />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-800">{n.title}</span>
                    {n.body && <span className="block text-xs text-slate-500 line-clamp-2">{n.body}</span>}
                    <span className="block text-[10px] text-slate-400 mt-1">{fmtDateTime(n.created_at)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
