"use client";

import { useState } from "react";
import { Cpu, Plus, Wrench, CalendarPlus, CalendarCheck, Trash2, Printer as Printer3d, CircuitBoard, Hammer } from "lucide-react";
import { useSession, isStaff } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import { ModuleShell, Modal, Field, SubmitButton, ActionButton, PageHeading, Card, Table, Loading, Empty, Badge, StatCard, IconButton, inputClass, toast, confirmAction } from "@/components/ui";
import { fmtDate, matches, localDate, type Row } from "@/lib/utils";

type TabId = "equipment" | "bookings" | "mine";
const STATUS_COLOR: Record<string, string> = { Available: "green", "In Use": "orange", Maintenance: "red", Retired: "slate" };

export default function MakerSpace() {
  const { role, profile } = useSession();
  const staff = isStaff(role);
  const [activeTab, setActiveTab] = useState<TabId>("equipment");
  const [search, setSearch] = useState("");
  const equipment = useTable("lab_equipment", { orderBy: "name", ascending: true });
  const bookings = useTable("lab_bookings", { orderBy: "booking_date", ascending: true });

  const [modal, setModal] = useState<"" | "equipment" | "booking">("");
  const [busy, setBusy] = useState(false);
  const [eq, setEq] = useState({ name: "", lab: "", category: "3D Printing", notes: "" });
  const [bk, setBk] = useState({ equipment_id: "", booking_date: "", start_time: "09:00", end_time: "11:00", purpose: "" });

  const today = localDate();
  const nameOf = (id: string) => equipment.rows.find((e) => e.id === id)?.name ?? "Removed equipment";
  const upcoming = bookings.rows.filter((b) => b.booking_date >= today);
  const mine = upcoming.filter((b) => b.booked_by === profile?.id);

  const book = (id: string) => {
    setBk({ equipment_id: id, booking_date: today, start_time: "09:00", end_time: "11:00", purpose: "" });
    setModal("booking");
  };

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bk.end_time <= bk.start_time) return toast("End time must be after start time.", "error");
    const clash = bookings.rows.find(
      (b) => b.equipment_id === bk.equipment_id && b.booking_date === bk.booking_date && bk.start_time < b.end_time && b.start_time < bk.end_time
    );
    if (clash) return toast(`Already booked ${clash.start_time}–${clash.end_time} by ${clash.booker_name}.`, "error");
    setBusy(true);
    const row = await bookings.insert({ ...bk, booked_by: profile?.id, booker_name: profile?.full_name }, "Booking confirmed.");
    setBusy(false);
    if (row) setModal("");
  };

  const handleEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const row = await equipment.insert({ ...eq, status: "Available" }, "Equipment added.");
    setBusy(false);
    if (row) {
      setEq({ name: "", lab: "", category: "3D Printing", notes: "" });
      setModal("");
    }
  };

  const visibleEquipment = equipment.rows.filter((x) => matches(search, x.name, x.lab, x.category, x.status));
  const categoryIcon = (c: string) => (c === "3D Printing" ? Printer3d : c === "Electronics" ? CircuitBoard : c === "Machining" ? Hammer : Wrench);

  const bookingTable = (rows: Row[]) => (
    <Table headers={["Date", "Time", "Equipment", "Booked By", "Purpose", "Actions"]} empty={rows.length === 0 && "No upcoming bookings."}>
      {rows.map((b) => (
        <tr key={b.id}>
          <td className="px-6 py-4 font-semibold text-slate-700">{fmtDate(b.booking_date)}</td>
          <td className="px-6 py-4 text-slate-600">{b.start_time}–{b.end_time}</td>
          <td className="px-6 py-4 font-bold text-slate-800">{nameOf(b.equipment_id)}</td>
          <td className="px-6 py-4 text-slate-600">{b.booker_name}</td>
          <td className="px-6 py-4 text-slate-500 text-xs">{b.purpose}</td>
          <td className="px-6 py-4 text-right">
            {(staff || b.booked_by === profile?.id) && (
              <IconButton icon={Trash2} title="Cancel booking" danger onClick={() => confirmAction("Cancel this booking?") && bookings.remove(b.id, "Booking cancelled.")} />
            )}
          </td>
        </tr>
      ))}
    </Table>
  );

  return (
    <ModuleShell
      title="MakerSpace"
      icon={Cpu}
      tabs={[
        { id: "equipment", label: "Equipment & Labs", group: "Labs" },
        { id: "mine", label: `My Bookings (${mine.length})`, group: "Labs" },
        ...(staff ? [{ id: "bookings" as TabId, label: "All Bookings", group: "Labs" }] : []),
      ]}
      activeTab={activeTab}
      onTab={setActiveTab}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search equipment, labs, categories..."
      action={staff && <ActionButton icon={Plus} onClick={() => setModal("equipment")}>Add Equipment</ActionButton>}
    >
      {modal === "equipment" && (
        <Modal title="Add Equipment" icon={Wrench} onClose={() => setModal("")}>
          <form onSubmit={handleEquipment} className="space-y-4">
            <Field label="Name"><input required className={inputClass} value={eq.name} onChange={(e) => setEq({ ...eq, name: e.target.value })} placeholder="e.g. Prusa MK4 #2" /></Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Lab / Room"><input className={inputClass} value={eq.lab} onChange={(e) => setEq({ ...eq, lab: e.target.value })} placeholder="e.g. Lab 3" /></Field>
              <Field label="Category">
                <select className={inputClass} value={eq.category} onChange={(e) => setEq({ ...eq, category: e.target.value })}>
                  {["3D Printing", "Electronics", "Machining", "Robotics", "Other"].map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Notes"><textarea rows={2} className={inputClass} value={eq.notes} onChange={(e) => setEq({ ...eq, notes: e.target.value })} /></Field>
            <SubmitButton busy={busy}>Save</SubmitButton>
          </form>
        </Modal>
      )}

      {modal === "booking" && (
        <Modal title={`Book — ${nameOf(bk.equipment_id)}`} icon={CalendarPlus} onClose={() => setModal("")}>
          <form onSubmit={handleBooking} className="space-y-4">
            <Field label="Date"><input type="date" min={today} required className={inputClass} value={bk.booking_date} onChange={(e) => setBk({ ...bk, booking_date: e.target.value })} /></Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="From"><input type="time" required className={inputClass} value={bk.start_time} onChange={(e) => setBk({ ...bk, start_time: e.target.value })} /></Field>
              <Field label="Until"><input type="time" required className={inputClass} value={bk.end_time} onChange={(e) => setBk({ ...bk, end_time: e.target.value })} /></Field>
            </div>
            <Field label="Purpose"><input required className={inputClass} value={bk.purpose} onChange={(e) => setBk({ ...bk, purpose: e.target.value })} placeholder="e.g. Printing gearbox housing" /></Field>
            {bookings.rows.filter((b) => b.equipment_id === bk.equipment_id && b.booking_date === bk.booking_date).length > 0 && (
              <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl">
                Already booked that day:{" "}
                {bookings.rows.filter((b) => b.equipment_id === bk.equipment_id && b.booking_date === bk.booking_date).map((b) => `${b.start_time}–${b.end_time}`).join(", ")}
              </div>
            )}
            <SubmitButton busy={busy}>Confirm Booking</SubmitButton>
          </form>
        </Modal>
      )}

      {equipment.loading ? (
        <Loading />
      ) : activeTab === "equipment" ? (
        <>
          <PageHeading title="MakerSpace & Labs" subtitle="Browse lab equipment, check availability and reserve time slots." />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <StatCard label="Machines" value={equipment.rows.length} icon={Cpu} color="indigo" />
            <StatCard label="Available" value={equipment.rows.filter((x) => x.status === "Available").length} icon={CalendarCheck} color="emerald" />
            <StatCard label="In Maintenance" value={equipment.rows.filter((x) => x.status === "Maintenance").length} icon={Wrench} color="red" />
          </div>
          {visibleEquipment.length === 0 ? (
            <Empty>No equipment listed yet.</Empty>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {visibleEquipment.map((x) => {
                const Icon = categoryIcon(x.category);
                const todays = bookings.rows.filter((b) => b.equipment_id === x.id && b.booking_date === today);
                return (
                  <div key={x.id} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center"><Icon size={22} /></div>
                      {staff ? (
                        <select value={x.status} onChange={(e) => equipment.update(x.id, { status: e.target.value })} className="text-xs font-bold uppercase bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 outline-none">
                          {Object.keys(STATUS_COLOR).map((s) => <option key={s}>{s}</option>)}
                        </select>
                      ) : (
                        <Badge color={STATUS_COLOR[x.status]}>{x.status}</Badge>
                      )}
                    </div>
                    <h4 className="font-black text-slate-800">{x.name}</h4>
                    <p className="text-xs text-slate-500 mb-2">{x.category} • {x.lab || "Unassigned lab"}</p>
                    {x.notes && <p className="text-xs text-slate-500 mb-2">{x.notes}</p>}
                    <p className="text-xs text-slate-400 mb-4">{todays.length ? `Booked today: ${todays.map((b) => `${b.start_time}–${b.end_time}`).join(", ")}` : "Free all day today"}</p>
                    <div className="mt-auto flex gap-2">
                      <button
                        disabled={x.status === "Maintenance" || x.status === "Retired"}
                        onClick={() => book(x.id)}
                        className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-40 flex items-center justify-center gap-2"
                      >
                        <CalendarPlus size={16} /> Book
                      </button>
                      {staff && <IconButton icon={Trash2} title="Remove" danger onClick={() => confirmAction(`Remove ${x.name}? Its bookings are deleted too.`) && equipment.remove(x.id, "Equipment removed.")} />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : activeTab === "mine" ? (
        <>
          <PageHeading title="My Bookings" subtitle="Your upcoming lab reservations." />
          <Card>{bookingTable(mine)}</Card>
        </>
      ) : (
        <>
          <PageHeading title="All Bookings" subtitle="Every upcoming reservation across the labs." />
          <Card>{bookingTable(upcoming.filter((b) => matches(search, nameOf(b.equipment_id), b.booker_name, b.purpose)))}</Card>
        </>
      )}
    </ModuleShell>
  );
}
