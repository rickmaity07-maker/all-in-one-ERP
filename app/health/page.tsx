"use client";

import { useCallback, useEffect, useState } from "react";
import { Stethoscope, Plus, ClipboardList, HeartPulse, AlertTriangle, Pill, Save } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, isStaff } from "@/lib/session";
import { usePeople } from "@/lib/useChildren";
import { ModuleShell, Modal, Field, SubmitButton, ActionButton, Card, Badge, Empty, Loading, AccessDenied, inputClass, toast } from "@/components/ui";
import { errorMessage, fmtDateTime, localDate, type Row } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type TabId = "today" | "notes" | "visits";
const OUTCOMES: { id: string; label: string; color: string }[] = [
  { id: "back_to_class", label: "Went back to class", color: "green" },
  { id: "rested", label: "Rested, then back to class", color: "blue" },
  { id: "sent_home", label: "Sent home", color: "orange" },
  { id: "hospital", label: "Taken to hospital", color: "red" },
];
const outcome = (id: string) => OUTCOMES.find((o) => o.id === id) ?? OUTCOMES[0];
const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

// The school health room: visits and medicines (staff), each child's health notes (parents and staff).
export default function Health() {
  const { role } = useSession();
  const t = useT();
  const staff = isStaff(role);
  const { people, ready } = usePeople();
  const [tab, setTab] = useState<TabId>(staff ? "today" : "notes");
  const [notes, setNotes] = useState<Row[]>([]);
  const [visits, setVisits] = useState<Row[]>([]);
  const [meds, setMeds] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState({ student_id: "", complaint: "", temperature: "", outcome: "back_to_class", notes: "", medicine: "", dose: "" });
  const [who, setWho] = useState("");
  const [edit, setEdit] = useState<Row | null>(null);

  const load = useCallback(async () => {
    const [n, vi, m] = await Promise.all([
      supabase.from("health_profiles").select("*"),
      supabase.from("health_visits").select("*").order("visited_at", { ascending: false }).limit(300),
      supabase.from("medicine_given").select("*").order("given_at", { ascending: false }).limit(300),
    ]);
    return { n: n.data ?? [], v: vi.data ?? [], m: m.data ?? [] };
  }, []);
  const apply = (x: Awaited<ReturnType<typeof load>>) => { setNotes(x.n); setVisits(x.v); setMeds(x.m); setLoading(false); };
  useEffect(() => {
    let off = false;
    load().then((x) => !off && apply(x));
    return () => { off = true; };
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  const reload = async () => apply(await load());

  const name = (id?: string) => people.find((p) => p.id === id)?.full_name ?? "—";
  const notesOf = (id?: string) => notes.find((n) => n.student_id === id);
  const selected = who || people[0]?.id || "";

  const record = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.student_id) return toast(t("Choose a student."), "error");
    setBusy(true);
    const { data, error } = await supabase.from("health_visits").insert({
      student_id: v.student_id, complaint: v.complaint.trim(), outcome: v.outcome, notes: v.notes.trim() || null,
      temperature: v.temperature ? Number(v.temperature) : null,
    }).select().single();
    if (error) {
      setBusy(false);
      return toast(errorMessage(error), "error");
    }
    if (v.medicine.trim()) {
      const m = await supabase.from("medicine_given").insert({ visit_id: data.id, student_id: v.student_id, medicine: v.medicine.trim(), dose: v.dose.trim() || null });
      if (m.error) {
        setBusy(false);
        setV({ ...v, medicine: "", dose: "" });
        void reload();
        return toast(t("Visit recorded, but the medicine was NOT given: {reason}", { reason: errorMessage(m.error) }), "error");
      }
    }
    setBusy(false);
    toast(t("Visit recorded. The parents have been told."));
    setRecording(false);
    setV({ student_id: "", complaint: "", temperature: "", outcome: "back_to_class", notes: "", medicine: "", dose: "" });
    void reload();
  };

  const saveNotes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    setBusy(true);
    const { error } = await supabase.from("health_profiles").upsert({
      student_id: edit.student_id, allergies: splitList(edit.allergies_text ?? ""), conditions: edit.conditions || null,
      medicines: edit.medicines || null, emergency_contact: edit.emergency_contact || null, notes: edit.notes || null,
    });
    setBusy(false);
    if (error) return toast(errorMessage(error), "error");
    toast(t("Health notes saved."));
    setEdit(null);
    void reload();
  };
  const startEdit = (id: string) => {
    const n = notesOf(id) ?? {};
    setEdit({ ...n, student_id: id, allergies_text: (n.allergies ?? []).join(", ") });
  };

  if (role === "alumni") return <AccessDenied message="The health room is for current students, their parents and staff." />;

  const today = visits.filter((x) => localDate(new Date(x.visited_at)) === localDate());
  const pickedAllergies: string[] = notesOf(v.student_id)?.allergies ?? [];
  const canEdit = staff || role === "parent";

  const visitCard = (x: Row) => {
    const o = outcome(x.outcome);
    const given = meds.filter((m) => m.visit_id === x.id);
    return (
      <Card key={x.id}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-slate-800">{name(x.student_id)}</span>
          <Badge color={o.color}>{t(o.label)}</Badge>
          {x.temperature != null && <Badge color={Number(x.temperature) >= 38 ? "red" : "slate"}>{x.temperature} °C</Badge>}
          <span className="ml-auto text-xs text-slate-400">{fmtDateTime(x.visited_at)}</span>
        </div>
        <p className="mt-1 text-sm text-slate-700">{x.complaint}</p>
        {x.notes && <p className="text-xs text-slate-500">{x.notes}</p>}
        {given.map((m) => (
          <p key={m.id} className="mt-1 text-xs font-semibold text-indigo-700 flex items-center gap-1"><Pill size={12} /> {m.medicine}{m.dose ? ` · ${m.dose}` : ""}</p>
        ))}
      </Card>
    );
  };

  const notesCard = (id: string) => {
    const n = notesOf(id);
    return (
      <Card key={id} title={staff ? name(id) : t("Health notes")} action={canEdit && (
        <button onClick={() => startEdit(id)} className="text-sm font-bold text-indigo-600">{n ? t("Edit") : t("Add notes")}</button>
      )}>
        {!n ? <p className="text-sm text-slate-400">{t("No health notes yet.")}</p> : (
          <dl className="grid sm:grid-cols-2 gap-3 text-sm">
            <div className="sm:col-span-2">
              <dt className="text-xs font-bold text-slate-400 uppercase">{t("Allergies")}</dt>
              <dd className="flex flex-wrap gap-1 mt-1" data-testid="allergies">
                {(n.allergies ?? []).length ? n.allergies.map((a: string) => <Badge key={a} color="red">{a}</Badge>) : <span className="text-slate-400">{t("None known")}</span>}
              </dd>
            </div>
            <div><dt className="text-xs font-bold text-slate-400 uppercase">{t("Conditions")}</dt><dd>{n.conditions || "—"}</dd></div>
            <div><dt className="text-xs font-bold text-slate-400 uppercase">{t("Regular medicines")}</dt><dd>{n.medicines || "—"}</dd></div>
            <div><dt className="text-xs font-bold text-slate-400 uppercase">{t("Emergency contact")}</dt><dd>{n.emergency_contact || "—"}</dd></div>
            <div><dt className="text-xs font-bold text-slate-400 uppercase">{t("Other notes")}</dt><dd>{n.notes || "—"}</dd></div>
          </dl>
        )}
      </Card>
    );
  };

  const tabs = [
    ...(staff ? [{ id: "today" as TabId, label: "Today", icon: ClipboardList }] : []),
    { id: "notes" as TabId, label: "Health notes", icon: HeartPulse },
    { id: "visits" as TabId, label: "Visits", icon: Stethoscope },
  ];

  return (
    <ModuleShell
      title="Health Room"
      icon={Stethoscope}
      tabs={tabs}
      activeTab={tab}
      onTab={setTab}
      action={staff && <ActionButton icon={Plus} onClick={() => setRecording(true)}>Record a visit</ActionButton>}
    >
      {recording && (
        <Modal title="Record a visit" icon={Stethoscope} onClose={() => setRecording(false)}>
          <form onSubmit={record} className="space-y-4">
            <Field label="Student">
              <select required className={inputClass} value={v.student_id} onChange={(e) => setV({ ...v, student_id: e.target.value })}>
                <option value="">{t("Choose…")}</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </Field>
            {pickedAllergies.length > 0 && (
              <p className="p-3 rounded-xl bg-red-50 text-red-800 text-sm font-semibold flex items-center gap-2" role="alert">
                <AlertTriangle size={16} /> {t("Allergic to: {list}", { list: pickedAllergies.join(", ") })}
              </p>
            )}
            <Field label="What's wrong"><input required className={inputClass} value={v.complaint} onChange={(e) => setV({ ...v, complaint: e.target.value })} placeholder={t("e.g. headache")} /></Field>
            <Field label="Temperature (°C, optional)"><input className={inputClass} inputMode="decimal" value={v.temperature} onChange={(e) => setV({ ...v, temperature: e.target.value })} /></Field>
            <Field label="Outcome">
              <select className={inputClass} value={v.outcome} onChange={(e) => setV({ ...v, outcome: e.target.value })}>
                {OUTCOMES.map((o) => <option key={o.id} value={o.id}>{t(o.label)}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Medicine given (optional)"><input className={inputClass} value={v.medicine} onChange={(e) => setV({ ...v, medicine: e.target.value })} /></Field>
              <Field label="Dose"><input className={inputClass} value={v.dose} onChange={(e) => setV({ ...v, dose: e.target.value })} placeholder="500 mg" /></Field>
            </div>
            <Field label="Notes"><textarea rows={2} className={inputClass} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
            <SubmitButton busy={busy}>Save visit</SubmitButton>
          </form>
        </Modal>
      )}
      {edit && (
        <Modal title={t("Health notes — {name}", { name: name(edit.student_id) })} icon={HeartPulse} onClose={() => setEdit(null)}>
          <form onSubmit={saveNotes} className="space-y-4">
            <Field label="Allergies (separate with commas)"><input className={inputClass} value={edit.allergies_text ?? ""} onChange={(e) => setEdit({ ...edit, allergies_text: e.target.value })} placeholder={t("e.g. peanuts, penicillin")} /></Field>
            <Field label="Conditions"><input className={inputClass} value={edit.conditions ?? ""} onChange={(e) => setEdit({ ...edit, conditions: e.target.value })} placeholder={t("e.g. asthma")} /></Field>
            <Field label="Regular medicines"><input className={inputClass} value={edit.medicines ?? ""} onChange={(e) => setEdit({ ...edit, medicines: e.target.value })} /></Field>
            <Field label="Emergency contact"><input className={inputClass} value={edit.emergency_contact ?? ""} onChange={(e) => setEdit({ ...edit, emergency_contact: e.target.value })} /></Field>
            <Field label="Other notes"><textarea rows={2} className={inputClass} value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
            <button type="submit" disabled={busy} className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold flex items-center justify-center gap-2"><Save size={16} /> {t("Save notes")}</button>
          </form>
        </Modal>
      )}

      {loading || !ready ? <Loading /> : tab === "today" ? (
        today.length === 0 ? <Empty>No visits today.</Empty> : <div className="space-y-3">{today.map(visitCard)}</div>
      ) : tab === "notes" ? (
        staff ? (
          <div className="space-y-4">
            <Field label="Student">
              <select className={inputClass} value={selected} onChange={(e) => setWho(e.target.value)}>
                {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </Field>
            {selected && notesCard(selected)}
          </div>
        ) : people.length === 0 ? <Empty>No children are linked to your account yet.</Empty> : (
          <div className="space-y-4">{people.map((p) => (
            <div key={p.id} className="space-y-2">
              {people.length > 1 && <h3 className="font-black text-slate-700">{p.full_name}</h3>}
              {notesCard(p.id)}
            </div>
          ))}</div>
        )
      ) : visits.length === 0 ? <Empty>No health-room visits.</Empty> : (
        <div className="space-y-3">{visits.map(visitCard)}</div>
      )}
    </ModuleShell>
  );
}
