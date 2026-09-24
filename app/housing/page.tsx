"use client";

import { useEffect, useState } from "react";
import { Building, Wrench, Utensils, MapPin, CreditCard, Plus, Trash2, CheckCircle2, BedDouble, UserPlus, LogOut as CheckOut } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, isStaff } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import { ModuleShell, Modal, Field, SubmitButton, ActionButton, PageHeading, Card, Table, Loading, Empty, Badge, StatCard, IconButton, inputClass, confirmAction } from "@/components/ui";
import { fmtDate, matches, money, type Row } from "@/lib/utils";

type TabId = "overview" | "tickets" | "meals";

export default function HousingPortal() {
  const { role, profile } = useSession();
  const staff = isStaff(role);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [search, setSearch] = useState("");

  const tickets = useTable("maintenance_tickets");
  const rooms = useTable("housing_rooms", { orderBy: "building", ascending: true });
  const assignments = useTable("housing_assignments");
  const meals = useTable("meal_accounts", { orderBy: "holder_name", ascending: true });
  const [residents, setResidents] = useState<Row[]>([]);

  const [modal, setModal] = useState<"" | "ticket" | "room" | "assign" | "meal" | "topup">("");
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState({ issue_title: "", location: "", priority: "Medium" });
  const [room, setRoom] = useState({ building: "", room_number: "", capacity: "2" });
  const [assign, setAssign] = useState({ room_id: "", resident_id: "", resident_name: "", term: "" });
  const [meal, setMeal] = useState({ profile_id: "", holder_name: "", plan: "Standard", balance: "0" });
  const [topup, setTopup] = useState<{ account: Row | null; amount: string }>({ account: null, amount: "50" });

  useEffect(() => {
    if (staff) supabase.from("profiles").select("id, full_name").order("full_name").then(({ data }) => setResidents(data ?? []));
  }, [staff]);

  const close = () => setModal("");
  const submit = (fn: () => Promise<unknown>) => async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await fn();
    setBusy(false);
    if (ok) close();
  };

  const occupants = (roomId: string) => assignments.rows.filter((a) => a.room_id === roomId && a.status === "Checked In");
  const totalBeds = rooms.rows.reduce((s, r) => s + Number(r.capacity), 0);
  const usedBeds = assignments.rows.filter((a) => a.status === "Checked In").length;
  const occupancy = totalBeds ? Math.round((usedBeds / totalBeds) * 100) : 0;
  const myAssignment = assignments.rows.find((a) => a.resident_id === profile?.id && a.status === "Checked In");
  const myRoom = myAssignment && rooms.rows.find((r) => r.id === myAssignment.room_id);
  const myMeal = meals.rows.find((m) => m.profile_id === profile?.id);
  const visibleTickets = tickets.rows.filter((t) => matches(search, t.issue_title, t.location, t.status));
  const openTickets = tickets.rows.filter((t) => t.status !== "Resolved");

  return (
    <ModuleShell
      title="Housing"
      icon={Building}
      tabs={[
        { id: "overview", label: staff ? "Rooms & Residents" : "My Accommodation", icon: BedDouble, group: "Campus Living" },
        { id: "tickets", label: `Maintenance (${openTickets.length})`, icon: Wrench, group: "Campus Living" },
        { id: "meals", label: "Meal Plans", icon: Utensils, group: "Campus Living" },
      ]}
      activeTab={activeTab}
      onTab={setActiveTab}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search facilities, tickets, or rooms..."
      action={<ActionButton icon={Plus} onClick={() => setModal("ticket")}>New Ticket</ActionButton>}
    >
      {modal === "ticket" && (
        <Modal title="Submit Maintenance Ticket" icon={Wrench} onClose={close}>
          <form
            onSubmit={submit(async () => {
              const row = await tickets.insert({ ...ticket, status: "Open", reported_by: profile?.id, reporter_name: profile?.full_name }, "Ticket submitted.");
              if (row) setTicket({ issue_title: "", location: "", priority: "Medium" });
              return row;
            })}
            className="space-y-4"
          >
            <Field label="Issue Title"><input required className={inputClass} value={ticket.issue_title} onChange={(e) => setTicket({ ...ticket, issue_title: e.target.value })} placeholder="e.g. HVAC malfunction" /></Field>
            <Field label="Location"><input required className={inputClass} value={ticket.location} onChange={(e) => setTicket({ ...ticket, location: e.target.value })} placeholder={myRoom ? `${myRoom.building}, Room ${myRoom.room_number}` : "e.g. Block B, Room 402"} /></Field>
            <Field label="Priority Level">
              <select className={inputClass} value={ticket.priority} onChange={(e) => setTicket({ ...ticket, priority: e.target.value })}>
                {["Low", "Medium", "High", "Critical"].map((p) => <option key={p}>{p}</option>)}
              </select>
            </Field>
            <SubmitButton busy={busy}>Submit Ticket</SubmitButton>
          </form>
        </Modal>
      )}

      {modal === "room" && (
        <Modal title="Add Room" icon={BedDouble} onClose={close}>
          <form onSubmit={submit(() => rooms.insert({ ...room, capacity: parseInt(room.capacity) || 1 }, "Room added."))} className="space-y-4">
            <Field label="Building"><input required className={inputClass} value={room.building} onChange={(e) => setRoom({ ...room, building: e.target.value })} placeholder="e.g. Block B" /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Room Number"><input required className={inputClass} value={room.room_number} onChange={(e) => setRoom({ ...room, room_number: e.target.value })} /></Field>
              <Field label="Beds"><input type="number" min="1" required className={inputClass} value={room.capacity} onChange={(e) => setRoom({ ...room, capacity: e.target.value })} /></Field>
            </div>
            <SubmitButton busy={busy}>Save Room</SubmitButton>
          </form>
        </Modal>
      )}

      {modal === "assign" && (
        <Modal title="Assign Resident" icon={UserPlus} onClose={close}>
          <form onSubmit={submit(() => assignments.insert({ ...assign, resident_id: assign.resident_id || null, status: "Checked In" }, "Resident checked in."))} className="space-y-4">
            <Field label="Room">
              <select required className={inputClass} value={assign.room_id} onChange={(e) => setAssign({ ...assign, room_id: e.target.value })}>
                <option value="">Select a room…</option>
                {rooms.rows.map((r) => (
                  <option key={r.id} value={r.id} disabled={occupants(r.id).length >= r.capacity}>
                    {r.building} — {r.room_number} ({occupants(r.id).length}/{r.capacity})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Resident Account">
              <select className={inputClass} value={assign.resident_id} onChange={(e) => setAssign({ ...assign, resident_id: e.target.value, resident_name: residents.find((r) => r.id === e.target.value)?.full_name ?? assign.resident_name })}>
                <option value="">— Not linked —</option>
                {residents.map((r) => <option key={r.id} value={r.id}>{r.full_name}</option>)}
              </select>
            </Field>
            <Field label="Resident Name"><input required className={inputClass} value={assign.resident_name} onChange={(e) => setAssign({ ...assign, resident_name: e.target.value })} /></Field>
            <Field label="Term"><input className={inputClass} value={assign.term} onChange={(e) => setAssign({ ...assign, term: e.target.value })} placeholder="e.g. Fall 2026 - Spring 2027" /></Field>
            <SubmitButton busy={busy}>Check In</SubmitButton>
          </form>
        </Modal>
      )}

      {modal === "meal" && (
        <Modal title="Open Meal Account" icon={Utensils} onClose={close}>
          <form onSubmit={submit(() => meals.insert({ ...meal, profile_id: meal.profile_id || null, balance: parseFloat(meal.balance) || 0 }, "Meal account opened."))} className="space-y-4">
            <Field label="Account Holder">
              <select className={inputClass} value={meal.profile_id} onChange={(e) => setMeal({ ...meal, profile_id: e.target.value, holder_name: residents.find((r) => r.id === e.target.value)?.full_name ?? meal.holder_name })}>
                <option value="">— Not linked —</option>
                {residents.map((r) => <option key={r.id} value={r.id}>{r.full_name}</option>)}
              </select>
            </Field>
            <Field label="Holder Name"><input required className={inputClass} value={meal.holder_name} onChange={(e) => setMeal({ ...meal, holder_name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Plan">
                <select className={inputClass} value={meal.plan} onChange={(e) => setMeal({ ...meal, plan: e.target.value })}>
                  {["Standard", "Gold", "Platinum"].map((p) => <option key={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Opening Balance ($)"><input type="number" step="0.01" className={inputClass} value={meal.balance} onChange={(e) => setMeal({ ...meal, balance: e.target.value })} /></Field>
            </div>
            <SubmitButton busy={busy}>Open Account</SubmitButton>
          </form>
        </Modal>
      )}

      {modal === "topup" && topup.account && (
        <Modal title={`Top Up — ${topup.account.holder_name}`} icon={CreditCard} onClose={close}>
          <form onSubmit={submit(() => meals.update(topup.account!.id, { balance: Number(topup.account!.balance) + (parseFloat(topup.amount) || 0) }, "Balance updated."))} className="space-y-4">
            <p className="text-sm text-slate-500">Current balance: <b>{money(topup.account.balance)}</b>. Use a negative amount to record a deduction.</p>
            <Field label="Amount ($)"><input type="number" step="0.01" required className={inputClass} value={topup.amount} onChange={(e) => setTopup({ ...topup, amount: e.target.value })} /></Field>
            <SubmitButton busy={busy}>Apply</SubmitButton>
          </form>
        </Modal>
      )}

      <PageHeading title="Campus Infrastructure" subtitle="Manage living arrangements, facility bookings, and maintenance operations." />

      {rooms.loading || tickets.loading ? (
        <Loading label="Loading facilities data..." />
      ) : activeTab === "tickets" ? (
        <Card title={`Live Maintenance Queue (${visibleTickets.length})`}>
          {visibleTickets.length === 0 ? (
            <Empty>No maintenance tickets logged.</Empty>
          ) : (
            <div className="space-y-4">
              {visibleTickets.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-5 rounded-2xl border border-slate-100 bg-slate-50 hover:border-blue-200 transition-all gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${["High", "Critical"].includes(t.priority) ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"}`}><Wrench size={22} /></div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-800 text-base mb-0.5">{t.issue_title}</h4>
                      <p className="text-xs font-medium text-slate-500 flex items-center gap-2">
                        <span className="flex items-center gap-1"><MapPin size={12} /> {t.location}</span> • <span>{t.priority}</span> • <span>Logged {fmtDate(t.created_at)}{t.reporter_name ? ` by ${t.reporter_name}` : ""}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {staff ? (
                      <select value={t.status} onChange={(e) => tickets.update(t.id, { status: e.target.value })} className="text-xs font-bold uppercase bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none">
                        {["Open", "In Progress", "Resolved"].map((s) => <option key={s}>{s}</option>)}
                      </select>
                    ) : (
                      <Badge color={t.status === "Resolved" ? "green" : t.status === "In Progress" ? "orange" : "red"}>{t.status}</Badge>
                    )}
                    {staff && t.status !== "Resolved" && (
                      <button onClick={() => tickets.update(t.id, { status: "Resolved" }, "Ticket resolved.")} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg border border-emerald-200" title="Mark Resolved"><CheckCircle2 size={16} /></button>
                    )}
                    {(staff || t.reported_by === profile?.id) && (
                      <IconButton icon={Trash2} title="Delete Ticket" danger onClick={() => confirmAction("Delete this ticket?") && tickets.remove(t.id, "Ticket deleted.")} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : activeTab === "meals" ? (
        staff ? (
          <Card title={`Meal Accounts (${meals.rows.length})`} action={<button onClick={() => setModal("meal")} className="flex items-center gap-2 text-sm font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl"><Plus size={16} /> Open Account</button>}>
            <Table headers={["Holder", "Plan", "Balance", "Actions"]} empty={meals.rows.length === 0 && "No meal accounts yet."}>
              {meals.rows.filter((m) => matches(search, m.holder_name, m.plan)).map((m) => (
                <tr key={m.id}>
                  <td className="px-6 py-4 font-bold text-slate-800">{m.holder_name}</td>
                  <td className="px-6 py-4"><Badge color="purple">{m.plan}</Badge></td>
                  <td className={`px-6 py-4 font-black ${Number(m.balance) < 10 ? "text-red-600" : "text-slate-800"}`}>{money(m.balance)}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => { setTopup({ account: m, amount: "50" }); setModal("topup"); }} className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg">Top Up</button>
                      <IconButton icon={Trash2} title="Close account" danger onClick={() => confirmAction(`Close ${m.holder_name}'s meal account?`) && meals.remove(m.id)} />
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
        ) : !myMeal ? (
          <Empty>You don&apos;t have a meal plan yet. Visit the housing office to open one.</Empty>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-linear-to-br from-orange-400 to-pink-500 rounded-4xl p-8 text-white shadow-lg relative overflow-hidden flex flex-col justify-between aspect-video">
              <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
              <div>
                <h3 className="text-lg font-bold text-white/90 mb-1 flex items-center gap-2"><Utensils size={20} /> Meal Plan Balance</h3>
                <p className="text-sm font-medium text-white/70">{myMeal.plan} Tier</p>
              </div>
              <div>
                <h4 className="text-5xl font-black mb-3">{money(myMeal.balance)}</h4>
                <p className="text-sm text-white/80">Top-ups are processed at the housing office or through Finance.</p>
              </div>
            </div>
          </div>
        )
      ) : staff ? (
        <>
          <div className="grid grid-cols-3 gap-6 mb-8">
            <StatCard label="Rooms" value={rooms.rows.length} icon={Building} color="indigo" />
            <StatCard label="Beds Occupied" value={`${usedBeds}/${totalBeds}`} icon={BedDouble} color="blue" />
            <StatCard label="Occupancy" value={`${occupancy}%`} icon={CheckCircle2} color="emerald" />
          </div>
          <Card
            title="Rooms & Residents"
            action={
              <div className="flex gap-2">
                <button onClick={() => setModal("room")} className="flex items-center gap-2 text-sm font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl"><Plus size={16} /> Add Room</button>
                <button onClick={() => setModal("assign")} className="flex items-center gap-2 text-sm font-bold text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl"><UserPlus size={16} /> Assign Resident</button>
              </div>
            }
          >
            {rooms.rows.length === 0 ? (
              <Empty>No rooms yet. Add your buildings and rooms to start assigning residents.</Empty>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {rooms.rows.filter((r) => matches(search, r.building, r.room_number, ...occupants(r.id).map((o) => o.resident_name))).map((r) => (
                  <div key={r.id} className="p-5 rounded-2xl border border-slate-100 bg-slate-50/50">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-black text-slate-800">{r.building} — {r.room_number}</p>
                        <p className="text-xs text-slate-500">{occupants(r.id).length}/{r.capacity} beds used</p>
                      </div>
                      <IconButton icon={Trash2} title="Delete room" danger onClick={() => confirmAction("Delete this room and its assignments?") && rooms.remove(r.id)} />
                    </div>
                    {occupants(r.id).length === 0 ? (
                      <p className="text-xs text-slate-400">Vacant</p>
                    ) : (
                      occupants(r.id).map((o) => (
                        <div key={o.id} className="flex items-center justify-between text-sm py-1">
                          <span className="font-semibold text-slate-700">{o.resident_name} <span className="text-xs text-slate-400">{o.term}</span></span>
                          <button onClick={() => assignments.update(o.id, { status: "Checked Out" }, `${o.resident_name} checked out.`)} className="text-xs font-bold text-slate-400 hover:text-red-500 flex items-center gap-1"><CheckOut size={12} /> Check out</button>
                        </div>
                      ))
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      ) : !myAssignment ? (
        <Empty>You have no residential assignment on record.</Empty>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          <Card className="col-span-2">
            <div className="flex items-start justify-between mb-8">
              <div>
                <h3 className="text-xl font-bold text-slate-800 mb-1">Residential Assignment</h3>
                <p className="text-sm font-medium text-slate-500 flex items-center gap-1.5"><MapPin size={16} /> {myRoom?.building}</p>
              </div>
              <Badge color="green">{myAssignment.status}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Building & Room</p>
                <p className="text-lg font-black text-slate-800">{myRoom?.building}, Room {myRoom?.room_number}</p>
              </div>
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Term</p>
                <p className="text-lg font-black text-slate-800">{myAssignment.term || "—"}</p>
              </div>
            </div>
          </Card>
          <div className="col-span-1 bg-linear-to-br from-cyan-400 to-blue-600 rounded-4xl p-8 text-white shadow-lg relative overflow-hidden flex flex-col justify-between">
            <div>
              <p className="text-cyan-100 font-semibold tracking-wide text-sm mb-2 uppercase">My Open Tickets</p>
              <h3 className="text-5xl font-black mb-4">{tickets.rows.filter((t) => t.reported_by === profile?.id && t.status !== "Resolved").length}</h3>
            </div>
            <button onClick={() => setModal("ticket")} className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-xl text-sm font-bold">Report an issue</button>
          </div>
        </div>
      )}
    </ModuleShell>
  );
}
