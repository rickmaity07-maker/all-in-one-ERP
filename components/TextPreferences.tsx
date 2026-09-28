"use client";

import { useEffect, useState } from "react";
import { Smartphone, MessageCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Badge, Card, Field, SubmitButton, inputClass, toast } from "@/components/ui";
import { errorMessage, fmtDateTime, type Row } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const STATUS_COLOR: Record<string, "green" | "blue" | "red" | "slate" | "orange"> = { sent: "green", delivered: "green", queued: "blue", failed: "red", not_configured: "orange" };

// Opt in to receive notifications by SMS and/or WhatsApp, and see the texts sent to you.
export default function TextPreferences({ userId }: { userId: string }) {
  const t = useT();
  const [pref, setPref] = useState({ phone: "", sms: false, whatsapp: false });
  const [recent, setRecent] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let off = false;
    Promise.all([
      supabase.from("contact_preferences").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("message_outbox").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
    ]).then(([p, m]) => {
      if (off) return;
      if (p.data) setPref({ phone: p.data.phone ?? "", sms: p.data.sms, whatsapp: p.data.whatsapp });
      setRecent(m.data ?? []);
    });
    return () => { off = true; };
  }, [userId]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = pref.phone.replace(/[\s()-]/g, "");
    if ((pref.sms || pref.whatsapp) && !/^\+[1-9]\d{7,14}$/.test(phone)) {
      return toast(t("Enter the number in international format, e.g. +91 98123 45678."), "error");
    }
    setBusy(true);
    const { error } = await supabase.from("contact_preferences").upsert(
      { user_id: userId, phone: phone || null, sms: pref.sms, whatsapp: pref.whatsapp, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    setBusy(false);
    if (error) return toast(errorMessage(error), "error");
    toast(t("Text message settings saved."));
  };

  return (
    <Card title={t("Text Messages (SMS & WhatsApp)")}>
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-slate-500">{t("Get your notifications (absences, grades, fees, bus alerts) as text messages too.")}</p>
        <Field label={t("Mobile Number")}>
          <input className={inputClass} inputMode="tel" placeholder="+91 98123 45678" value={pref.phone} onChange={(e) => setPref({ ...pref, phone: e.target.value })} />
        </Field>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={pref.sms} onChange={(e) => setPref({ ...pref, sms: e.target.checked })} /> <Smartphone size={16} /> SMS
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={pref.whatsapp} onChange={(e) => setPref({ ...pref, whatsapp: e.target.checked })} /> <MessageCircle size={16} /> WhatsApp
          </label>
        </div>
        <SubmitButton busy={busy}>{t("Save Text Settings")}</SubmitButton>
      </form>
      {recent.length > 0 && (
        <div className="mt-6 border-t pt-4 space-y-2">
          <p className="text-xs font-bold uppercase text-slate-400">{t("Recent texts to you")}</p>
          {recent.map((m) => (
            <div key={m.id} className="flex items-start gap-3 text-sm">
              <Badge color={STATUS_COLOR[m.status] ?? "slate"}>{m.channel === "whatsapp" ? "WhatsApp" : "SMS"} · {t(m.status.replace("_", " "))}</Badge>
              <span className="flex-1 min-w-0 text-slate-600 wrap-break-word">{m.body}</span>
              <span className="text-xs text-slate-400 whitespace-nowrap">{fmtDateTime(m.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
