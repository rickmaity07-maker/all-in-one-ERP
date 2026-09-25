"use client";

import { useCallback, useEffect, useState } from "react";
import { Cpu, Plus, KeyRound, CreditCard, Activity, Trash2, Power, Copy } from "lucide-react";
import { supabase, supabaseUrl } from "@/lib/supabase";
import { Card, Modal, Field, SubmitButton, Table, Badge, Empty, IconButton, inputClass, confirmAction, toast } from "@/components/ui";
import { errorMessage, fmtDateTime, type Row } from "@/lib/utils";

const KINDS: Record<string, string> = { rfid_reader: "RFID door reader", printer_3d: "3D printer", sensor: "Sensor", other: "Other" };

// Hardware registry: devices report to /rest/v1/rpc/device_webhook with their own secret key.
export default function DevicesPanel({ admin, facilities, assets }: { admin: boolean; facilities: Row[]; assets: Row[] }) {
  const [devices, setDevices] = useState<Row[]>([]);
  const [events, setEvents] = useState<Row[]>([]);
  const [cards, setCards] = useState<Row[]>([]);
  const [people, setPeople] = useState<Row[]>([]);
  const [modal, setModal] = useState<"" | "device" | "card">("");
  const [issued, setIssued] = useState<{ name: string; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dv, setDv] = useState({ name: "", kind: "rfid_reader", facility_id: "", asset_id: "" });
  const [cd, setCd] = useState({ card_uid: "", user_id: "" });

  const load = useCallback(async () => {
    const [d, e, c] = await Promise.all([
      supabase.from("devices").select("id, name, kind, facility_id, asset_id, active, last_seen_at, last_status, created_at").order("created_at", { ascending: false }),
      supabase.from("device_events").select("*").order("created_at", { ascending: false }).limit(50),
      admin ? supabase.from("access_cards").select("*").order("created_at", { ascending: false }) : Promise.resolve({ data: [] as Row[] }),
    ]);
    return { d: d.data ?? [], e: e.data ?? [], c: c.data ?? [] };
  }, [admin]);
  const apply = (x: Awaited<ReturnType<typeof load>>) => { setDevices(x.d); setEvents(x.e); setCards(x.c); };
  useEffect(() => {
    let off = false;
    load().then((x) => { if (!off) apply(x); });
    if (admin) supabase.from("profiles").select("id, full_name").order("full_name").then(({ data }) => !off && setPeople(data ?? []));
    return () => { off = true; };
  }, [load, admin]); // eslint-disable-line react-hooks/exhaustive-deps

  const facilityName = (id?: string) => facilities.find((f) => f.id === id)?.name ?? "—";
  const deviceName = (id: string) => devices.find((d) => d.id === id)?.name ?? "device";
  const personName = (id: string) => people.find((p) => p.id === id)?.full_name ?? "—";
  const endpoint = `${supabaseUrl}/rest/v1/rpc/device_webhook`;

  const register = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("register_device", { p_name: dv.name, p_kind: dv.kind, p_facility: dv.facility_id || null, p_asset: dv.asset_id || null });
    setBusy(false);
    if (error) return toast(errorMessage(error), "error");
    setModal("");
    setIssued({ name: dv.name, key: (data as Row).api_key });
    setDv({ name: "", kind: "rfid_reader", facility_id: "", asset_id: "" });
    apply(await load());
  };
  const addCard = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("access_cards").insert([{ card_uid: cd.card_uid.trim(), user_id: cd.user_id }]);
    setBusy(false);
    if (error) return toast(/duplicate key/.test(error.message) ? "That card is already assigned." : errorMessage(error), "error");
    toast("Access card assigned.");
    setModal("");
    setCd({ card_uid: "", user_id: "" });
    apply(await load());
  };
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast("Copied."); } catch { toast(text); }
  };

  return (
    <div className="space-y-6">
      {modal === "device" && (
        <Modal title="Register Device" icon={Cpu} onClose={() => setModal("")}>
          <form onSubmit={register} className="space-y-4">
            <Field label="Device Name"><input required className={inputClass} value={dv.name} onChange={(e) => setDv({ ...dv, name: e.target.value })} placeholder="Robotics lab door" /></Field>
            <Field label="Kind">
              <select className={inputClass} value={dv.kind} onChange={(e) => setDv({ ...dv, kind: e.target.value })}>
                {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Room">
              <select className={inputClass} value={dv.facility_id} onChange={(e) => setDv({ ...dv, facility_id: e.target.value })}>
                <option value="">—</option>
                {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>
            <Field label="Linked Asset (faults put it into maintenance)">
              <select className={inputClass} value={dv.asset_id} onChange={(e) => setDv({ ...dv, asset_id: e.target.value })}>
                <option value="">—</option>
                {assets.map((a) => <option key={a.id} value={a.id}>{a.asset_tag} — {a.name}</option>)}
              </select>
            </Field>
            <SubmitButton busy={busy}>Register</SubmitButton>
          </form>
        </Modal>
      )}
      {modal === "card" && (
        <Modal title="Assign Access Card" icon={CreditCard} onClose={() => setModal("")}>
          <form onSubmit={addCard} className="space-y-4">
            <Field label="Card Number (UID)"><input required className={inputClass} value={cd.card_uid} onChange={(e) => setCd({ ...cd, card_uid: e.target.value })} placeholder="04A2B3C4D5" /></Field>
            <Field label="Card Holder">
              <select required className={inputClass} value={cd.user_id} onChange={(e) => setCd({ ...cd, user_id: e.target.value })}>
                <option value="">Select…</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </Field>
            <p className="text-xs text-slate-500">Staff cards open any registered door. Students are let in only during their own room booking.</p>
            <SubmitButton busy={busy}>Assign</SubmitButton>
          </form>
        </Modal>
      )}
      {issued && (
        <Modal title={`Device key — ${issued.name}`} icon={KeyRound} onClose={() => setIssued(null)} wide>
          <p className="text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded-xl p-3 mb-4">Copy this key into the device now. It is shown only once — only a fingerprint of it is stored.</p>
          <button onClick={() => copy(issued.key)} className="w-full text-left font-mono text-xs break-all p-3 rounded-xl bg-slate-900 text-emerald-200 mb-4">{issued.key}</button>
          <p className="text-xs font-bold uppercase text-slate-400 mb-1">The device sends</p>
          <pre className="text-[11px] bg-slate-50 border rounded-xl p-3 whitespace-pre-wrap break-all">{`POST ${endpoint}
apikey: <anon key>
Content-Type: application/json

{"p_key":"<device key>","p_event":"access_request","p_payload":{"card_uid":"04A2B3C4D5"}}
→ {"allow": true, "reason": "reservation"}

Other events: heartbeat, job_started, job_progress {"percent":40}, job_finished, fault {"code":"E42","message":"Nozzle jam"}`}</pre>
        </Modal>
      )}

      <Card title="Connected devices" action={admin && <button onClick={() => setModal("device")} className="flex items-center gap-2 text-sm font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl"><Plus size={16} /> Register device</button>}>
        {devices.length === 0 ? <Empty>No devices yet. Register a door reader or lab machine to let it report here.</Empty> : (
          <Table headers={["Device", "Room", "Last Seen", "Last Report", "Status", ...(admin ? [""] : [])]}>
            {devices.map((d) => (
              <tr key={d.id}>
                <td className="px-6 py-4"><p className="font-bold text-slate-800">{d.name}</p><p className="text-xs text-slate-400">{KINDS[d.kind]}</p></td>
                <td className="px-6 py-4 text-sm">{facilityName(d.facility_id)}</td>
                <td className="px-6 py-4 text-sm text-slate-500">{d.last_seen_at ? fmtDateTime(d.last_seen_at) : "never"}</td>
                <td className="px-6 py-4 text-xs font-mono text-slate-500 max-w-xs truncate">{d.last_status ? JSON.stringify(d.last_status) : "—"}</td>
                <td className="px-6 py-4"><Badge color={d.active ? "green" : "slate"}>{d.active ? "Active" : "Disabled"}</Badge></td>
                {admin && (
                  <td className="px-6 py-4 text-right whitespace-nowrap">
                    <IconButton icon={Power} title={d.active ? "Disable" : "Enable"} onClick={async () => { const { error } = await supabase.from("devices").update({ active: !d.active }).eq("id", d.id); if (error) toast(errorMessage(error), "error"); else apply(await load()); }} />
                    <IconButton icon={Trash2} title="Remove" danger onClick={async () => { if (!confirmAction(`Remove ${d.name}?`)) return; const { error } = await supabase.from("devices").delete().eq("id", d.id); if (error) toast(errorMessage(error), "error"); else apply(await load()); }} />
                  </td>
                )}
              </tr>
            ))}
          </Table>
        )}
        <button onClick={() => copy(endpoint)} className="mt-4 text-xs text-slate-500 flex items-center gap-1"><Copy size={12} /> Endpoint: <span className="font-mono">{endpoint}</span></button>
      </Card>

      {admin && (
        <Card title="Access cards" action={<button onClick={() => setModal("card")} className="flex items-center gap-2 text-sm font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl"><CreditCard size={16} /> Assign card</button>}>
          <Table headers={["Card", "Holder", "Status", ""]} empty={cards.length === 0 && "No access cards assigned."}>
            {cards.map((c) => (
              <tr key={c.card_uid}>
                <td className="px-6 py-4 font-mono text-sm">{c.card_uid}</td>
                <td className="px-6 py-4">{personName(c.user_id)}</td>
                <td className="px-6 py-4"><Badge color={c.active ? "green" : "slate"}>{c.active ? "Active" : "Blocked"}</Badge></td>
                <td className="px-6 py-4 text-right">
                  <button onClick={async () => { const { error } = await supabase.from("access_cards").update({ active: !c.active }).eq("card_uid", c.card_uid); if (error) toast(errorMessage(error), "error"); else apply(await load()); }} className="text-xs font-bold text-slate-600">{c.active ? "Block" : "Unblock"}</button>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Card title="Device activity">
        <Table headers={["When", "Device", "Event", "Details", "Result"]} empty={events.length === 0 && "No device activity yet."}>
          {events.map((ev) => (
            <tr key={ev.id}>
              <td className="px-6 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDateTime(ev.created_at)}</td>
              <td className="px-6 py-3 text-sm">{deviceName(ev.device_id)}</td>
              <td className="px-6 py-3"><Badge color={ev.event_type === "fault" ? "red" : ev.event_type === "access_request" ? "blue" : "slate"}><Activity size={10} /> {ev.event_type.replace(/_/g, " ")}</Badge></td>
              <td className="px-6 py-3 text-[11px] font-mono text-slate-500 max-w-xs truncate">{JSON.stringify(ev.payload)}</td>
              <td className="px-6 py-3">{ev.result?.allow === true ? <Badge color="green">allowed</Badge> : ev.result?.allow === false ? <Badge color="red">denied — {ev.result.reason}</Badge> : "—"}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
