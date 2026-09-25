"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Card, Field, SubmitButton, inputClass, toast } from "@/components/ui";
import { errorMessage } from "@/lib/utils";

const EMPTY = { date_of_birth: "", gender: "", nationality: "", phone: "", address: "", emergency_contact: "", medical_notes: "" };
const PREFS = { email_notifications: true, directory_visible: true };

// Sensitive personal details live in user_metadata, apart from the directory:
// only the person and administrators can read them (FERPA / GDPR).
export default function PrivateInfo({ userId }: { userId: string }) {
  const [d, setD] = useState(EMPTY);
  const [p, setP] = useState(PREFS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("user_metadata").select("*").eq("user_id", userId).maybeSingle().then(({ data }) => {
      if (!data) return;
      setD({ ...EMPTY, ...data.demographics });
      setP({ ...PREFS, ...data.preferences });
    });
  }, [userId]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("user_metadata").upsert({ user_id: userId, demographics: d, preferences: p, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) return toast(errorMessage(error), "error");
    toast("Private details saved.");
  };

  const input = (key: keyof typeof EMPTY, label: string, type = "text") => (
    <Field label={label}><input type={type} className={inputClass} value={d[key]} onChange={(e) => setD({ ...d, [key]: e.target.value })} /></Field>
  );

  return (
    <Card title="Private Details">
      <p className="text-xs text-slate-500 mb-4 flex items-center gap-2"><ShieldCheck size={14} className="text-emerald-500" /> Visible only to you and school administrators. Never shown in the directory.</p>
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {input("date_of_birth", "Date of Birth", "date")}
          <Field label="Gender">
            <select className={inputClass} value={d.gender} onChange={(e) => setD({ ...d, gender: e.target.value })}>
              <option value="">Prefer not to say</option><option>Female</option><option>Male</option><option>Non-binary</option><option>Other</option>
            </select>
          </Field>
          {input("nationality", "Nationality")}
          {input("phone", "Phone", "tel")}
          {input("emergency_contact", "Emergency Contact")}
          {input("address", "Home Address")}
        </div>
        <Field label="Medical / Accessibility Notes"><textarea rows={2} className={inputClass} value={d.medical_notes} onChange={(e) => setD({ ...d, medical_notes: e.target.value })} /></Field>
        <div className="flex flex-wrap gap-4 text-sm font-semibold text-slate-600">
          <label className="flex items-center gap-2"><input type="checkbox" checked={p.email_notifications} onChange={(e) => setP({ ...p, email_notifications: e.target.checked })} /> E-mail me notifications</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={p.directory_visible} onChange={(e) => setP({ ...p, directory_visible: e.target.checked })} /> Show me in the chat directory</label>
        </div>
        <SubmitButton busy={busy}>Save Private Details</SubmitButton>
      </form>
    </Card>
  );
}
