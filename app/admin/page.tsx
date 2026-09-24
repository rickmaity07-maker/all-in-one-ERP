"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { ShieldCheck, Users, Mail, Plus, Key, Download, UserX, UserCheck, RefreshCw } from "lucide-react";
import { supabase, supabaseUrl, supabaseAnonKey } from "@/lib/supabase";
import { useSession, isAdmin, type Role } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import {
  ModuleShell, Modal, Field, SubmitButton, ActionButton, PageHeading, Card, Table, Loading, Badge,
  AccessDenied, StatCard, inputClass, toast, confirmAction,
} from "@/components/ui";
import { downloadCsv, errorMessage, fmtDateTime, initials, matches, type Row } from "@/lib/utils";

const ROLE_COLORS: Record<string, string> = { owner: "purple", administration: "blue", teacher: "orange", student: "green" };

export default function AdminPortal() {
  const { role, profile: me } = useSession();
  const [activeTab, setActiveTab] = useState<"users" | "security">("users");
  const [search, setSearch] = useState("");
  const profiles = useTable("profiles", { orderBy: "full_name", ascending: true, enabled: isAdmin(role) });
  const [logs, setLogs] = useState<Row[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState({ full_name: "", email: "", password: "", role: "student" as Role });

  const loadLogs = async () => {
    setLogsLoading(true);
    const { data, error } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(300);
    if (error) toast(errorMessage(error), "error");
    setLogs(data ?? []);
    setLogsLoading(false);
  };

  if (!isAdmin(role)) return <AccessDenied message="Only Administration and Owners can open Global Admin." />;

  // Creates a real login for the new user. A throw-away client is used so the admin stays signed in.
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const temp = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false, storageKey: "erp-invite" },
      });
      const { data, error } = await temp.auth.signUp({
        email: invite.email,
        password: invite.password,
        options: { data: { full_name: invite.full_name } },
      });
      if (error) throw error;
      const id = data.user?.id;
      if (!id) throw new Error("Account could not be created.");
      if (invite.role !== "student") {
        const { error: roleError } = await supabase.from("profiles").update({ role: invite.role, full_name: invite.full_name }).eq("id", id);
        if (roleError) throw roleError;
      }
      await profiles.reload();
      toast(data.session ? "User created. Share the temporary password with them." : "User created. They must confirm their email before signing in.");
      setInvite({ full_name: "", email: "", password: "", role: "student" });
      setIsModalOpen(false);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
    setBusy(false);
  };

  const changeRole = (p: Row, newRole: string) => profiles.update(p.id, { role: newRole }, `${p.full_name} is now ${newRole}.`);

  const toggleActive = (p: Row) => {
    const next = p.active === false;
    if (!next && !confirmAction(`Deactivate ${p.full_name}? They will be signed out and blocked from all data.`)) return;
    profiles.update(p.id, { active: next }, next ? "Access restored." : "Access revoked.");
  };

  const all = profiles.rows;
  const visible = all.filter((p) => matches(search, p.full_name, p.email, p.role, p.id));
  const roleOptions: Role[] = role === "owner" ? ["student", "teacher", "administration", "owner"] : ["student", "teacher", "administration"];

  return (
    <ModuleShell
      title="Global Admin"
      icon={ShieldCheck}
      tabs={[
        { id: "users", label: "User Directory", group: "Access Control" },
        { id: "security", label: "Security Logs", group: "Access Control" },
      ]}
      activeTab={activeTab}
      onTab={(t) => {
        setActiveTab(t);
        if (t === "security") loadLogs();
      }}
      search={search}
      onSearch={setSearch}
      searchPlaceholder={activeTab === "users" ? "Search profiles by name, email or role..." : "Search logs by user, table or action..."}
      action={<ActionButton icon={Plus} onClick={() => setIsModalOpen(true)}>Invite User</ActionButton>}
    >
      {isModalOpen && (
        <Modal title="Provision New User" icon={Users} onClose={() => setIsModalOpen(false)}>
          <form onSubmit={handleInvite} className="space-y-4">
            <Field label="Full Name"><input required className={inputClass} value={invite.full_name} onChange={(e) => setInvite({ ...invite, full_name: e.target.value })} placeholder="e.g. Dr. Weber" /></Field>
            <Field label="Email"><input type="email" required className={inputClass} value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} /></Field>
            <Field label="Temporary Password"><input required minLength={8} className={inputClass} value={invite.password} onChange={(e) => setInvite({ ...invite, password: e.target.value })} placeholder="At least 8 characters" /></Field>
            <Field label="System Role">
              <select className={inputClass} value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as Role })}>
                {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex gap-3">
              <Mail size={16} className="text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800 font-medium">A real login is created. If email confirmation is enabled in Supabase, the user must confirm their email first. They can change the password under Settings.</p>
            </div>
            <SubmitButton busy={busy}>Create Account</SubmitButton>
          </form>
        </Modal>
      )}

      {activeTab === "users" ? (
        <>
          <PageHeading title="Identity & Access Management" subtitle="Manage user accounts, permission levels, and system access." />
          <div className="grid grid-cols-3 gap-6 mb-8">
            <StatCard label="Admins & Owners" value={`${all.filter((p) => ["owner", "administration"].includes(p.role)).length} Users`} icon={ShieldCheck} color="indigo" />
            <StatCard label="Faculty Staff" value={`${all.filter((p) => p.role === "teacher").length} Users`} icon={Key} color="blue" />
            <StatCard label="Students" value={`${all.filter((p) => p.role === "student").length} Users`} icon={Users} color="emerald" />
          </div>

          <Card
            title="Global Directory"
            action={
              <button
                onClick={() => downloadCsv("users.csv", visible, [{ key: "full_name", label: "Name" }, { key: "email", label: "Email" }, { key: "role", label: "Role" }, { key: "active", label: "Active" }])}
                className="flex items-center gap-2 text-blue-600 font-bold text-sm hover:bg-blue-50 px-4 py-2 rounded-xl"
              >
                <Download size={16} /> Export CSV
              </button>
            }
          >
            {profiles.loading ? (
              <Loading label="Loading users..." />
            ) : (
              <Table headers={["User", "System Role", "Status", "Actions"]} empty={visible.length === 0 && "No users found."}>
                {visible.map((p) => {
                  const isSelf = p.id === me?.id;
                  const locked = isSelf || (p.role === "owner" && role !== "owner");
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs shrink-0">{initials(p.full_name)}</div>
                          <div>
                            <div className="font-bold text-slate-800">{p.full_name} {isSelf && <span className="text-xs text-slate-400">(you)</span>}</div>
                            <div className="text-xs text-slate-400">{p.email || p.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {locked ? (
                          <Badge color={ROLE_COLORS[p.role]}>{p.role}</Badge>
                        ) : (
                          <select value={p.role} onChange={(e) => changeRole(p, e.target.value)} className="text-xs font-bold uppercase tracking-wider rounded-xl px-2 py-1 bg-slate-100 text-slate-700 outline-none cursor-pointer">
                            {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-6 py-4">{p.active === false ? <Badge color="red">Revoked</Badge> : <Badge color="green">Active</Badge>}</td>
                      <td className="px-6 py-4 text-right">
                        {!locked && (
                          <button
                            onClick={() => toggleActive(p)}
                            className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${p.active === false ? "text-emerald-600 bg-emerald-50 hover:bg-emerald-100" : "text-red-600 bg-red-50 hover:bg-red-100"}`}
                          >
                            {p.active === false ? <><UserCheck size={14} /> Restore Access</> : <><UserX size={14} /> Revoke Access</>}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Card>
        </>
      ) : (
        <>
          <PageHeading title="System Security Logs" subtitle="Every create, update and delete on sensitive records, with who did it.">
            <button onClick={loadLogs} className="flex items-center gap-2 text-indigo-600 font-bold text-sm hover:bg-indigo-50 px-4 py-2 rounded-xl"><RefreshCw size={16} /> Refresh</button>
          </PageHeading>
          <Card title="Latest 300 events">
            {logsLoading ? (
              <Loading label="Loading audit trail..." />
            ) : (
              <Table headers={["When", "User", "Action", "Module", "Record"]} empty={logs.length === 0 && "No activity recorded yet."}>
                {logs.filter((l) => matches(search, l.actor_name, l.table_name, l.action)).map((l) => (
                  <tr key={l.id}>
                    <td className="px-6 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDateTime(l.created_at)}</td>
                    <td className="px-6 py-3 font-semibold text-slate-700">{l.actor_name || "System"}</td>
                    <td className="px-6 py-3"><Badge color={l.action === "DELETE" ? "red" : l.action === "INSERT" ? "green" : "blue"}>{l.action}</Badge></td>
                    <td className="px-6 py-3 text-slate-600">{String(l.table_name).replace(/_/g, " ")}</td>
                    <td className="px-6 py-3 font-mono text-xs text-slate-400">{String(l.record_id ?? "").substring(0, 8)}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </>
      )}
    </ModuleShell>
  );
}
