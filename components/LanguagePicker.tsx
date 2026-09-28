"use client";

import { Languages } from "lucide-react";
import { LANGUAGES, useLanguage, useT, type Lang } from "@/lib/i18n";

// Interface language switch (sign-in screen and Settings).
export default function LanguagePicker({ variant = "select" }: { variant?: "select" | "buttons" }) {
  const t = useT();
  const { lang, setLang } = useLanguage();
  if (variant === "buttons") {
    return (
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("Language")}>
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            type="button"
            role="radio"
            aria-checked={lang === l.code}
            onClick={() => setLang(l.code)}
            className={`px-4 py-2 rounded-xl text-sm font-bold border ${lang === l.code ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-700 border-slate-200 hover:border-indigo-300"}`}
          >
            {l.native}
            {l.code !== "en" && <span className="ml-1 font-normal opacity-70">({l.name})</span>}
          </button>
        ))}
      </div>
    );
  }
  return (
    <label className="inline-flex items-center gap-2 text-sm text-slate-600">
      <Languages size={16} />
      <span className="sr-only">{t("Language")}</span>
      <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t("Language")} className="bg-transparent font-semibold focus:outline-none">
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>{l.native}</option>
        ))}
      </select>
    </label>
  );
}
