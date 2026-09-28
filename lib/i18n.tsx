"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { hi } from "./i18n/hi";
import { bn } from "./i18n/bn";

// Interface languages. English text is the key; a language without a translation for a
// string shows the English original, so nothing is ever blank.
export const LANGUAGES = [
  { code: "en", name: "English", native: "English" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "bn", name: "Bengali", native: "বাংলা" },
] as const;
export type Lang = (typeof LANGUAGES)[number]["code"];
const DICTS: Record<Lang, Record<string, string>> = { en: {}, hi, bn };
const KEY = "erp_lang";

type Vars = Record<string, string | number>;
export type T = (text: string, vars?: Vars) => string;

const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);
export const translate = (lang: Lang, text: string, vars?: Vars) => fill(DICTS[lang]?.[text] ?? text, vars);

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: T }>({
  lang: "en",
  setLang: () => {},
  t: (s, v) => fill(s, v),
});

const readStored = (): Lang => {
  try {
    const v = localStorage.getItem(KEY);
    return LANGUAGES.some((l) => l.code === v) ? (v as Lang) : "en";
  } catch {
    return "en";
  }
};

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  // The choice is kept on the device and in the user's private preferences (so it follows them to other devices).
  useEffect(() => {
    setLangState(readStored()); // eslint-disable-line react-hooks/set-state-in-effect
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "INITIAL_SESSION") return;
      const uid = session?.user.id;
      if (!uid) return;
      // Only a device without its own choice yet takes the language saved in the account.
      try {
        if (localStorage.getItem(KEY)) return;
      } catch {}
      // Not inside the auth callback itself: a Supabase call made there can deadlock the sign-in.
      setTimeout(() => void supabase.from("user_metadata").select("preferences").eq("user_id", uid).maybeSingle().then(({ data: row }) => {
        const saved = (row?.preferences as { language?: string } | undefined)?.language;
        if (saved && LANGUAGES.some((l) => l.code === saved)) {
          setLangState(saved as Lang);
          try { localStorage.setItem(KEY, saved); } catch {}
        }
      }), 0);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(KEY, l); } catch {}
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) return;
      const { data: row } = await supabase.from("user_metadata").select("preferences").eq("user_id", uid).maybeSingle();
      const preferences = { ...((row?.preferences as object) ?? {}), language: l };
      await supabase.from("user_metadata").upsert({ user_id: uid, preferences }, { onConflict: "user_id" });
    })();
  }, []);

  const t = useCallback<T>((text, vars) => translate(lang, text, vars), [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useT = () => useContext(Ctx).t;
export const useLanguage = () => {
  const { lang, setLang } = useContext(Ctx);
  return { lang, setLang };
};
