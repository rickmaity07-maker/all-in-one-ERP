"use client";

import { useEffect, useMemo, useState } from "react";
import { Smartphone, Send, MessageCircle, History, Settings2, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, isAdmin } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import { ModuleShell, Field, SubmitButton, Card, Table, Badge, StatCard, AccessDenied, inputClass, toast } from "@/components/ui";
import { errorMessage, fmtDateTime, matches } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type TabId = "send" | "log" | "setup";
const STATUS_COLOR: Record<string, string> = { sent: "green", delivered: "green", queued: "blue", failed: "red", not_configured: "orange" };
const AUDIENCES = [
  { id: "parents", label: "All parents" },
  { id: "students", label: "All students" },
  { id: "staff", label: "All staff" },
  { id: "all", label: "Everyone" },
];

// Administrators message a whole group (in-app + SMS/WhatsApp for people who opted in) and see delivery.
export default function Messages() {
  const { role } = useSession();
  const t = useT();
  const admin = isAdmin(role);
  const [tab, setTab] = useState<TabId>("send");
  const [search, setSearch] = useState("");
  const outbox = useTable("message_outbox", { enabled: admin });
  const [names, setNames] = useState<Record<string, string>>({});
  const [optedIn, setOptedIn] = useState({ sms: 0, whatsapp: 0 });
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [form, setForm] = useState({ audience: "parents", title: "", body: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!admin) return;
    Promise.all([
      supabase.from("profiles").select("id, full_name"),
      supabase.from("contact_preferences").select("sms, whatsapp"),
      supabase.from("app_settings").select("value").eq("key", "messaging_enabled").maybeSingle(),
    ]).then(([p, c, s]) => {
      setNames(Object.fromEntries((p.data ?? []).map((x) => [x.id, x.full_name])));
      setOptedIn({ sms: (c.data ?? []).filter((x) => x.sms).length, whatsapp: (c.data ?? []).filter((x) => x.whatsapp).length });
      setEnabled(s.data?.value === true);
    });
  }, [admin]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of outbox.rows) c[m.status] = (c[m.status] ?? 0) + 1;
    return c;
  }, [outbox.rows]);

  if (!admin) return <AccessDenied message="Text messaging is managed by administrators." />;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("broadcast_message", { p_audience: form.audience, p_title: form.title.trim(), p_body: form.body.trim() || null });
    setBusy(false);
    if (error) return toast(errorMessage(error), "error");
    toast(t("Message sent to {n} people.", { n: Number(data) }));
    setForm({ ...form, title: "", body: "" });
    setTimeout(() => outbox.reload(), 800);
  };

  const shown = outbox.rows.filter((m) => matches(search, names[m.user_id], m.to_number, m.body, m.status, m.channel));

  return (
    <ModuleShell
      title="Text Messages"
      icon={Smartphone}
      tabs={[
        { id: "send", label: "Send to a group", icon: Send },
        { id: "log", label: "Delivery log", icon: History },
        { id: "setup", label: "Setup", icon: Settings2 },
      ]}
      activeTab={tab}
      onTab={setTab}
      search={tab === "log" ? search : undefined}
      onSearch={tab === "log" ? setSearch : undefined}
      searchPlaceholder="Search messages..."
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Opted in: SMS" value={optedIn.sms} icon={Smartphone} color="blue" />
        <StatCard label="Opted in: WhatsApp" value={optedIn.whatsapp} icon={MessageCircle} color="emerald" />
        <StatCard label="Sent" value={(counts.sent ?? 0) + (counts.delivered ?? 0)} icon={CheckCircle2} color="indigo" />
        <StatCard label="Not delivered" value={(counts.failed ?? 0) + (counts.not_configured ?? 0)} icon={AlertTriangle} color="orange" />
      </div>

      {enabled === false && (
        <div className="mb-6 p-4 rounded-2xl bg-orange-50 border border-orange-200 text-orange-800 text-sm font-semibold">
          {t("SMS and WhatsApp are not connected yet, so messages are shown in the app only. See Setup.")}
        </div>
      )}

      {tab === "send" && (
        <Card title="Send a message">
          <form onSubmit={send} className="space-y-4 max-w-xl">
            <Field label="To">
              <select className={inputClass} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
                {AUDIENCES.map((a) => <option key={a.id} value={a.id}>{t(a.label)}</option>)}
              </select>
            </Field>
            <Field label="Title">
              <input required maxLength={80} className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t("School trip on Friday")} />
            </Field>
            <Field label="Message">
              <textarea rows={4} maxLength={600} className={inputClass} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder={t("Please send a packed lunch and a water bottle.")} />
            </Field>
            <p className="text-xs text-slate-500">{t("Everyone in the group gets it in the app. People who turned on SMS or WhatsApp in Settings also get it as a text.")}</p>
            <SubmitButton busy={busy}><Send size={16} /> Send</SubmitButton>
          </form>
        </Card>
      )}

      {tab === "log" && (
        <Table headers={["When", "To", "Channel", "Message", "Status"]} empty={shown.length === 0 && "No text messages yet."}>
          {shown.map((m) => (
            <tr key={m.id}>
              <td className="px-6 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDateTime(m.created_at)}</td>
              <td className="px-6 py-3 text-sm"><p className="font-bold">{names[m.user_id] ?? "—"}</p><p className="text-xs text-slate-400 font-mono">{m.to_number}</p></td>
              <td className="px-6 py-3"><Badge color={m.channel === "whatsapp" ? "green" : "blue"}>{m.channel === "whatsapp" ? "WhatsApp" : "SMS"}</Badge></td>
              <td className="px-6 py-3 text-sm text-slate-600 max-w-sm wrap-break-word">{m.body}</td>
              <td className="px-6 py-3">
                <Badge color={STATUS_COLOR[m.status] ?? "slate"}>{m.status.replace("_", " ")}</Badge>
                {m.error && <p className="text-[11px] text-slate-400 mt-1 max-w-xs">{m.error}</p>}
              </td>
            </tr>
          ))}
        </Table>
      )}

      {tab === "setup" && (
        <Card title="Connecting SMS and WhatsApp (Twilio)">
          <ol className="list-decimal ml-5 space-y-2 text-sm text-slate-700">
            <li>{t("Create a Twilio account and get an SMS number (and a WhatsApp sender for WhatsApp).")}</li>
            <li>{t("In Supabase, enable the pg_net and pg_cron extensions (Database → Extensions).")}</li>
            <li>{t("Deploy the send-messages function and add the Twilio keys as function secrets:")}
              <pre className="mt-2 text-[11px] bg-slate-900 text-emerald-200 rounded-xl p-3 whitespace-pre-wrap break-all">{`supabase functions deploy send-messages --no-verify-jwt
supabase secrets set TWILIO_ACCOUNT_SID=AC… TWILIO_AUTH_TOKEN=… TWILIO_SMS_FROM=+1… TWILIO_WHATSAPP_FROM=+1…`}</pre>
            </li>
            <li>{t("Tell the database where the function is and switch messaging on (SQL editor):")}
              <pre className="mt-2 text-[11px] bg-slate-900 text-emerald-200 rounded-xl p-3 whitespace-pre-wrap break-all">{`update public.private_settings set value = 'https://<project>.supabase.co/functions/v1' where key = 'functions_url';
update public.app_settings set value = 'true' where key = 'messaging_enabled';`}</pre>
            </li>
          </ol>
          <p className="mt-4 text-sm font-semibold">
            {t("Status")}: {enabled ? <span className="text-emerald-600">{t("Messaging is switched on.")}</span> : <span className="text-orange-600">{t("Not connected yet.")}</span>}
          </p>
        </Card>
      )}
    </ModuleShell>
  );
}
