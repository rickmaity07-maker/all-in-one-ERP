"use client";

import { useState } from "react";
import { Ticket, Plus, Users, CalendarDays, MapPin, Trash2, UserPlus, UserMinus, PartyPopper, List } from "lucide-react";
import { useSession, isStaff } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import { ModuleShell, Modal, Field, SubmitButton, ActionButton, PageHeading, Loading, Empty, Badge, IconButton, inputClass, toast, confirmAction } from "@/components/ui";
import { initials, matches, localDate, type Row } from "@/lib/utils";

type TabId = "events" | "clubs";

export default function CampusLife() {
  const { role, profile } = useSession();
  const staff = isStaff(role);
  const [activeTab, setActiveTab] = useState<TabId>("events");
  const [search, setSearch] = useState("");
  const clubs = useTable("clubs", { orderBy: "name", ascending: true });
  const members = useTable("club_members");
  const events = useTable("campus_events", { orderBy: "event_date", ascending: true });
  const rsvps = useTable("event_rsvps");

  const [modal, setModal] = useState<"" | "club" | "event">("");
  const [busy, setBusy] = useState(false);
  const [club, setClub] = useState({ name: "", category: "Academic", description: "" });
  const [evt, setEvt] = useState({ title: "", event_date: "", location: "", capacity: "", description: "" });
  const [attendeesOf, setAttendeesOf] = useState<Row | null>(null);

  const today = localDate();
  const membersOf = (id: string) => members.rows.filter((m) => m.club_id === id);
  const rsvpsOf = (id: string) => rsvps.rows.filter((r) => r.event_id === id);
  const myMembership = (id: string) => members.rows.find((m) => m.club_id === id && m.member_id === profile?.id);
  const myRsvp = (id: string) => rsvps.rows.find((r) => r.event_id === id && r.attendee_id === profile?.id);

  const toggleRsvp = async (e: Row) => {
    const mine = myRsvp(e.id);
    if (mine) return rsvps.remove(mine.id, "RSVP cancelled.");
    if (e.capacity && rsvpsOf(e.id).length >= e.capacity) return toast("This event is full.", "error");
    return rsvps.insert({ event_id: e.id, attendee_id: profile?.id, attendee_name: profile?.full_name }, "You're on the list!");
  };

  const toggleMembership = async (c: Row) => {
    const mine = myMembership(c.id);
    if (mine) return members.remove(mine.id, `You left ${c.name}.`);
    return members.insert({ club_id: c.id, member_id: profile?.id, member_name: profile?.full_name }, `Welcome to ${c.name}!`);
  };

  const submit = (fn: () => Promise<Row | null>, reset: () => void) => async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const row = await fn();
    setBusy(false);
    if (row) {
      reset();
      setModal("");
    }
  };

  const upcoming = events.rows.filter((e) => e.event_date >= today && matches(search, e.title, e.location, e.description));
  const visibleClubs = clubs.rows.filter((c) => matches(search, c.name, c.category, c.description));

  return (
    <ModuleShell
      title="Student Life"
      icon={Ticket}
      tabs={[
        { id: "events", label: "Campus Events", icon: CalendarDays, group: "Community" },
        { id: "clubs", label: "Clubs & Societies", icon: Users, group: "Community" },
      ]}
      activeTab={activeTab}
      onTab={setActiveTab}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search events and clubs..."
      action={staff && <ActionButton icon={Plus} onClick={() => setModal(activeTab === "clubs" ? "club" : "event")}>{activeTab === "clubs" ? "New Club" : "New Event"}</ActionButton>}
    >
      {modal === "club" && (
        <Modal title="New Club" icon={Users} onClose={() => setModal("")}>
          <form onSubmit={submit(() => clubs.insert(club, "Club created."), () => setClub({ name: "", category: "Academic", description: "" }))} className="space-y-4">
            <Field label="Name"><input required className={inputClass} value={club.name} onChange={(e) => setClub({ ...club, name: e.target.value })} /></Field>
            <Field label="Category">
              <select className={inputClass} value={club.category} onChange={(e) => setClub({ ...club, category: e.target.value })}>
                {["Academic", "Sports", "Arts", "Tech", "Social", "Volunteering"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Description"><textarea rows={3} className={inputClass} value={club.description} onChange={(e) => setClub({ ...club, description: e.target.value })} /></Field>
            <SubmitButton busy={busy}>Create Club</SubmitButton>
          </form>
        </Modal>
      )}

      {modal === "event" && (
        <Modal title="New Event" icon={PartyPopper} onClose={() => setModal("")}>
          <form
            onSubmit={submit(
              () => events.insert({ ...evt, capacity: parseInt(evt.capacity) || null }, "Event published."),
              () => setEvt({ title: "", event_date: "", location: "", capacity: "", description: "" })
            )}
            className="space-y-4"
          >
            <Field label="Title"><input required className={inputClass} value={evt.title} onChange={(e) => setEvt({ ...evt, title: e.target.value })} /></Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Date"><input type="date" min={today} required className={inputClass} value={evt.event_date} onChange={(e) => setEvt({ ...evt, event_date: e.target.value })} /></Field>
              <Field label="Capacity (blank = unlimited)"><input type="number" min="1" className={inputClass} value={evt.capacity} onChange={(e) => setEvt({ ...evt, capacity: e.target.value })} /></Field>
            </div>
            <Field label="Location"><input className={inputClass} value={evt.location} onChange={(e) => setEvt({ ...evt, location: e.target.value })} /></Field>
            <Field label="Description"><textarea rows={3} className={inputClass} value={evt.description} onChange={(e) => setEvt({ ...evt, description: e.target.value })} /></Field>
            <SubmitButton busy={busy}>Publish Event</SubmitButton>
          </form>
        </Modal>
      )}

      {attendeesOf && (
        <Modal title={`Attendees — ${attendeesOf.title}`} icon={List} onClose={() => setAttendeesOf(null)}>
          {rsvpsOf(attendeesOf.id).length === 0 ? (
            <Empty>No RSVPs yet.</Empty>
          ) : (
            <div className="space-y-2">
              {rsvpsOf(attendeesOf.id).map((r, i) => (
                <div key={r.id} className="flex items-center gap-3 p-2 text-sm">
                  <span className="text-xs text-slate-400 w-5">{i + 1}.</span>
                  <span className="w-8 h-8 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center">{initials(r.attendee_name)}</span>
                  <span className="font-semibold text-slate-700">{r.attendee_name}</span>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {events.loading || clubs.loading ? (
        <Loading />
      ) : activeTab === "events" ? (
        <>
          <PageHeading title="Campus Events" subtitle="Talks, socials, hackathons and more. RSVP to save your spot." />
          {upcoming.length === 0 ? (
            <Empty>No upcoming events.</Empty>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {upcoming.map((e) => {
                const count = rsvpsOf(e.id).length;
                const full = e.capacity && count >= e.capacity;
                const going = !!myRsvp(e.id);
                const d = new Date(e.event_date + "T00:00");
                return (
                  <div key={e.id} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                    <div className="bg-linear-to-br from-[#8A2387] to-[#E94057] p-6 text-white flex items-end justify-between">
                      <div>
                        <p className="text-4xl font-black leading-none">{d.getDate()}</p>
                        <p className="text-xs font-bold uppercase tracking-wider text-white/80">{d.toLocaleString(undefined, { month: "short", weekday: "short" })}</p>
                      </div>
                      {going && <Badge color="green">Going</Badge>}
                    </div>
                    <div className="p-6 flex flex-col flex-1">
                      <h4 className="font-black text-slate-800 mb-1">{e.title}</h4>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mb-3"><MapPin size={12} /> {e.location || "TBA"}</p>
                      {e.description && <p className="text-sm text-slate-600 mb-4 line-clamp-3">{e.description}</p>}
                      <p className="text-xs font-bold text-slate-500 mb-4">{count}{e.capacity ? ` / ${e.capacity}` : ""} attending</p>
                      <div className="mt-auto flex gap-2">
                        <button
                          disabled={!going && !!full}
                          onClick={() => toggleRsvp(e)}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-40 ${going ? "bg-slate-100 text-slate-700 hover:bg-slate-200" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}
                        >
                          {going ? "Cancel RSVP" : full ? "Full" : "RSVP"}
                        </button>
                        {staff && <IconButton icon={List} title="Attendees" onClick={() => setAttendeesOf(e)} />}
                        {staff && <IconButton icon={Trash2} title="Delete" danger onClick={() => confirmAction("Delete this event?") && events.remove(e.id, "Event deleted.")} />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <PageHeading title="Clubs & Societies" subtitle="Find your people. Join as many clubs as you like." />
          {visibleClubs.length === 0 ? (
            <Empty>No clubs yet.</Empty>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {visibleClubs.map((c) => {
                const joined = !!myMembership(c.id);
                const list = membersOf(c.id);
                return (
                  <div key={c.id} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-cyan-400 to-blue-600 text-white flex items-center justify-center font-black">{initials(c.name)}</div>
                      <Badge color="blue">{c.category}</Badge>
                    </div>
                    <h4 className="font-black text-slate-800">{c.name}</h4>
                    <p className="text-sm text-slate-600 my-2 line-clamp-3">{c.description}</p>
                    <div className="flex -space-x-2 my-3">
                      {list.slice(0, 5).map((m) => (
                        <span key={m.id} title={m.member_name} className="w-8 h-8 rounded-full bg-slate-700 border-2 border-white text-white text-[10px] font-bold flex items-center justify-center">{initials(m.member_name)}</span>
                      ))}
                      {list.length > 5 && <span className="w-8 h-8 rounded-full bg-slate-300 border-2 border-white text-[10px] font-bold flex items-center justify-center">+{list.length - 5}</span>}
                    </div>
                    <p className="text-xs font-bold text-slate-500 mb-4">{list.length} member(s)</p>
                    <div className="mt-auto flex gap-2">
                      <button onClick={() => toggleMembership(c)} className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 ${joined ? "bg-slate-100 text-slate-700 hover:bg-slate-200" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}>
                        {joined ? <><UserMinus size={14} /> Leave</> : <><UserPlus size={14} /> Join</>}
                      </button>
                      {staff && <IconButton icon={Trash2} title="Delete club" danger onClick={() => confirmAction(`Delete ${c.name}?`) && clubs.remove(c.id, "Club deleted.")} />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </ModuleShell>
  );
}
