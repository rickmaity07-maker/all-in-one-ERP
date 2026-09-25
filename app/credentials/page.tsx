"use client";

import { useEffect, useState } from "react";
import { Award, Plus, Copy, Ban, Printer, ShieldCheck, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, isStaff, isAdmin } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import { ModuleShell, Modal, Field, SubmitButton, ActionButton, Card, Table, Loading, Empty, Badge, IconButton, inputClass, confirmAction, toast } from "@/components/ui";
import { escapeHtml, fmtDate, isTauri, matches, printDocument, type Row } from "@/lib/utils";

type TabId = "mine" | "awards" | "badges";

// The desktop/phone apps have no public address, so their links point at the hosted web version.
const PUBLIC_SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://rickmaity07-maker.github.io/all-in-one-ERP";
const verifyUrl = (code: string) => {
  const base = typeof window === "undefined" || isTauri() ? PUBLIC_SITE : `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}`;
  return `${base}/verify?code=${code}`;
};

function printCertificate(badge: Row, holder: string, award: Row) {
  printDocument(
    `Credential - ${badge.name}`,
    `<div style="text-align:center;border:6px double #6441A5;padding:48px;border-radius:16px">
      <div class="muted">All-In-One ERP certifies that</div>
      <h1 style="font-size:32px;margin:12px 0">${escapeHtml(holder)}</h1>
      <div class="muted">has earned the micro-credential</div>
      <h2 style="font-size:24px;color:#6441A5">${escapeHtml(badge.name)}</h2>
      <p>${escapeHtml(badge.description ?? "")}</p>
      ${badge.skills?.length ? `<p><b>Skills:</b> ${badge.skills.map(escapeHtml).join(", ")}</p>` : ""}
      <p class="muted">Issued ${new Date(award.issued_at).toLocaleDateString()} • Verification code <b>${escapeHtml(award.verification_code)}</b></p>
      <p class="muted">Verify at ${escapeHtml(verifyUrl(award.verification_code))}</p>
    </div>`
  );
}

export default function Credentials() {
  const { role, profile } = useSession();
  const staff = isStaff(role);
  const admin = isAdmin(role);
  const [tab, setTab] = useState<TabId>(staff ? "awards" : "mine");
  const [search, setSearch] = useState("");
  const badges = useTable("badges", { orderBy: "name", ascending: true });
  const awards = useTable("badge_awards", { orderBy: "issued_at" });
  const [people, setPeople] = useState<Record<string, string>>({});
  const [students, setStudents] = useState<Row[]>([]);
  const [modal, setModal] = useState<"" | "badge" | "award">("");
  const [busy, setBusy] = useState(false);
  const [b, setB] = useState({ name: "", description: "", criteria: "", skills: "", color: "indigo" });
  const [a, setA] = useState({ badge_id: "", student_id: "", evidence_url: "" });

  useEffect(() => {
    const q = staff ? supabase.from("profiles").select("id, full_name, role").order("full_name") : supabase.from("profiles").select("id, full_name, role");
    q.then(({ data }) => {
      setPeople(Object.fromEntries((data ?? []).map((p) => [p.id, p.full_name])));
      setStudents((data ?? []).filter((p) => p.role === "student"));
    });
  }, [staff]);

  const badgeOf = (id: string) => badges.rows.find((x) => x.id === id);

  const saveBadge = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const row = await badges.insert({ ...b, skills: b.skills.split(",").map((s) => s.trim()).filter(Boolean) }, "Badge created.");
    setBusy(false);
    if (row) { setModal(""); setB({ name: "", description: "", criteria: "", skills: "", color: "indigo" }); }
  };
  const award = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const row = await awards.insert({ ...a, evidence_url: a.evidence_url || null }, "Credential issued — the student has been notified.");
    setBusy(false);
    if (row) { setModal(""); setA({ ...a, student_id: "", evidence_url: "" }); }
  };
  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(verifyUrl(code));
      toast("Verification link copied.");
    } catch {
      toast(verifyUrl(code));
    }
  };

  const mine = awards.rows.filter((x) => profile && x.student_id === profile.id);
  const visibleAwards = awards.rows.filter((x) => matches(search, people[x.student_id], badgeOf(x.badge_id)?.name, x.verification_code));
  const tabs = [
    ...(role === "student" || role === "parent" ? [{ id: "mine" as TabId, label: role === "parent" ? "Children's Credentials" : "My Credentials", group: "Credentials" }] : []),
    ...(staff ? [{ id: "awards" as TabId, label: "Issued Credentials", group: "Credentials" }] : []),
    { id: "badges" as TabId, label: "Badge Catalogue", group: "Credentials" },
  ];

  return (
    <ModuleShell
      title="Credentials"
      icon={Award}
      tabs={tabs}
      activeTab={tab}
      onTab={setTab}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search badges, students, codes..."
      action={
        staff && (tab === "badges" ? (
          <ActionButton icon={Plus} onClick={() => setModal("badge")}>New Badge</ActionButton>
        ) : tab === "awards" ? (
          <ActionButton icon={Award} onClick={() => { setA({ badge_id: badges.rows[0]?.id ?? "", student_id: "", evidence_url: "" }); setModal("award"); }}>Issue Credential</ActionButton>
        ) : null)
      }
    >
      {modal === "badge" && (
        <Modal title="New Badge" icon={Award} onClose={() => setModal("")}>
          <form onSubmit={saveBadge} className="space-y-4">
            <Field label="Name"><input required className={inputClass} value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} placeholder="Python Fundamentals" /></Field>
            <Field label="Description"><textarea className={inputClass} value={b.description} onChange={(e) => setB({ ...b, description: e.target.value })} /></Field>
            <Field label="Criteria"><input className={inputClass} value={b.criteria} onChange={(e) => setB({ ...b, criteria: e.target.value })} placeholder="Score 80%+ on the final project" /></Field>
            <Field label="Skills (comma separated)"><input className={inputClass} value={b.skills} onChange={(e) => setB({ ...b, skills: e.target.value })} placeholder="Python, Problem solving" /></Field>
            <SubmitButton busy={busy}>Create</SubmitButton>
          </form>
        </Modal>
      )}
      {modal === "award" && (
        <Modal title="Issue Credential" icon={Award} onClose={() => setModal("")}>
          <form onSubmit={award} className="space-y-4">
            <Field label="Badge">
              <select required className={inputClass} value={a.badge_id} onChange={(e) => setA({ ...a, badge_id: e.target.value })}>
                <option value="">Select…</option>
                {badges.rows.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </Field>
            <Field label="Student">
              <select required className={inputClass} value={a.student_id} onChange={(e) => setA({ ...a, student_id: e.target.value })}>
                <option value="">Select…</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </Field>
            <Field label="Evidence Link"><input type="url" className={inputClass} value={a.evidence_url} onChange={(e) => setA({ ...a, evidence_url: e.target.value })} placeholder="https://…" /></Field>
            <SubmitButton busy={busy}>Issue</SubmitButton>
          </form>
        </Modal>
      )}

      {badges.loading || awards.loading ? <Loading /> : tab === "mine" ? (
        (role === "parent" ? awards.rows : mine).length === 0 ? <Empty>No credentials earned yet.</Empty> : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {(role === "parent" ? awards.rows : mine).map((x) => {
              const badge = badgeOf(x.badge_id);
              if (!badge) return null;
              return (
                <div key={x.id} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
                  <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-[#2A0845] to-[#6441A5] flex items-center justify-center text-white mb-4"><Award size={28} /></div>
                  <h3 className="font-black text-slate-800 text-lg">{badge.name}</h3>
                  {role === "parent" && <p className="text-xs font-bold text-indigo-600">{people[x.student_id]}</p>}
                  <p className="text-sm text-slate-500 mt-1">{badge.description}</p>
                  <div className="flex flex-wrap gap-1 mt-3">{(badge.skills ?? []).map((s: string) => <Badge key={s} color="purple">{s}</Badge>)}</div>
                  <p className="text-xs text-slate-400 mt-4">Issued {fmtDate(x.issued_at)} • Code <span className="font-mono font-bold text-slate-600">{x.verification_code}</span></p>
                  {x.revoked && <Badge color="red">Revoked</Badge>}
                  <div className="flex gap-2 mt-4">
                    <button onClick={() => copy(x.verification_code)} className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-2 rounded-lg flex items-center gap-1"><Copy size={14} /> Share link</button>
                    <button onClick={() => printCertificate(badge, people[x.student_id] ?? profile?.full_name ?? "", x)} className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-2 rounded-lg flex items-center gap-1"><Printer size={14} /> Certificate</button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : tab === "awards" ? (
        <Card title="Issued credentials">
          <Table headers={["Student", "Badge", "Issued", "Code", "Status", ""]} empty={visibleAwards.length === 0 && "No credentials issued yet."}>
            {visibleAwards.map((x) => (
              <tr key={x.id}>
                <td className="px-6 py-4 font-bold text-slate-800">{people[x.student_id] ?? "—"}</td>
                <td className="px-6 py-4">{badgeOf(x.badge_id)?.name}</td>
                <td className="px-6 py-4 text-sm text-slate-500">{fmtDate(x.issued_at)}</td>
                <td className="px-6 py-4 font-mono text-xs">{x.verification_code}</td>
                <td className="px-6 py-4">{x.revoked ? <Badge color="red">Revoked</Badge> : <Badge color="green">Valid</Badge>}</td>
                <td className="px-6 py-4 text-right whitespace-nowrap">
                  <IconButton icon={Copy} title="Copy verification link" onClick={() => copy(x.verification_code)} />
                  {!x.revoked && <IconButton icon={Ban} title="Revoke" danger onClick={() => confirmAction("Revoke this credential? Verification will show it as revoked.") && awards.update(x.id, { revoked: true }, "Credential revoked.")} />}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : (
        <Card title="Badge catalogue">
          {badges.rows.length === 0 ? <Empty>No badges defined yet.</Empty> : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {badges.rows.filter((x) => matches(search, x.name, x.description, ...(x.skills ?? []))).map((x) => (
                <div key={x.id} className="p-5 rounded-2xl border border-slate-100 flex gap-4">
                  <ShieldCheck className="text-indigo-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800">{x.name}</p>
                    <p className="text-sm text-slate-500">{x.description}</p>
                    {x.criteria && <p className="text-xs text-slate-400 mt-1">Criteria: {x.criteria}</p>}
                    <div className="flex flex-wrap gap-1 mt-2">{(x.skills ?? []).map((s: string) => <Badge key={s} color="purple">{s}</Badge>)}</div>
                  </div>
                  {admin && <IconButton icon={Trash2} title="Delete badge" danger onClick={() => confirmAction(`Delete ${x.name} and every award of it?`) && badges.remove(x.id, "Badge deleted.")} />}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </ModuleShell>
  );
}
