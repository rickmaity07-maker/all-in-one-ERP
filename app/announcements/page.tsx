"use client";

import { useState } from "react";
import { Megaphone, Plus, Pin, PinOff, Trash2, Users, GraduationCap, Globe } from "lucide-react";
import { useSession, isAdmin, isStaff } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import { ModuleShell, Modal, Field, SubmitButton, ActionButton, PageHeading, Loading, Empty, Badge, IconButton, inputClass, confirmAction } from "@/components/ui";
import { fmtDateTime, initials, matches } from "@/lib/utils";

type TabId = "all" | "staff" | "students";
const AUDIENCE = {
  all: { label: "Everyone", icon: Globe, color: "blue" },
  staff: { label: "Staff only", icon: Users, color: "purple" },
  students: { label: "Students", icon: GraduationCap, color: "green" },
} as const;

export default function Announcements() {
  const { role, profile } = useSession();
  const staff = isStaff(role);
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [search, setSearch] = useState("");
  const posts = useTable("announcements");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", audience: "all", pinned: false });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const row = await posts.insert(form, "Announcement posted.");
    setBusy(false);
    if (row) {
      setOpen(false);
      setForm({ title: "", body: "", audience: "all", pinned: false });
    }
  };

  const visible = posts.rows
    .filter((p) => activeTab === "all" || p.audience === activeTab)
    .filter((p) => matches(search, p.title, p.body, p.author_name))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || String(b.created_at).localeCompare(String(a.created_at)));

  return (
    <ModuleShell
      title="Notices"
      icon={Megaphone}
      tabs={[
        { id: "all", label: "All Announcements", icon: Globe, group: "Notice Board" },
        ...(staff ? [{ id: "staff" as TabId, label: "Staff Only", icon: Users, group: "Notice Board" }] : []),
        { id: "students", label: "For Students", icon: GraduationCap, group: "Notice Board" },
      ]}
      activeTab={activeTab}
      onTab={setActiveTab}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search announcements..."
      action={staff && <ActionButton icon={Plus} onClick={() => setOpen(true)}>New Announcement</ActionButton>}
    >
      {open && (
        <Modal title="New Announcement" icon={Megaphone} onClose={() => setOpen(false)} wide>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Title"><input required className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Message"><textarea required rows={6} className={inputClass} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-4 items-end">
              <Field label="Audience">
                <select className={inputClass} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
                  {Object.entries(AUDIENCE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </Field>
              <label className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
                <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} className="w-4 h-4 accent-indigo-600" />
                <span className="text-sm font-semibold text-slate-700">Pin to top & dashboard</span>
              </label>
            </div>
            <SubmitButton busy={busy}>Post</SubmitButton>
          </form>
        </Modal>
      )}

      <PageHeading title="Notice Board" subtitle="School-wide news, deadlines and reminders. Pinned notices also appear on everyone's dashboard." />
      {posts.loading ? (
        <Loading />
      ) : visible.length === 0 ? (
        <Empty>No announcements yet.</Empty>
      ) : (
        <div className="space-y-4 max-w-4xl">
          {visible.map((p) => {
            const aud = AUDIENCE[p.audience as keyof typeof AUDIENCE] ?? AUDIENCE.all;
            const canEdit = isAdmin(role) || p.author_id === profile?.id;
            return (
              <article key={p.id} className={`bg-white rounded-3xl p-6 border shadow-sm ${p.pinned ? "border-indigo-200 ring-1 ring-indigo-100" : "border-slate-100"}`}>
                <div className="flex justify-between items-start gap-4 mb-3">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-full bg-linear-to-br from-[#2A0845] to-[#6441A5] text-white text-xs font-bold flex items-center justify-center">{initials(p.author_name)}</span>
                    <div>
                      <h3 className="font-black text-slate-800 text-lg flex items-center gap-2">{p.pinned && <Pin size={16} className="text-indigo-500" />} {p.title}</h3>
                      <p className="text-xs text-slate-400">{p.author_name} • {fmtDateTime(p.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge color={aud.color}><aud.icon size={12} /> {aud.label}</Badge>
                    {canEdit && (
                      <>
                        <IconButton icon={p.pinned ? PinOff : Pin} title={p.pinned ? "Unpin" : "Pin"} onClick={() => posts.update(p.id, { pinned: !p.pinned })} />
                        <IconButton icon={Trash2} title="Delete" danger onClick={() => confirmAction("Delete this announcement?") && posts.remove(p.id, "Announcement deleted.")} />
                      </>
                    )}
                  </div>
                </div>
                <p className="text-slate-600 whitespace-pre-wrap leading-relaxed">{p.body}</p>
              </article>
            );
          })}
        </div>
      )}
    </ModuleShell>
  );
}
