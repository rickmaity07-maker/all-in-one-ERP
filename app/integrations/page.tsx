"use client";

import { useEffect, useState } from "react";
import { Plug, Webhook, ScrollText, BookOpen, Plus, Trash2, Copy, Power, ExternalLink, AppWindow } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, isAdmin } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import { ModuleShell, Modal, Field, SubmitButton, ActionButton, Card, Table, Loading, Empty, Badge, IconButton, AccessDenied, inputClass, confirmAction, toast } from "@/components/ui";
import { errorMessage, fmtDateTime, matches, type Row } from "@/lib/utils";
import { launchTool } from "@/lib/lti";

type TabId = "webhooks" | "events" | "lti" | "api";

// Events the database emits (emit_event) — webhooks subscribe to any of them.
const EVENTS = [
  "enrollment.enrolled", "enrollment.waitlisted", "enrollment.dropped", "enrollment.completed", "student.below_full_time",
  "ledger.posted", "hold.placed", "hold.released", "exam.results_released", "credential.issued", "student.at_risk",
  "faculty.tenure_decided", "advancement.payment_received", "procurement.po_approved", "procurement.po_rejected", "device.fault",
];

const API_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

const copyText = async (text: string, what = "Copied.") => {
  try {
    await navigator.clipboard.writeText(text);
    toast(what);
  } catch {
    toast(text);
  }
};

export default function Integrations() {
  const { role } = useSession();
  const admin = isAdmin(role);
  const [tab, setTab] = useState<TabId>("webhooks");
  const [search, setSearch] = useState("");
  const hooks = useTable("webhook_endpoints", { enabled: admin });
  const tools = useTable("lti_tools", { enabled: admin });
  const [events, setEvents] = useState<Row[] | null>(null);
  const [modal, setModal] = useState<"" | "hook" | "tool">("");
  const [busy, setBusy] = useState(false);
  const [h, setH] = useState({ url: "", events: [] as string[] });
  const [t, setT] = useState({ name: "", launch_url: "", login_url: "" });
  const [openEvent, setOpenEvent] = useState<Row | null>(null);

  useEffect(() => {
    if (!admin || tab !== "events") return;
    supabase.from("event_log").select("*").order("created_at", { ascending: false }).limit(200).then(({ data }) => setEvents(data ?? []));
  }, [admin, tab]);

  if (!admin) return <AccessDenied message="Integrations are managed by administrators." />;

  const saveHook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!h.url.startsWith("https://")) return toast("Webhook URLs must use https://", "error");
    setBusy(true);
    const row = await hooks.insert({ url: h.url, events: h.events }, "Webhook added. Copy its signing secret for your receiver.");
    setBusy(false);
    if (row) { setModal(""); setH({ url: "", events: [] }); }
  };
  const saveTool = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const row = await tools.insert({ ...t, login_url: t.login_url || null }, "LTI tool registered.");
    setBusy(false);
    if (row) { setModal(""); setT({ name: "", launch_url: "", login_url: "" }); }
  };

  const ltiBase = `${API_URL}/functions/v1/lti`;

  return (
    <ModuleShell
      title="Integrations"
      icon={Plug}
      tabs={[
        { id: "webhooks" as TabId, label: "Webhooks", icon: Webhook, group: "Connect" },
        { id: "events" as TabId, label: "Event Log", icon: ScrollText, group: "Connect" },
        { id: "lti" as TabId, label: "LTI 1.3 Tools", icon: AppWindow, group: "Connect" },
        { id: "api" as TabId, label: "REST API", icon: BookOpen, group: "Developers" },
      ]}
      activeTab={tab}
      onTab={setTab}
      search={tab === "events" ? search : undefined}
      onSearch={tab === "events" ? setSearch : undefined}
      searchPlaceholder="Filter events..."
      action={
        tab === "webhooks" ? <ActionButton icon={Plus} onClick={() => setModal("hook")}>Add Webhook</ActionButton>
          : tab === "lti" ? <ActionButton icon={Plus} onClick={() => setModal("tool")}>Register Tool</ActionButton> : null
      }
    >
      {modal === "hook" && (
        <Modal title="Add Webhook" icon={Webhook} onClose={() => setModal("")}>
          <form onSubmit={saveHook} className="space-y-4">
            <Field label="Endpoint URL"><input required type="url" className={inputClass} value={h.url} onChange={(e) => setH({ ...h, url: e.target.value })} placeholder="https://example.com/erp-events" /></Field>
            <Field label="Events (none = all)" group>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {EVENTS.map((ev) => (
                  <label key={ev} className="flex items-center gap-2 text-xs font-mono text-slate-600">
                    <input type="checkbox" checked={h.events.includes(ev)} onChange={(e) => setH({ ...h, events: e.target.checked ? [...h.events, ev] : h.events.filter((x) => x !== ev) })} /> {ev}
                  </label>
                ))}
              </div>
            </Field>
            <SubmitButton busy={busy}>Save</SubmitButton>
          </form>
        </Modal>
      )}
      {modal === "tool" && (
        <Modal title="Register LTI 1.3 Tool" icon={AppWindow} onClose={() => setModal("")}>
          <form onSubmit={saveTool} className="space-y-4">
            <Field label="Tool Name"><input required className={inputClass} value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} placeholder="Virtual Lab" /></Field>
            <Field label="Launch (Target Link) URL"><input required type="url" className={inputClass} value={t.launch_url} onChange={(e) => setT({ ...t, launch_url: e.target.value })} placeholder="https://tool.example.com/lti/launch" /></Field>
            <Field label="OIDC Login Initiation URL"><input type="url" className={inputClass} value={t.login_url} onChange={(e) => setT({ ...t, login_url: e.target.value })} placeholder="https://tool.example.com/lti/login" /></Field>
            <SubmitButton busy={busy}>Register</SubmitButton>
          </form>
        </Modal>
      )}
      {openEvent && (
        <Modal title={openEvent.event} icon={ScrollText} onClose={() => setOpenEvent(null)} wide>
          <pre className="text-xs bg-slate-900 text-emerald-200 p-4 rounded-2xl overflow-auto max-h-96">{JSON.stringify({ event: openEvent.event, subject_id: openEvent.subject_id, data: openEvent.payload, sent_at: openEvent.created_at }, null, 2)}</pre>
        </Modal>
      )}

      {tab === "webhooks" && (
        <Card title="Outgoing webhooks">
          <p className="text-sm text-slate-500 mb-4">
            Every event is POSTed as JSON with <code className="font-mono">X-ERP-Event</code> and <code className="font-mono">X-ERP-Secret</code> headers — reject requests whose secret does not match the one shown here. Delivery needs the pg_net extension enabled in Supabase.
          </p>
          {hooks.loading ? <Loading /> : (
            <Table headers={["Endpoint", "Events", "Status", ""]} empty={hooks.rows.length === 0 && "No webhooks yet."}>
              {hooks.rows.map((w) => (
                <tr key={w.id}>
                  <td className="px-6 py-4 font-mono text-xs break-all">{w.url}</td>
                  <td className="px-6 py-4 text-xs">{w.events?.length ? w.events.join(", ") : <Badge color="blue">all events</Badge>}</td>
                  <td className="px-6 py-4"><Badge color={w.active ? "green" : "slate"}>{w.active ? "Active" : "Paused"}</Badge></td>
                  <td className="px-6 py-4 text-right whitespace-nowrap">
                    <IconButton icon={Copy} title="Copy signing secret" onClick={() => copyText(w.secret, "Signing secret copied.")} />
                    <IconButton icon={Power} title={w.active ? "Pause" : "Resume"} onClick={() => hooks.update(w.id, { active: !w.active }, w.active ? "Webhook paused." : "Webhook resumed.")} />
                    <IconButton icon={Trash2} title="Delete" danger onClick={() => confirmAction("Delete this webhook?") && hooks.remove(w.id, "Webhook deleted.")} />
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {tab === "events" && (
        <Card title="Event log (latest 200)">
          {!events ? <Loading /> : events.length === 0 ? <Empty>No events yet — they appear as students register, pay, receive credentials and so on.</Empty> : (
            <Table headers={["When", "Event", "Subject", "Data"]}>
              {events.filter((e) => matches(search, e.event, JSON.stringify(e.payload))).map((e) => (
                <tr key={e.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenEvent(e)}>
                  <td className="px-6 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDateTime(e.created_at)}</td>
                  <td className="px-6 py-3"><Badge color="purple">{e.event}</Badge></td>
                  <td className="px-6 py-3 font-mono text-[10px] text-slate-400">{e.subject_id?.slice(0, 8) ?? "—"}</td>
                  <td className="px-6 py-3 font-mono text-[10px] text-slate-500 max-w-xs truncate">{JSON.stringify(e.payload)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {tab === "lti" && (
        <div className="space-y-6">
          <Card title="Platform details for tool vendors">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              {[
                ["Issuer", ltiBase],
                ["OIDC auth endpoint", `${ltiBase}/auth`],
                ["Public keyset (JWKS)", `${ltiBase}/jwks`],
                ["Tool launch URL (redirect_uri)", "Your tool's Launch URL below"],
              ].map(([k, v]) => (
                <button key={k} onClick={() => copyText(v)} className="text-left p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-indigo-200">
                  <p className="text-[10px] font-bold uppercase text-slate-400">{k}</p>
                  <p className="font-mono text-xs break-all text-slate-700">{v}</p>
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-3">Deploy the included <code className="font-mono">supabase/functions/lti</code> Edge Function and set its LTI_PRIVATE_KEY secret to activate launches.</p>
          </Card>
          <Card title="Registered tools">
            {tools.loading ? <Loading /> : (
              <Table headers={["Tool", "Launch URL", "Client ID", "Deployment ID", "Status", ""]} empty={tools.rows.length === 0 && "No LTI tools registered."}>
                {tools.rows.map((x) => (
                  <tr key={x.id}>
                    <td className="px-6 py-4 font-bold text-slate-800">{x.name}</td>
                    <td className="px-6 py-4 font-mono text-xs break-all">{x.launch_url}</td>
                    <td className="px-6 py-4"><button onClick={() => copyText(x.client_id)} className="font-mono text-xs text-indigo-600">{x.client_id.slice(0, 12)}…</button></td>
                    <td className="px-6 py-4"><button onClick={() => copyText(x.deployment_id)} className="font-mono text-xs text-indigo-600">{x.deployment_id.slice(0, 12)}…</button></td>
                    <td className="px-6 py-4"><Badge color={x.enabled ? "green" : "slate"}>{x.enabled ? "Enabled" : "Disabled"}</Badge></td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <IconButton icon={ExternalLink} title="Test launch" onClick={() => launchTool(x.id).catch((e) => toast(errorMessage(e), "error"))} />
                      <IconButton icon={Power} title={x.enabled ? "Disable" : "Enable"} onClick={() => tools.update(x.id, { enabled: !x.enabled })} />
                      <IconButton icon={Trash2} title="Delete" danger onClick={() => confirmAction(`Remove ${x.name}?`) && tools.remove(x.id, "Tool removed.")} />
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}

      {tab === "api" && (
        <Card title="REST API">
          <div className="space-y-4 text-sm text-slate-600">
            <p>Every table and function is available over HTTPS through the Supabase REST API. Requests run as the signed-in user, so the same row-level security rules as the app apply — a student token only ever sees that student&apos;s data.</p>
            <div className="p-4 rounded-2xl bg-slate-900 text-emerald-200 font-mono text-xs overflow-x-auto whitespace-pre">{`# 1. Sign in to get an access token
curl -X POST '${API_URL}/auth/v1/token?grant_type=password' \\
  -H 'apikey: <anon key>' -H 'Content-Type: application/json' \\
  -d '{"email":"you@school.edu","password":"..."}'

# 2. Read data (views give a stable contract)
curl '${API_URL}/rest/v1/course_sections?select=*' \\
  -H 'apikey: <anon key>' -H 'Authorization: Bearer <access_token>'

# 3. Call a business function
curl -X POST '${API_URL}/rest/v1/rpc/register_for_section' \\
  -H 'apikey: <anon key>' -H 'Authorization: Bearer <access_token>' \\
  -H 'Content-Type: application/json' -d '{"p_class":"<section id>"}'

# Public credential check (no login)
curl -X POST '${API_URL}/rest/v1/rpc/verify_credential' \\
  -H 'apikey: <anon key>' -H 'Content-Type: application/json' -d '{"p_code":"ABC123DEF456"}'`}</div>
            <Table headers={["Resource", "Type", "Purpose"]}>
              {[
                ["course_sections", "view", "Sections with course, term, capacity and room"],
                ["enrollments", "view", "Registrations with status and final grade"],
                ["user_profiles", "view", "Directory (no e-mail addresses)"],
                ["student_balances", "view", "Account balance and holds"],
                ["register_for_section / drop_section", "rpc", "Registration with holds, prerequisites and waitlist"],
                ["degree_audit", "rpc", "Programme progress for a student"],
                ["record_payment / post_adjustment", "rpc", "Ledger postings (administrators)"],
                ["my_hall_tickets", "rpc", "A student's exam seats and released results"],
                ["verify_credential", "rpc", "Public micro-credential verification"],
                ["device_webhook", "rpc", "Lab hardware (RFID readers, 3D printers, sensors) reports status with its device key"],
                ["submit_po / decide_po", "rpc", "Purchase requests: budget check and amount-based approval routing"],
                ["generate_statutory_report", "rpc", "Statutory returns (enrolment, finance, staffing, research) snapshots"],
              ].map(([r, k, p]) => (
                <tr key={r}><td className="px-6 py-3 font-mono text-xs">{r}</td><td className="px-6 py-3"><Badge color={k === "rpc" ? "purple" : "blue"}>{k}</Badge></td><td className="px-6 py-3">{p}</td></tr>
              ))}
            </Table>
          </div>
        </Card>
      )}
    </ModuleShell>
  );
}
