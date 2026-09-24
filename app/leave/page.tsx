"use client";

import { useEffect, useState } from "react";
import { Plane, Plus, Check, X, Trash2, Clock, CalendarDays } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, isAdmin } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import { ModuleShell, Modal, Field, SubmitButton, ActionButton, PageHeading, Card, Table, Loading, Badge, StatCard, IconButton, inputClass, toast, confirmAction } from "@/components/ui";
import { errorMessage, fmtDate, matches, localDate, type Row } from "@/lib/utils";

type TabId = "mine" | "review";
const STATUS_COLOR: Record<string, string> = { Pending: "orange", Approved: "green", Rejected: "red" };
const days = (r: Row) => Math.round((new Date(r.end_date).getTime() - new Date(r.start_date).getTime()) / 86400000) + 1;

export default function LeavePage() {
  const { role, profile } = useSession();
  const admin = isAdmin(role);
  const [activeTab, setActiveTab] = useState<TabId>(admin ? "review" : "mine");
  const [search, setSearch] = useState("");
  const requests = useTable("leave_requests");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const today = localDate();
  const parent = role === "parent";
  const forStudent = role === "student" || parent;
  const [form, setForm] = useState({ leave_type: forStudent ? "Illness" : "Sick", start_date: today, end_date: today, reason: "", student_id: "" });
  const [kids, setKids] = useState<Row[]>([]);

  useEffect(() => {
    if (!parent || !profile) return;
    (async () => {
      const { data: links } = await supabase.from("guardian_links").select("student_id").eq("guardian_id", profile.id);
      const ids = (links ?? []).map((l) => l.student_id);
      if (!ids.length) return;
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids).order("full_name");
      setKids(data ?? []);
      setForm((f) => ({ ...f, student_id: f.student_id || data?.[0]?.id || "" }));
    })();
  }, [parent, profile]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.end_date < form.start_date) return toast("End date must be on or after the start date.", "error");
    if (parent && !form.student_id) return toast("Choose which child the note is for.", "error");
    setBusy(true);
    const { student_id, ...rest } = form;
    const row = await requests.insert({ ...rest, student_id: parent ? student_id : null }, "Request submitted for approval.");
    setBusy(false);
    if (row) setOpen(false);
  };

  const decide = async (r: Row, status: "Approved" | "Rejected") => {
    await requests.update(r.id, { status, reviewed_by_name: profile?.full_name }, `Request ${status.toLowerCase()}.`);
    // Approved staff leave shows up on the Master Calendar.
    if (status === "Approved" && !["student", "parent"].includes(r.requester_role)) {
      const { error } = await supabase.from("calendar_events").insert([{ event_title: `${r.requester_name} — ${r.leave_type} leave`, event_date: r.start_date, event_type: "pto", description: `${fmtDate(r.start_date)} → ${fmtDate(r.end_date)}` }]);
      if (error) toast(errorMessage(error), "error");
    }
  };

  const mine = requests.rows.filter((r) => r.requester_id === profile?.id || (parent && kids.some((k) => k.id === r.student_id)));
  const pending = requests.rows.filter((r) => r.status === "Pending");
  const types = forStudent ? ["Illness", "Family", "Appointment", "Other"] : ["Sick", "Vacation", "Training", "Family", "Other"];

  const table = (rows: Row[], review: boolean) => (
    <Table headers={review ? ["Person", "Type", "Dates", "Reason", "Status", "Actions"] : ["Type", "Dates", "Reason", "Status", "Actions"]} empty={rows.length === 0 && "No requests."}>
      {rows.map((r) => (
        <tr key={r.id}>
          {review && (
            <td className="px-6 py-4">
              <div className="font-bold text-slate-800">{r.student_name ?? r.requester_name}</div>
              <div className="text-xs text-slate-400 uppercase">{r.student_name ? `student • note from ${r.requester_name}` : r.requester_role}</div>
            </td>
          )}
          <td className="px-6 py-4"><Badge color="purple">{r.leave_type}</Badge></td>
          <td className="px-6 py-4 text-slate-600 whitespace-nowrap">{fmtDate(r.start_date)} → {fmtDate(r.end_date)} <span className="text-xs text-slate-400">({days(r)}d)</span></td>
          <td className="px-6 py-4 text-slate-500 text-xs max-w-64">{r.reason}</td>
          <td className="px-6 py-4">
            <Badge color={STATUS_COLOR[r.status]}>{r.status}</Badge>
            {r.reviewed_by_name && <div className="text-[10px] text-slate-400 mt-1">by {r.reviewed_by_name}</div>}
          </td>
          <td className="px-6 py-4 text-right">
            <div className="flex justify-end gap-1">
              {review && r.status === "Pending" && (
                <>
                  <button onClick={() => decide(r, "Approved")} className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg flex items-center gap-1"><Check size={12} /> Approve</button>
                  <button onClick={() => decide(r, "Rejected")} className="text-xs font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-lg flex items-center gap-1"><X size={12} /> Reject</button>
                </>
              )}
              {(admin || (r.requester_id === profile?.id && r.status === "Pending")) && (
                <IconButton icon={Trash2} title={review ? "Delete" : "Cancel request"} danger onClick={() => confirmAction("Remove this request?") && requests.remove(r.id, "Request removed.")} />
              )}
            </div>
          </td>
        </tr>
      ))}
    </Table>
  );

  return (
    <ModuleShell
      title="Leave"
      icon={Plane}
      tabs={[
        ...(admin ? [{ id: "review" as TabId, label: `Approvals (${pending.length})`, icon: Clock, group: "Leave & Absence" }] : []),
        { id: "mine", label: parent ? "Absence Notes" : role === "student" ? "My Absence Notes" : "My Leave", icon: CalendarDays, group: "Leave & Absence" },
      ]}
      activeTab={activeTab}
      onTab={setActiveTab}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search by name, type or reason..."
      action={<ActionButton icon={Plus} onClick={() => setOpen(true)}>{forStudent ? "Submit Absence Note" : "Request Leave"}</ActionButton>}
    >
      {open && (
        <Modal title={forStudent ? "Absence Note" : "Leave Request"} icon={Plane} onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="space-y-4">
            {parent && (
              <Field label="Child">
                <select required className={inputClass} value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })}>
                  {kids.length === 0 && <option value="">No children linked</option>}
                  {kids.map((k) => <option key={k.id} value={k.id}>{k.full_name}</option>)}
                </select>
              </Field>
            )}
            <Field label="Type">
              <select className={inputClass} value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value })}>
                {types.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="From"><input type="date" required className={inputClass} value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Field>
              <Field label="Until"><input type="date" required min={form.start_date} className={inputClass} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></Field>
            </div>
            <Field label="Reason"><textarea required rows={3} className={inputClass} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
            <SubmitButton busy={busy}>Submit</SubmitButton>
          </form>
        </Modal>
      )}

      {requests.loading ? (
        <Loading />
      ) : activeTab === "review" ? (
        <>
          <PageHeading title="Leave & Absence Approvals" subtitle="Approved staff leave is added to the Master Calendar automatically." />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <StatCard label="Pending" value={pending.length} icon={Clock} color="orange" />
            <StatCard label="Staff Away Today" value={requests.rows.filter((r) => r.status === "Approved" && !["student", "parent"].includes(r.requester_role) && r.start_date <= today && r.end_date >= today).length} icon={Plane} color="purple" />
            <StatCard label="Student Absences Today" value={requests.rows.filter((r) => r.status === "Approved" && ["student", "parent"].includes(r.requester_role) && r.start_date <= today && r.end_date >= today).length} icon={CalendarDays} color="blue" />
          </div>
          <Card>{table(requests.rows.filter((r) => matches(search, r.requester_name, r.leave_type, r.reason)), true)}</Card>
        </>
      ) : (
        <>
          <PageHeading title={parent ? "Absence Notes for My Children" : role === "student" ? "My Absence Notes" : "My Leave"} subtitle="Requests go to administration for approval." />
          <Card>{table(mine.filter((r) => matches(search, r.leave_type, r.reason)), parent)}</Card>
        </>
      )}
    </ModuleShell>
  );
}
