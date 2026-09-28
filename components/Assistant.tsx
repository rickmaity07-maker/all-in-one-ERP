"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, Loader2, Database, KeyRound, WifiOff, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, type Role } from "@/lib/session";
import { useLanguage, useT } from "@/lib/i18n";

type Source = { kind: string; name: string; rows: number };
type Msg = { role: "user" | "assistant"; content: string; sources?: Source[]; error?: "not_configured" | "offline" | "failed" };

const SUGGESTIONS: Record<string, string[]> = {
  teacher: ["Which of my students are slipping, and why?", "Draft a note to parents about Friday's trip", "Summarise attendance in my classes this week"],
  student: ["What do I still need to graduate?", "How am I doing in my classes?", "Do I owe any fees?"],
  parent: ["How is my child doing at school?", "Explain my child's fees", "When does my child's bus arrive?"],
  admin: ["Which students are at high risk, and why?", "Which students have an account hold?", "Summarise today's absences"],
  alumni: ["What credentials do I hold?", "Which campaigns can I support?"],
};
const suggestionsFor = (role: Role) =>
  SUGGESTIONS[role === "owner" || role === "administration" ? "admin" : role] ?? SUGGESTIONS.student;

// Light formatting for replies: **bold** and "- " bullets.
function Formatted({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => {
        const bullet = /^\s*[-•*]\s+/.test(line);
        const parts = line.replace(/^\s*[-•*]\s+/, "").split(/(\*\*[^*]+\*\*)/g);
        const body = parts.map((p, j) => (p.startsWith("**") && p.endsWith("**") ? <b key={j}>{p.slice(2, -2)}</b> : p));
        return bullet ? <li key={i} className="ml-4 list-disc">{body}</li> : <p key={i} className={line.trim() ? "" : "h-2"}>{body}</p>;
      })}
    </>
  );
}

export function AssistantButton({ expanded, compact }: { expanded?: boolean; compact?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={t("Ask AI")}
        aria-label={t("Ask AI")}
        className={
          compact
            ? "p-2 text-white"
            : `flex items-center rounded-2xl text-amber-200 hover:text-white hover:bg-white/10 transition-all ${expanded ? "px-4 py-3 justify-start w-full" : "w-12 h-12 justify-center mx-auto"}`
        }
      >
        <Sparkles size={22} className="shrink-0" />
        {expanded && !compact && <span className="ml-4 font-semibold text-sm whitespace-nowrap">{t("Ask AI")}</span>}
      </button>
      {open && <AssistantPanel onClose={() => setOpen(false)} />}
    </>
  );
}

function AssistantPanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { lang } = useLanguage();
  const { profile, role } = useSession();
  const storeKey = `erp_assistant_${profile?.id}`;
  const [messages, setMessages] = useState<Msg[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(storeKey) ?? "[]");
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // null while checking; false = the assistant isn't deployed or has no AI key yet.
  const [ready, setReady] = useState<boolean | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // Resolves once we know whether the assistant is available (a question asked earlier waits for it).
  const readiness = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    if (!navigator.onLine) return;
    // Only contact the assistant function once an administrator has deployed it and switched it on.
    readiness.current = (async () => {
      const { data: s } = await supabase.from("app_settings").select("value").eq("key", "assistant_enabled").maybeSingle();
      if (s?.value !== true) return false;
      const { data, error } = await supabase.functions.invoke("assistant", { method: "GET" });
      return !error && !!(data as { configured?: boolean })?.configured;
    })();
    void readiness.current.then(setReady);
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem(storeKey, JSON.stringify(messages.slice(-30))); } catch {}
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, storeKey]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    if (!navigator.onLine) {
      setMessages([...next, { role: "assistant", content: t("The assistant needs an internet connection."), error: "offline" }]);
      return;
    }
    const available = ready ?? (await readiness.current?.catch(() => false)) ?? false;
    if (!available) {
      setMessages([...next, { role: "assistant", content: t("The AI assistant isn't set up yet. An administrator needs to add the AI key (see Integrations & API)."), error: "not_configured" }]);
      return;
    }
    setBusy(true);
    const history = next.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }));
    const { data, error } = await supabase.functions.invoke("assistant", { body: { messages: history, lang } });
    setBusy(false);
    if (error) {
      let status = 0;
      let msg = "";
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.status === "number") {
        status = ctx.status;
        msg = await ctx.json().then((b: { error?: string }) => b.error ?? "").catch(() => "");
      }
      // 404: the function isn't deployed yet; 503 not_configured: deployed without an AI key.
      if (status === 404 || msg === "not_configured") {
        setMessages([...next, { role: "assistant", content: t("The AI assistant isn't set up yet. An administrator needs to add the AI key (see Integrations & API)."), error: "not_configured" }]);
      } else {
        setMessages([...next, { role: "assistant", content: msg || t("The assistant couldn't answer just now. Please try again."), error: "failed" }]);
      }
      return;
    }
    setMessages([...next, { role: "assistant", content: (data as { reply: string }).reply || t("No answer."), sources: (data as { sources: Source[] }).sources }]);
  };

  return (
    <div className="fixed inset-0 z-60 flex justify-end" role="dialog" aria-label={t("Ask AI")}>
      <button aria-label={t("Close")} className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-md h-full bg-white shadow-2xl flex flex-col">
        <div className="px-5 py-4 bg-linear-to-r from-[#2A0845] to-[#6441A5] text-white flex items-start gap-3">
          <Sparkles size={22} className="text-amber-200 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="font-black">{t("Ask AI")}</h2>
            <p className="text-xs text-white/70">{t("Answers come only from records you're allowed to see. It can read, never change.")}</p>
          </div>
          {messages.length > 0 && (
            <button onClick={() => setMessages([])} title={t("Clear conversation")} className="p-1 text-white/70 hover:text-white"><Trash2 size={18} /></button>
          )}
          <button onClick={onClose} aria-label={t("Close")} className="p-1 text-white/70 hover:text-white"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {ready === false && messages.length === 0 && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex gap-2">
              <KeyRound size={16} className="shrink-0 mt-0.5" /> {t("The AI assistant isn't set up yet. An administrator needs to add the AI key (see Integrations & API).")}
            </div>
          )}
          {messages.length === 0 && (
            <div className="space-y-2">
              <p className="text-sm text-slate-500">{t("Try asking:")}</p>
              {suggestionsFor(role).map((s) => (
                <button key={s} onClick={() => ask(t(s))} className="block w-full text-left text-sm font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl px-4 py-3">
                  {t(s)}
                </button>
              ))}
            </div>
          )}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] bg-indigo-600 text-white rounded-2xl rounded-br-sm px-4 py-2 text-sm whitespace-pre-wrap wrap-break-word">{m.content}</div>
              </div>
            ) : (
              <div key={i} className="flex">
                <div className={`max-w-[90%] rounded-2xl rounded-bl-sm px-4 py-3 text-sm space-y-1 wrap-break-word ${m.error ? "bg-amber-50 text-amber-900 border border-amber-200" : "bg-slate-100 text-slate-800"}`}>
                  {m.error === "not_configured" && <KeyRound size={16} className="mb-1" />}
                  {m.error === "offline" && <WifiOff size={16} className="mb-1" />}
                  <Formatted text={m.content} />
                  {!!m.sources?.length && (
                    <p className="pt-2 text-[11px] text-slate-500 flex flex-wrap items-center gap-1">
                      <Database size={11} /> {t("Looked at:")}{" "}
                      {m.sources.map((s, j) => (
                        <span key={j} className="bg-white rounded px-1.5 py-0.5 border">{s.name.replace(/_/g, " ")} ({s.rows})</span>
                      ))}
                    </p>
                  )}
                </div>
              </div>
            )
          )}
          {busy && (
            <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> {t("Looking through your records…")}</p>
          )}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
          className="p-3 border-t flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={2000}
            placeholder={t("Ask about your classes, grades, fees…")}
            aria-label={t("Question")}
            className="flex-1 min-w-0 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button type="submit" disabled={busy || !input.trim()} aria-label={t("Send")} className="px-4 rounded-xl bg-indigo-600 text-white disabled:opacity-40">
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
