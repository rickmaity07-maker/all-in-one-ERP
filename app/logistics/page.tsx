"use client";

import { useState } from "react";
import { Car, Plus, Bus, Clock, MapPin, User, Trash2, List, CheckCircle2, AlertTriangle } from "lucide-react";
import { useSession, isStaff } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import { ModuleShell, Modal, Field, SubmitButton, ActionButton, PageHeading, Card, Loading, Empty, Badge, StatCard, IconButton, inputClass, toast, confirmAction } from "@/components/ui";
import { downloadCsv, initials, matches, type Row } from "@/lib/utils";

type TabId = "routes" | "mine";
const STATUS_COLOR: Record<string, string> = { "On Time": "green", Delayed: "orange", Cancelled: "red", "Not Running": "slate" };

export default function Logistics() {
  const { role, profile } = useSession();
  const staff = isStaff(role);
  const [activeTab, setActiveTab] = useState<TabId>("routes");
  const [search, setSearch] = useState("");
  const routes = useTable("transport_routes", { orderBy: "departure_time", ascending: true });
  const subs = useTable("transport_subscriptions");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", vehicle: "", driver: "", departure_time: "07:30", stops: "", capacity: "40" });
  const [manifestOf, setManifestOf] = useState<Row | null>(null);

  const ridersOf = (id: string) => subs.rows.filter((s) => s.route_id === id);
  const mySub = (id: string) => subs.rows.find((s) => s.route_id === id && s.rider_id === profile?.id);

  const toggle = async (r: Row) => {
    const mine = mySub(r.id);
    if (mine) return subs.remove(mine.id, `Removed from ${r.name}.`);
    if (ridersOf(r.id).length >= r.capacity) return toast("This route is full.", "error");
    return subs.insert({ route_id: r.id, rider_id: profile?.id, rider_name: profile?.full_name }, `Seat reserved on ${r.name}.`);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const row = await routes.insert({ ...form, capacity: parseInt(form.capacity) || 40, status: "On Time" }, "Route added.");
    setBusy(false);
    if (row) {
      setIsModalOpen(false);
      setForm({ name: "", vehicle: "", driver: "", departure_time: "07:30", stops: "", capacity: "40" });
    }
  };

  const visible = routes.rows
    .filter((r) => activeTab === "routes" || mySub(r.id))
    .filter((r) => matches(search, r.name, r.stops, r.driver, r.vehicle));
  const seatsUsed = subs.rows.length;
  const seatsTotal = routes.rows.reduce((s, r) => s + Number(r.capacity), 0);

  return (
    <ModuleShell
      title="Transport"
      icon={Car}
      tabs={[
        { id: "routes", label: "Shuttle Routes", icon: Bus, group: "Logistics" },
        { id: "mine", label: `My Routes (${routes.rows.filter((r) => mySub(r.id)).length})`, icon: CheckCircle2, group: "Logistics" },
      ]}
      activeTab={activeTab}
      onTab={setActiveTab}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search routes, stops, drivers..."
      action={staff && <ActionButton icon={Plus} onClick={() => setIsModalOpen(true)}>Add Route</ActionButton>}
    >
      {isModalOpen && (
        <Modal title="Add Shuttle Route" icon={Bus} onClose={() => setIsModalOpen(false)}>
          <form onSubmit={handleSave} className="space-y-4">
            <Field label="Route Name"><input required className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Line 1 — City Centre" /></Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Departure"><input type="time" required className={inputClass} value={form.departure_time} onChange={(e) => setForm({ ...form, departure_time: e.target.value })} /></Field>
              <Field label="Seats"><input type="number" min="1" className={inputClass} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Vehicle"><input className={inputClass} value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} placeholder="e.g. Bus WÜ-EA 123" /></Field>
              <Field label="Driver"><input className={inputClass} value={form.driver} onChange={(e) => setForm({ ...form, driver: e.target.value })} /></Field>
            </div>
            <Field label="Stops (in order, comma separated)"><textarea rows={2} className={inputClass} value={form.stops} onChange={(e) => setForm({ ...form, stops: e.target.value })} placeholder="Hauptbahnhof, Sanderring, Campus Nord" /></Field>
            <SubmitButton busy={busy}>Save Route</SubmitButton>
          </form>
        </Modal>
      )}

      {manifestOf && (
        <Modal title={`Manifest — ${manifestOf.name}`} icon={List} onClose={() => setManifestOf(null)}>
          {ridersOf(manifestOf.id).length === 0 ? (
            <Empty>No riders yet.</Empty>
          ) : (
            <>
              <div className="space-y-2 mb-4">
                {ridersOf(manifestOf.id).map((s, i) => (
                  <div key={s.id} className="flex items-center gap-3 text-sm">
                    <span className="text-xs text-slate-400 w-5">{i + 1}.</span>
                    <span className="w-8 h-8 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center">{initials(s.rider_name)}</span>
                    <span className="font-semibold text-slate-700">{s.rider_name}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => downloadCsv(`${manifestOf.name}-manifest.csv`, ridersOf(manifestOf.id), [{ key: "rider_name", label: "Rider" }, { key: "created_at", label: "Signed up" }])} className="text-sm font-bold text-blue-600">
                Export CSV
              </button>
            </>
          )}
        </Modal>
      )}

      {routes.loading ? (
        <Loading />
      ) : (
        <>
          <PageHeading title={activeTab === "routes" ? "Logistics & Transport" : "My Routes"} subtitle="Campus shuttle timetable with live status. Reserve a seat on the routes you ride." />
          {activeTab === "routes" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <StatCard label="Routes" value={routes.rows.length} icon={Bus} color="indigo" />
              <StatCard label="Seats Reserved" value={`${seatsUsed}/${seatsTotal}`} icon={User} color="blue" />
              <StatCard label="Delayed / Cancelled" value={routes.rows.filter((r) => r.status === "Delayed" || r.status === "Cancelled").length} icon={AlertTriangle} color="orange" />
            </div>
          )}
          {visible.length === 0 ? (
            <Empty>{activeTab === "routes" ? "No routes configured yet." : "You haven't reserved a seat on any route."}</Empty>
          ) : (
            <div className="space-y-4">
              {visible.map((r) => {
                const riders = ridersOf(r.id).length;
                const joined = !!mySub(r.id);
                const stops = String(r.stops ?? "").split(",").map((s) => s.trim()).filter(Boolean);
                return (
                  <Card key={r.id}>
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex items-start gap-5 min-w-0">
                        <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-cyan-400 to-blue-600 text-white flex items-center justify-center shrink-0"><Bus size={26} /></div>
                        <div className="min-w-0">
                          <h4 className="text-lg font-black text-slate-800">{r.name}</h4>
                          <p className="text-sm text-slate-500 flex items-center gap-4 mt-1 flex-wrap">
                            <span className="flex items-center gap-1"><Clock size={14} /> Departs {r.departure_time}</span>
                            {r.vehicle && <span className="flex items-center gap-1"><Car size={14} /> {r.vehicle}</span>}
                            {r.driver && <span className="flex items-center gap-1"><User size={14} /> {r.driver}</span>}
                          </p>
                          {stops.length > 0 && (
                            <div className="flex items-center gap-2 mt-4 flex-wrap">
                              {stops.map((s, i) => (
                                <span key={i} className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                                  <span className="flex items-center gap-1 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-lg"><MapPin size={12} className="text-blue-500" /> {s}</span>
                                  {i < stops.length - 1 && <span className="text-slate-300">→</span>}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-3 shrink-0">
                        {staff ? (
                          <select value={r.status} onChange={(e) => routes.update(r.id, { status: e.target.value }, "Status updated.")} className="text-xs font-bold uppercase bg-slate-100 rounded-lg px-2 py-1 outline-none">
                            {Object.keys(STATUS_COLOR).map((s) => <option key={s}>{s}</option>)}
                          </select>
                        ) : (
                          <Badge color={STATUS_COLOR[r.status]}>{r.status}</Badge>
                        )}
                        <p className="text-xs font-bold text-slate-500">{riders}/{r.capacity} seats</p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggle(r)}
                            disabled={!joined && riders >= r.capacity}
                            className={`px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-40 ${joined ? "bg-slate-100 text-slate-700 hover:bg-slate-200" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}
                          >
                            {joined ? "Leave Route" : "Reserve Seat"}
                          </button>
                          {staff && <IconButton icon={List} title="Rider manifest" onClick={() => setManifestOf(r)} />}
                          {staff && <IconButton icon={Trash2} title="Delete route" danger onClick={() => confirmAction(`Delete ${r.name}?`) && routes.remove(r.id, "Route deleted.")} />}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </ModuleShell>
  );
}
