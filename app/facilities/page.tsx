"use client";

import { useEffect, useState } from "react";
import { DoorOpen, CalendarPlus, Wrench, Plus, Trash2, XCircle, Package, AlertTriangle, Pencil, Cpu } from "lucide-react";
import DevicesPanel from "@/components/DevicesPanel";
import { supabase } from "@/lib/supabase";
import { useSession, isAdmin, isStaff } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import { ModuleShell, Modal, Field, SubmitButton, ActionButton, Card, Table, Loading, Badge, IconButton, StatCard, inputClass, confirmAction, toast } from "@/components/ui";
import { errorMessage, fmtDate, fmtDateTime, localDate, matches, type Row } from "@/lib/utils";

type TabId = "book" | "spaces" | "assets" | "devices";
const TYPES = ["classroom", "lecture_hall", "lab", "meeting_room", "sports", "other"];
const label = (s: string) => s.replace(/_/g, " ");

// Postgres exclusion-constraint and trigger errors, rewritten for people.
const friendly = (e: unknown) => {
  const m = errorMessage(e);
  return m.includes("reservations_no_overlap") ? "That room is already booked for part of this time. Pick another slot or room." : m;
};

export default function Facilities() {
  const { role, profile } = useSession();
  const admin = isAdmin(role);
  const staff = isStaff(role);
  const [tab, setTab] = useState<TabId>("book");
  const [search, setSearch] = useState("");
  const facilities = useTable("facilities", { orderBy: "name", ascending: true });
  const reservations = useTable("reservations", { orderBy: "starts_at", ascending: true });
  const assets = useTable("assets", { orderBy: "name", ascending: true, enabled: staff });
  const [due, setDue] = useState<Row[]>([]);
  const [modal, setModal] = useState<"" | "reserve" | "space" | "asset" | "service">("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [day, setDay] = useState(localDate());
  const [r, setR] = useState({ facility_id: "", title: "", date: localDate(), start: "09:00", end: "10:00" });
  const [sp, setSp] = useState({ name: "", type: "classroom", building: "", capacity: "30", bookable: true, projector: false, accessible: true });
  const [as, setAs] = useState({ name: "", asset_tag: "", serial_number: "", category: "", facility_id: "", status: "in_service", purchased_on: "", maintenance_interval_days: "", certification_expires_on: "" });
  const [svc, setSvc] = useState({ asset_id: "", performed_on: localDate(), notes: "" });

  useEffect(() => {
    if (!staff) return;
    supabase.from("assets_due").select("*").order("next_maintenance_on").then(({ data }) => setDue(data ?? []));
  }, [staff, assets.rows]);

  const nameOf = (id: string) => facilities.rows.find((f) => f.id === id)?.name ?? "—";

  const reserve = async (e: React.FormEvent) => {
    e.preventDefault();
    const starts = new Date(`${r.date}T${r.start}`);
    const ends = new Date(`${r.date}T${r.end}`);
    if (ends <= starts) return toast("The end time must be after the start time.", "error");
    setBusy(true);
    const { error } = await supabase.from("reservations").insert([{ facility_id: r.facility_id, title: r.title, starts_at: starts.toISOString(), ends_at: ends.toISOString() }]);
    setBusy(false);
    if (error) return toast(friendly(error), "error");
    toast("Room booked.");
    setModal("");
    setDay(r.date);
    reservations.reload();
  };

  const saveSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const values = { name: sp.name, type: sp.type, building: sp.building || null, capacity: parseInt(sp.capacity) || 1, bookable: sp.bookable, features: { projector: sp.projector, accessible: sp.accessible } };
    const ok = editing ? await facilities.update(editing.id, values, "Space updated.") : !!(await facilities.insert(values, "Space added."));
    setBusy(false);
    if (ok) { setModal(""); setEditing(null); }
  };

  const saveAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const values = {
      ...as,
      facility_id: as.facility_id || null,
      serial_number: as.serial_number || null,
      category: as.category || null,
      purchased_on: as.purchased_on || null,
      certification_expires_on: as.certification_expires_on || null,
      maintenance_interval_days: as.maintenance_interval_days ? parseInt(as.maintenance_interval_days) : null,
    };
    const ok = editing ? await assets.update(editing.id, values, "Asset updated.") : !!(await assets.insert(values, "Asset registered."));
    setBusy(false);
    if (ok) { setModal(""); setEditing(null); }
  };

  const logService = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("asset_maintenance").insert([{ ...svc, notes: svc.notes || null }]);
    setBusy(false);
    if (error) return toast(errorMessage(error), "error");
    toast("Maintenance logged.");
    setModal("");
    assets.reload();
  };

  const cancel = async (res: Row) => {
    if (!confirmAction("Cancel this booking?")) return;
    await reservations.update(res.id, { status: "cancelled" }, "Booking cancelled.");
  };

  const dayBookings = reservations.rows.filter((x) => x.status === "confirmed" && localDate(new Date(x.starts_at)) === day);
  const myUpcoming = reservations.rows.filter((x) => x.status === "confirmed" && x.user_id === profile?.id && new Date(x.ends_at) > new Date());
  const today = localDate();
  const overdue = due.filter((d) => d.next_maintenance_on < today);
  const [soon] = useState(() => localDate(new Date(Date.now() + 30 * 864e5)));
  const certSoon = assets.rows.filter((a) => a.certification_expires_on && a.certification_expires_on <= soon);

  const tabs = [
    { id: "book" as TabId, label: "Book a Room", icon: CalendarPlus, group: "Spaces" },
    { id: "spaces" as TabId, label: "Rooms & Labs", icon: DoorOpen, group: "Spaces" },
    ...(staff ? [{ id: "assets" as TabId, label: "Equipment & Maintenance", icon: Package, group: "Assets" }] : []),
    ...(staff ? [{ id: "devices" as TabId, label: "Devices & Access", icon: Cpu, group: "Assets" }] : []),
  ];

  const openAsset = (a?: Row) => {
    setEditing(a ?? null);
    setAs(a ? { name: a.name, asset_tag: a.asset_tag, serial_number: a.serial_number ?? "", category: a.category ?? "", facility_id: a.facility_id ?? "", status: a.status, purchased_on: a.purchased_on ?? "", maintenance_interval_days: a.maintenance_interval_days?.toString() ?? "", certification_expires_on: a.certification_expires_on ?? "" }
      : { name: "", asset_tag: "", serial_number: "", category: "", facility_id: "", status: "in_service", purchased_on: "", maintenance_interval_days: "", certification_expires_on: "" });
    setModal("asset");
  };
  const openSpace = (f?: Row) => {
    setEditing(f ?? null);
    setSp(f ? { name: f.name, type: f.type, building: f.building ?? "", capacity: String(f.capacity), bookable: f.bookable, projector: !!f.features?.projector, accessible: f.features?.accessible !== false }
      : { name: "", type: "classroom", building: "", capacity: "30", bookable: true, projector: false, accessible: true });
    setModal("space");
  };

  return (
    <ModuleShell
      title="Rooms & Assets"
      icon={DoorOpen}
      tabs={tabs}
      activeTab={tab}
      onTab={setTab}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search rooms, bookings, equipment..."
      action={
        tab === "book" ? (
          <ActionButton icon={CalendarPlus} onClick={() => { setR({ ...r, facility_id: facilities.rows.find((f) => f.bookable)?.id ?? "", date: day }); setModal("reserve"); }}>Book a Room</ActionButton>
        ) : tab === "spaces" && admin ? (
          <ActionButton icon={Plus} onClick={() => openSpace()}>Add Space</ActionButton>
        ) : tab === "assets" ? (
          <ActionButton icon={Plus} onClick={() => openAsset()}>Register Asset</ActionButton>
        ) : null
      }
    >
      {modal === "reserve" && (
        <Modal title="Book a Room" icon={CalendarPlus} onClose={() => setModal("")}>
          <form onSubmit={reserve} className="space-y-4">
            <Field label="Room">
              <select required className={inputClass} value={r.facility_id} onChange={(e) => setR({ ...r, facility_id: e.target.value })}>
                <option value="">Select…</option>
                {facilities.rows.filter((f) => f.bookable).map((f) => <option key={f.id} value={f.id}>{f.name} ({f.capacity} seats)</option>)}
              </select>
            </Field>
            <Field label="Purpose"><input required className={inputClass} value={r.title} onChange={(e) => setR({ ...r, title: e.target.value })} placeholder="Group study, club meeting…" /></Field>
            <Field label="Date"><input type="date" required className={inputClass} value={r.date} onChange={(e) => setR({ ...r, date: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="From"><input type="time" required className={inputClass} value={r.start} onChange={(e) => setR({ ...r, start: e.target.value })} /></Field>
              <Field label="To"><input type="time" required className={inputClass} value={r.end} onChange={(e) => setR({ ...r, end: e.target.value })} /></Field>
            </div>
            {!staff && <p className="text-xs text-slate-500">Student bookings are limited to 4 hours.</p>}
            <SubmitButton busy={busy}>Confirm Booking</SubmitButton>
          </form>
        </Modal>
      )}

      {modal === "space" && (
        <Modal title={editing ? "Edit Space" : "Add Space"} icon={DoorOpen} onClose={() => { setModal(""); setEditing(null); }}>
          <form onSubmit={saveSpace} className="space-y-4">
            <Field label="Name"><input required className={inputClass} value={sp.name} onChange={(e) => setSp({ ...sp, name: e.target.value })} placeholder="Room 101" /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Type">
                <select className={inputClass} value={sp.type} onChange={(e) => setSp({ ...sp, type: e.target.value })}>
                  {TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
                </select>
              </Field>
              <Field label="Capacity"><input type="number" min="1" required className={inputClass} value={sp.capacity} onChange={(e) => setSp({ ...sp, capacity: e.target.value })} /></Field>
            </div>
            <Field label="Building"><input className={inputClass} value={sp.building} onChange={(e) => setSp({ ...sp, building: e.target.value })} /></Field>
            <div className="flex flex-wrap gap-4 text-sm font-semibold text-slate-600">
              <label className="flex items-center gap-2"><input type="checkbox" checked={sp.bookable} onChange={(e) => setSp({ ...sp, bookable: e.target.checked })} /> Bookable</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={sp.projector} onChange={(e) => setSp({ ...sp, projector: e.target.checked })} /> Projector</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={sp.accessible} onChange={(e) => setSp({ ...sp, accessible: e.target.checked })} /> Wheelchair accessible</label>
            </div>
            <SubmitButton busy={busy}>Save</SubmitButton>
          </form>
        </Modal>
      )}

      {modal === "asset" && (
        <Modal title={editing ? "Edit Asset" : "Register Asset"} icon={Package} onClose={() => { setModal(""); setEditing(null); }}>
          <form onSubmit={saveAsset} className="space-y-4">
            <Field label="Name"><input required className={inputClass} value={as.name} onChange={(e) => setAs({ ...as, name: e.target.value })} placeholder="3D printer" /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Asset Tag"><input required className={inputClass} value={as.asset_tag} onChange={(e) => setAs({ ...as, asset_tag: e.target.value })} placeholder="AST-0001" /></Field>
              <Field label="Serial Number"><input className={inputClass} value={as.serial_number} onChange={(e) => setAs({ ...as, serial_number: e.target.value })} /></Field>
              <Field label="Category"><input className={inputClass} value={as.category} onChange={(e) => setAs({ ...as, category: e.target.value })} placeholder="Lab equipment" /></Field>
              <Field label="Status">
                <select className={inputClass} value={as.status} onChange={(e) => setAs({ ...as, status: e.target.value })}>
                  {["in_service", "maintenance", "retired", "lost"].map((s) => <option key={s} value={s}>{label(s)}</option>)}
                </select>
              </Field>
              <Field label="Purchased"><input type="date" className={inputClass} value={as.purchased_on} onChange={(e) => setAs({ ...as, purchased_on: e.target.value })} /></Field>
              <Field label="Service Every (days)"><input type="number" min="1" className={inputClass} value={as.maintenance_interval_days} onChange={(e) => setAs({ ...as, maintenance_interval_days: e.target.value })} /></Field>
              <Field label="Certification Expires"><input type="date" className={inputClass} value={as.certification_expires_on} onChange={(e) => setAs({ ...as, certification_expires_on: e.target.value })} /></Field>
              <Field label="Location">
                <select className={inputClass} value={as.facility_id} onChange={(e) => setAs({ ...as, facility_id: e.target.value })}>
                  <option value="">—</option>
                  {facilities.rows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </Field>
            </div>
            <SubmitButton busy={busy}>Save</SubmitButton>
          </form>
        </Modal>
      )}

      {modal === "service" && (
        <Modal title="Log Maintenance" icon={Wrench} onClose={() => setModal("")}>
          <form onSubmit={logService} className="space-y-4">
            <Field label="Asset">
              <select required className={inputClass} value={svc.asset_id} onChange={(e) => setSvc({ ...svc, asset_id: e.target.value })}>
                <option value="">Select…</option>
                {assets.rows.map((a) => <option key={a.id} value={a.id}>{a.asset_tag} — {a.name}</option>)}
              </select>
            </Field>
            <Field label="Performed On"><input type="date" required className={inputClass} value={svc.performed_on} onChange={(e) => setSvc({ ...svc, performed_on: e.target.value })} /></Field>
            <Field label="Notes"><textarea className={inputClass} value={svc.notes} onChange={(e) => setSvc({ ...svc, notes: e.target.value })} /></Field>
            <SubmitButton busy={busy}>Save</SubmitButton>
          </form>
        </Modal>
      )}

      {tab === "book" && (
        <div className="space-y-6">
          <Card title="Room availability" action={<input aria-label="Day" type="date" value={day} onChange={(e) => setDay(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm" />}>
            {reservations.loading || facilities.loading ? <Loading /> : (
              <Table headers={["Room", "Bookings on " + fmtDate(day + "T12:00")]} empty={facilities.rows.filter((f) => f.bookable).length === 0 && "No bookable rooms yet."}>
                {facilities.rows.filter((f) => f.bookable && matches(search, f.name, f.building, f.type)).map((f) => {
                  const list = dayBookings.filter((b) => b.facility_id === f.id);
                  return (
                    <tr key={f.id}>
                      <td className="px-6 py-4"><p className="font-bold text-slate-800">{f.name}</p><p className="text-xs text-slate-400">{label(f.type)} • {f.capacity} seats</p></td>
                      <td className="px-6 py-4">
                        {list.length === 0 ? <Badge color="green">Free all day</Badge> : (
                          <div className="flex flex-wrap gap-2">
                            {list.map((b) => (
                              <span key={b.id} className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg px-2 py-1 font-semibold">
                                {new Date(b.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–{new Date(b.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} {b.title} ({b.booked_by_name ?? "—"})
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Card>
          <Card title={staff ? "All upcoming bookings" : "My bookings"}>
            <Table headers={["Room", "Purpose", "When", "Booked by", ""]} empty={"No upcoming bookings."}>
              {(staff ? reservations.rows.filter((x) => x.status === "confirmed" && new Date(x.ends_at) > new Date()) : myUpcoming)
                .filter((x) => matches(search, x.title, nameOf(x.facility_id), x.booked_by_name))
                .map((x) => (
                  <tr key={x.id}>
                    <td className="px-6 py-3 font-bold">{nameOf(x.facility_id)}</td>
                    <td className="px-6 py-3">{x.title}</td>
                    <td className="px-6 py-3 text-sm text-slate-500 whitespace-nowrap">{fmtDateTime(x.starts_at)} – {new Date(x.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-6 py-3 text-sm">{x.booked_by_name}</td>
                    <td className="px-6 py-3 text-right">{(staff || x.user_id === profile?.id) && <IconButton icon={XCircle} title="Cancel booking" danger onClick={() => cancel(x)} />}</td>
                  </tr>
                ))}
            </Table>
          </Card>
        </div>
      )}

      {tab === "spaces" && (
        <Card title="Rooms, labs & halls">
          {facilities.loading ? <Loading /> : (
            <Table headers={["Name", "Type", "Building", "Capacity", "Features", "Bookable", ...(admin ? [""] : [])]} empty={facilities.rows.length === 0 && "No spaces yet."}>
              {facilities.rows.filter((f) => matches(search, f.name, f.building, f.type)).map((f) => (
                <tr key={f.id}>
                  <td className="px-6 py-4 font-bold text-slate-800">{f.name}</td>
                  <td className="px-6 py-4 text-sm capitalize">{label(f.type)}</td>
                  <td className="px-6 py-4 text-sm">{f.building ?? "—"}</td>
                  <td className="px-6 py-4">{f.capacity}</td>
                  <td className="px-6 py-4 text-xs text-slate-500">{[f.features?.projector && "Projector", f.features?.accessible !== false && "Accessible"].filter(Boolean).join(" • ") || "—"}</td>
                  <td className="px-6 py-4"><Badge color={f.bookable ? "green" : "slate"}>{f.bookable ? "Yes" : "No"}</Badge></td>
                  {admin && (
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <IconButton icon={Pencil} title="Edit" onClick={() => openSpace(f)} />
                      <IconButton icon={Trash2} title="Delete" danger onClick={() => confirmAction(`Delete ${f.name}? Its bookings are removed too.`) && facilities.remove(f.id, "Space deleted.")} />
                    </td>
                  )}
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {tab === "devices" && staff && <DevicesPanel admin={admin} facilities={facilities.rows} assets={assets.rows} />}

      {tab === "assets" && staff && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard label="Assets" value={assets.rows.filter((a) => a.status !== "retired").length} icon={Package} color="indigo" />
            <StatCard label="Service Overdue" value={overdue.length} icon={Wrench} color="red" />
            <StatCard label="Certs Expiring (30d)" value={certSoon.length} icon={AlertTriangle} color="orange" />
          </div>
          {overdue.length > 0 && (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-100 text-sm text-red-700">
              <b>Maintenance overdue:</b> {overdue.map((d) => `${d.asset_tag} ${d.name} (due ${fmtDate(d.next_maintenance_on)})`).join(", ")}
            </div>
          )}
          <Card title="Asset register" action={<button onClick={() => { setSvc({ asset_id: assets.rows[0]?.id ?? "", performed_on: localDate(), notes: "" }); setModal("service"); }} className="flex items-center gap-2 text-sm font-bold text-emerald-700 bg-emerald-50 px-4 py-2 rounded-xl"><Wrench size={16} /> Log maintenance</button>}>
            {assets.loading ? <Loading /> : (
              <Table headers={["Tag", "Asset", "Location", "Status", "Next Service", "Certification", ""]} empty={assets.rows.length === 0 && "No assets registered yet."}>
                {assets.rows.filter((a) => matches(search, a.name, a.asset_tag, a.serial_number, a.category)).map((a) => {
                  const next = due.find((d) => d.id === a.id)?.next_maintenance_on;
                  return (
                    <tr key={a.id}>
                      <td className="px-6 py-4 font-mono text-xs">{a.asset_tag}</td>
                      <td className="px-6 py-4"><p className="font-bold text-slate-800">{a.name}</p><p className="text-xs text-slate-400">{a.category ?? ""}{a.serial_number ? ` • S/N ${a.serial_number}` : ""}</p></td>
                      <td className="px-6 py-4 text-sm">{a.facility_id ? nameOf(a.facility_id) : "—"}</td>
                      <td className="px-6 py-4"><Badge color={a.status === "in_service" ? "green" : a.status === "maintenance" ? "orange" : "slate"}>{label(a.status)}</Badge></td>
                      <td className={`px-6 py-4 text-sm ${next && next < today ? "text-red-600 font-bold" : ""}`}>{next ? fmtDate(next) : "—"}</td>
                      <td className={`px-6 py-4 text-sm ${certSoon.includes(a) ? "text-orange-600 font-bold" : ""}`}>{a.certification_expires_on ? fmtDate(a.certification_expires_on) : "—"}</td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <IconButton icon={Wrench} title="Log maintenance" onClick={() => { setSvc({ asset_id: a.id, performed_on: localDate(), notes: "" }); setModal("service"); }} />
                        <IconButton icon={Pencil} title="Edit" onClick={() => openAsset(a)} />
                        {admin && <IconButton icon={Trash2} title="Delete" danger onClick={() => confirmAction(`Delete ${a.name}?`) && assets.remove(a.id, "Asset deleted.")} />}
                      </td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Card>
        </div>
      )}
    </ModuleShell>
  );
}
