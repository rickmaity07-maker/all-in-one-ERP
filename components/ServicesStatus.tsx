"use client";

import { useEffect, useState } from "react";
import { Sparkles, Smartphone, CreditCard, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { Card, toast } from "@/components/ui";
import { errorMessage } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type State = "checking" | "ready" | "not_configured" | "not_deployed";

// Status of the services that need outside accounts, and how to switch each on.
export default function ServicesStatus() {
  const t = useT();
  const { role } = useSession();
  const [ai, setAi] = useState<State>("checking");
  const [messaging, setMessaging] = useState<boolean | null>(null);
  const [payments, setPayments] = useState<string>("");

  useEffect(() => {
    // The assistant's status check says whether it has its AI key, without using the AI.
    supabase.functions.invoke("assistant", { method: "GET" }).then(({ data, error }) => {
      if (error) return setAi("not_deployed");
      setAi((data as { configured?: boolean })?.configured ? "ready" : "not_configured");
    });
    supabase.from("app_settings").select("key, value").in("key", ["messaging_enabled", "payments_mode"]).then(({ data }) => {
      setMessaging((data ?? []).find((r) => r.key === "messaging_enabled")?.value === true);
      setPayments(String((data ?? []).find((r) => r.key === "payments_mode")?.value ?? "off"));
    });
  }, []);

  const setPaymentsMode = async (mode: string) => {
    const { error } = await supabase.from("app_settings").update({ value: mode, updated_at: new Date().toISOString() }).eq("key", "payments_mode");
    if (error) return toast(errorMessage(error), "error");
    setPayments(mode);
    toast(mode === "off" ? t("Online payments switched off.") : t("Online payments switched on (test mode)."));
  };

  const status = (ok: boolean | null, okText: string, notText: string) =>
    ok === null ? <Loader2 size={14} className="animate-spin text-slate-400" /> : ok
      ? <span className="text-emerald-700 font-bold flex items-center gap-1"><CheckCircle2 size={14} /> {t(okText)}</span>
      : <span className="text-orange-700 font-bold flex items-center gap-1"><AlertTriangle size={14} /> {t(notText)}</span>;

  return (
    <Card title="Connected services">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl border border-slate-100 space-y-2">
          <p className="font-bold text-slate-800 flex items-center gap-2"><Sparkles size={16} className="text-amber-500" /> {t("AI assistant")}</p>
          {status(ai === "checking" ? null : ai === "ready", "Ready", ai === "not_deployed" ? "Not deployed" : "Needs an AI key")}
          <p className="text-xs text-slate-500">{t("Answers questions from each user's own records (Claude). Deploy the assistant function and add ANTHROPIC_API_KEY as a function secret.")}</p>
        </div>
        <div className="p-4 rounded-2xl border border-slate-100 space-y-2">
          <p className="font-bold text-slate-800 flex items-center gap-2"><Smartphone size={16} className="text-blue-500" /> {t("SMS & WhatsApp")}</p>
          {status(messaging, "Switched on", "Not connected")}
          <p className="text-xs text-slate-500">{t("Texts notifications to people who opt in (Twilio). Setup steps are under Text Messages → Setup.")}</p>
        </div>
        <div className="p-4 rounded-2xl border border-slate-100 space-y-2">
          <p className="font-bold text-slate-800 flex items-center gap-2"><CreditCard size={16} className="text-emerald-500" /> {t("Online fee payments")}</p>
          {status(payments ? payments !== "off" : null, "Test mode (simulated)", "Switched off")}
          <p className="text-xs text-slate-500">{t("Students and parents pay by UPI, card or net banking. Test mode records payments without moving money.")}</p>
          {role === "owner" && payments && (
            <button onClick={() => setPaymentsMode(payments === "off" ? "mock" : "off")} className="text-xs font-bold text-indigo-600">
              {payments === "off" ? t("Switch on (test mode)") : t("Switch off")}
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}
