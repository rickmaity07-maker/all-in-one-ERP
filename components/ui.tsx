"use client";

import { cloneElement, isValidElement, useEffect, useId, useState } from "react";
import { Search, X, Loader2, ShieldAlert, CheckCircle2, AlertCircle, type LucideIcon } from "lucide-react";

export const inputClass =
  "w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none";

// ---------- Toasts ----------
type ToastMsg = { id: number; text: string; kind: "success" | "error" };

export function toast(text: string, kind: "success" | "error" = "success") {
  window.dispatchEvent(new CustomEvent("erp-toast", { detail: { text, kind } }));
}

export function Toaster() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => {
    const onToast = (e: Event) => {
      const { text, kind } = (e as CustomEvent).detail;
      const id = Date.now() + Math.random();
      setItems((prev) => [...prev, { id, text, kind }]);
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4000);
    };
    window.addEventListener("erp-toast", onToast);
    return () => window.removeEventListener("erp-toast", onToast);
  }, []);
  return (
    <div className="fixed bottom-6 right-6 z-100 flex flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-2 px-4 py-3 rounded-2xl shadow-lg text-sm font-semibold border ${
            t.kind === "error" ? "bg-red-50 text-red-700 border-red-100" : "bg-emerald-50 text-emerald-700 border-emerald-100"
          }`}
        >
          {t.kind === "error" ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ---------- Modal ----------
export function Modal({
  title,
  icon: Icon,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  icon?: LucideIcon;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed md:absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-3 md:p-6" onClick={onClose}>
      <div
        className={`bg-white rounded-3xl p-5 md:p-8 shadow-2xl border border-slate-100 max-h-full overflow-y-auto w-full ${wide ? "max-w-160" : "max-w-110"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            {Icon && <Icon size={20} className="text-indigo-600" />} {title}
          </h3>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Wrapping the control in <label> ties the caption to the input for screen readers (and getByLabel in tests).
// Use group for fields that hold several buttons rather than one input.
export function Field({ label, children, group = false }: { label: string; children: React.ReactNode; group?: boolean }) {
  const caption = <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{label}</span>;
  return group ? (
    <div role="group" aria-label={label}>
      {caption}
      {children}
    </div>
  ) : (
    <FieldControl caption={caption}>
      {children}
    </FieldControl>
  );
}

// Links the caption to the single input/select/textarea by id, so the label text stays just the caption.
function FieldControl({ caption, children }: { caption: React.ReactNode; children: React.ReactNode }) {
  const autoId = useId();
  if (!isValidElement<{ id?: string }>(children)) {
    return (
      <label className="block">
        {caption}
        {children}
      </label>
    );
  }
  const id = children.props.id ?? autoId;
  return (
    <div>
      <label htmlFor={id} className="block">
        {caption}
      </label>
      {cloneElement(children, { id })}
    </div>
  );
}

export function SubmitButton({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full mt-4 flex items-center justify-center gap-2 bg-indigo-600 text-white py-3.5 rounded-xl text-sm font-bold shadow-md hover:bg-indigo-700 transition-colors disabled:opacity-70"
    >
      {busy ? <Loader2 size={16} className="animate-spin" /> : children}
    </button>
  );
}

// ---------- Page shell ----------
export type Tab<T extends string> = { id: T; label: string; icon?: LucideIcon; group?: string };

export function ModuleShell<T extends string>({
  title,
  icon: Icon,
  tabs,
  activeTab,
  onTab,
  search,
  onSearch,
  searchPlaceholder = "Search...",
  action,
  children,
}: {
  title: string;
  icon: LucideIcon;
  tabs: Tab<T>[];
  activeTab: T;
  onTab: (t: T) => void;
  search?: string;
  onSearch?: (s: string) => void;
  searchPlaceholder?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const groups = Array.from(new Set(tabs.map((t) => t.group ?? "Views")));
  return (
    <div className="flex h-full w-full overflow-hidden relative">
      <aside className="hidden md:flex w-72 bg-white/80 backdrop-blur-xl border-r border-slate-100 flex-col shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="h-20 flex items-center px-8 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <Icon size={24} className="text-indigo-600" /> {title}
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {groups.map((g) => (
            <div key={g}>
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">{g}</h3>
              <ul className="space-y-2">
                {tabs
                  .filter((t) => (t.group ?? "Views") === g)
                  .map((t) => {
                    const TabIcon = t.icon;
                    return (
                      <li key={t.id}>
                        <button
                          onClick={() => onTab(t.id)}
                          className={`w-full flex items-center gap-3 text-left px-4 py-3 text-sm font-bold rounded-2xl transition-all ${
                            activeTab === t.id
                              ? "bg-linear-to-r from-blue-50 to-indigo-50 text-indigo-700 shadow-sm"
                              : "text-slate-500 hover:bg-slate-50"
                          }`}
                        >
                          {TabIcon && <TabIcon size={18} />} {t.label}
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </div>
      </aside>

      <main className="flex-1 bg-[#F4F7FE] flex flex-col min-w-0 overflow-y-auto">
        {tabs.length > 1 && (
          <div className="md:hidden flex gap-2 overflow-x-auto px-4 pt-4 hide-scrollbar" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={activeTab === t.id}
                onClick={() => onTab(t.id)}
                className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold ${activeTab === t.id ? "bg-indigo-600 text-white" : "bg-white text-slate-600 border border-slate-200"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        <header className="flex flex-col md:flex-row md:h-24 md:items-center justify-between gap-3 md:gap-4 px-4 md:px-10 py-4 md:py-0 shrink-0">
          {onSearch ? <SearchBox value={search ?? ""} onChange={onSearch} placeholder={searchPlaceholder} /> : <div className="hidden md:block" />}
          {action}
        </header>
        <div className="px-4 md:px-10 pb-10">{children}</div>
      </main>
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (s: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full md:w-96 max-w-full shadow-[0_4px_20px_rgba(0,0,0,0.03)] rounded-2xl">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-12 pr-4 py-3.5 bg-white border-none rounded-2xl text-sm outline-none font-medium"
      />
    </div>
  );
}

export function ActionButton({ onClick, icon: Icon, children }: { onClick: () => void; icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-2 bg-linear-to-r from-blue-600 to-indigo-600 text-white px-6 py-3.5 rounded-2xl text-sm font-bold shadow-md hover:scale-105 transition-all shrink-0"
    >
      {Icon && <Icon size={18} />} {children}
    </button>
  );
}

export function PageHeading({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row justify-between md:items-end mb-6 mt-2 gap-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-slate-800 mb-2">{title}</h1>
        {subtitle && <p className="text-slate-500 font-medium">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Card({ title, action, children, className = "" }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-3xl md:rounded-4xl p-4 md:p-8 shadow-sm border border-slate-100 ${className}`}>
      {(title || action) && (
        <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
          {title && <h3 className="text-lg md:text-xl font-bold text-slate-800">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

const STAT_COLORS = {
  indigo: "bg-indigo-100 text-indigo-600",
  blue: "bg-blue-100 text-blue-600",
  emerald: "bg-emerald-100 text-emerald-600",
  orange: "bg-orange-100 text-orange-600",
  red: "bg-red-100 text-red-600",
  pink: "bg-pink-100 text-pink-600",
  purple: "bg-purple-100 text-purple-600",
} as const;

export function StatCard({ label, value, icon: Icon, color = "indigo" }: { label: string; value: React.ReactNode; icon: LucideIcon; color?: keyof typeof STAT_COLORS }) {
  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex items-center gap-4">
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${STAT_COLORS[color]}`}>
        <Icon size={28} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">{label}</p>
        <h3 className="text-2xl font-black text-slate-800 truncate">{value}</h3>
      </div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="p-12 text-center text-slate-400 border border-slate-200 border-dashed rounded-3xl">{children}</div>;
}

export function Loading({ label = "Syncing with cloud..." }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-slate-500 py-8">
      <Loader2 className="animate-spin" /> {label}
    </div>
  );
}

export function AccessDenied({ message }: { message: string }) {
  return (
    <div className="flex-1 bg-[#F4F7FE] flex flex-col items-center justify-center h-full w-full">
      <ShieldAlert size={64} className="text-pink-500 mb-4" />
      <h1 className="text-2xl font-black text-slate-800">Access Restricted</h1>
      <p className="text-slate-500">{message}</p>
    </div>
  );
}

const BADGE_COLORS: Record<string, string> = {
  green: "bg-emerald-100 text-emerald-700",
  orange: "bg-orange-100 text-orange-700",
  red: "bg-red-100 text-red-700",
  blue: "bg-blue-100 text-blue-700",
  purple: "bg-purple-100 text-purple-700",
  slate: "bg-slate-100 text-slate-600",
};

export function Badge({ color = "slate", children }: { color?: keyof typeof BADGE_COLORS | string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold uppercase tracking-wider ${BADGE_COLORS[color] ?? BADGE_COLORS.slate}`}>
      {children}
    </span>
  );
}

export function Table({ headers, children, empty, colSpan }: { headers: string[]; children: React.ReactNode; empty?: string | false; colSpan?: number }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100">
      <table className="w-full text-left text-sm min-w-max md:min-w-0">
        <thead className="bg-slate-50/50 text-slate-500 border-b border-slate-100">
          <tr>
            {headers.map((h, i) => (
              <th key={h + i} className={`px-6 py-4 font-bold ${i === headers.length - 1 && h === "Actions" ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {empty ? (
            <tr>
              <td colSpan={colSpan ?? headers.length} className="px-6 py-10 text-center text-slate-400 font-medium">
                {empty}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

export function IconButton({ onClick, title, icon: Icon, danger = false }: { onClick: () => void; title: string; icon: LucideIcon; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-2 rounded-lg transition-colors ${danger ? "text-slate-400 hover:text-red-500 hover:bg-red-50" : "text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"}`}
    >
      <Icon size={16} />
    </button>
  );
}

// Confirm before destructive actions.
export const confirmAction = (message: string) => window.confirm(message);
