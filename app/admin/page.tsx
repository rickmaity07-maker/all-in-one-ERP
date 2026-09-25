"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  ShieldCheck, Users, Mail, Plus, Key, Download, UserX, UserCheck, RefreshCw, KeyRound, Hourglass, HeartHandshake, X, Check,
} from "lucide-react";
import { supabase, supabaseUrl, supabaseAnonKey } from "@/lib/supabase";
import { useSession, isAdmin, type Role } from "@/lib/session";
import {
  ModuleShell, Modal, Field, SubmitButton, ActionButton, PageHeading, Card, Table, Loading, Badge,
  AccessDenied, StatCard, IconButton, inputClass, toast, confirmAction,
} from "@/components/ui";
import { downloadCsv, errorMessage, fmtDateTime, initials, matches, type Row } from "@/lib/utils";

type TabId = "users" | "approvals" | "resets" | "security";
const ROLE_COLORS: Record<string, string> = { owner: "purple", administration: "blue", teacher: "orange", student: "green", parent: "slate" };
const PROFILE_COLS = "id, full_name, role, active, pending";

const tempPassword = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("") + "!7";
};

export default function AdminPortal() {
  const { role, profile: me } = useSession();
  const admin = isAdmin(role);
  const [activeTab, setActiveTab] = useState<TabId>("users");
  const [search, setSearch] = useState("");
  const [profiles, setProfiles] = useState<Row[]>([]);
  const [links, setLinks] = useState<Row[]>([]);
  const [resets, setResets] = useState<Row[]>([]);
  const [logs, setLogs] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState({ full_name: "", email: "", password: tempPassword(), role: "student" as Role });
  const [resetFor, setResetFor] = useState<Row | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [familyOf, setFamilyOf] = useState<Row | null>(null);
  const [childPick, setChildPick] = useState("");
  const [relationship, setRelationship] = useState("Parent");
  const [approveRole, setApproveRole] = useState<Record<string, Role>>({});

  const fetchAll = useCallback(async () => {
    const [p, l, r] = await Promise.all([
      supabase.rpc("admin_list_profiles"),
      supabase.from("guardian_links").select("*"),
      supabase.from("password_reset_requests").select("*").is("resolved_at", null).order("created_at", { ascending: false }),
    ]);
    if (p.error) toast(errorMessage(p.error), "error");
    return { profiles: (p.data ?? []) as Row[], links: l.data ?? [], resets: r.data ?? [] };
  }, []);

  const reload = useCallback(async () => {
    const d = await fetchAll();
    setProfiles(d.profiles);
    setLinks(d.links);
    setResets(d.resets);
  }, [fetchAll]);

  useEffect(() => {
    if (!admin) return;
    let cancelled = false;
    fetchAll().then((d) => {
      if (cancelled) return;
      setProfiles(d.profiles);
      setLinks(d.links);
      setResets(d.resets);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [admin, fetchAll]);

  const loadLogs = async () => {
    setLogsLoading(true);
    const { data, error } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(300);
    if (error) toast(errorMessage(error), "error");
    setLogs(data ?? []);
    setLogsLoading(false);
  };

  if (!admin) return <AccessDenied message="Only Administration and Owners can open Global Admin." />;

  const updateProfile = async (id: string, values: Row, msg: string) => {
    const { data, error } = await supabase.from("profiles").update(values).eq("id", id).select(PROFILE_COLS);
    if (error) return toast(errorMessage(error), "error");
    if (!data?.length) return toast("You don't have permission to change this account.", "error");
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, ...data[0] } : p)));
    toast(msg);
  };

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
      await temp.auth.signOut();
      // Accounts created by an admin are approved straight away.
      const { error: roleError } = await supabase
        .from("profiles")
        .update({ role: invite.role, full_name: invite.full_name, active: true, pending: false, must_change_password: true })
        .eq("id", id);
      if (roleError) throw roleError;
      await reload();
      toast(`User created. Temporary password: ${invite.password}`);
      setInvite({ full_name: "", email: "", password: tempPassword(), role: "student" });
      setInviteOpen(false);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
    setBusy(false);
  };

  const approve = (p: Row) => updateProfile(p.id, { active: true, pending: false, role: approveRole[p.id] ?? "student" }, `${p.full_name} approved.`);
  const reject = (p: Row) => confirmAction(`Reject ${p.full_name}'s request? They will not be able to sign in.`) && updateProfile(p.id, { active: false, pending: false }, "Request rejected.");

  const toggleActive = (p: Row) => {
    const next = p.active === false;
    if (!next && !confirmAction(`Deactivate ${p.full_name}? They will be signed out and blocked from all data.`)) return;
    updateProfile(p.id, { active: next, pending: false }, next ? "Access restored." : "Access revoked.");
  };

  const doReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetFor) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_reset_password", { p_user: resetFor.id, p_password: newPassword });
    setBusy(false);
    if (error) return toast(errorMessage(error), "error");
    toast(`Temporary password set for ${resetFor.full_name}: ${newPassword}`);
    setResetFor(null);
    reload();
  };

  const addChild = async () => {
    if (!familyOf || !childPick) return;
    const { error } = await supabase.from("guardian_links").insert([{ guardian_id: familyOf.id, student_id: childPick, relationship }]);
    if (error) return toast(errorMessage(error), "error");
    setChildPick("");
    toast("Child linked.");
    reload();
  };

  const removeLink = async (id: string) => {
    const { error } = await supabase.from("guardian_links").delete().eq("id", id);
    if (error) return toast(errorMessage(error), "error");
    reload();
  };

  const nameOf = (id: string) => profiles.find((p) => p.id === id)?.full_name ?? "Unknown";
  const pending = profiles.filter((p) => p.pending);
  const directory = profiles.filter((p) => !p.pending);
  const visible = directory.filter((p) => matches(search, p.full_name, p.email, p.role, p.id));
  const students = profiles.filter((p) => p.role === "student" && p.active);
  const roleOptions: Role[] = role === "owner" ? ["student", "parent", "alumni", "teacher", "administration", "owner"] : ["student", "parent", "alumni", "teacher", "administration"];

  return (
    <ModuleShell
      title="Global Admin"
      icon={ShieldCheck}
      tabs={[
        { id: "users", label: "User Directory", group: "Access Control" },
        { id: "approvals", label: `Approvals (${pending.length})`, group: "Access Control" },
        { id: "resets", label: `Password Resets (${resets.length})`, group: "Access Control" },
        { id: "security", label: "Security Logs", group: "Access Control" },
      ]}
      activeTab={activeTab}
      onTab={(t) => {
        setActiveTab(t);
        if (t === "security") loadLogs();
      }}
      search={search}
      onSearch={setSearch}
      searchPlaceholder={activeTab === "security" ? "Search logs by user, table or action..." : "Search profiles by name, email or role..."}
      action={<ActionButton icon={Plus} onClick={() => setInviteOpen(true)}>Invite User</ActionButton>}
    >
      {inviteOpen && (
        <Modal title="Provision New User" icon={Users} onClose={() => setInviteOpen(false)}>
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
              <p className="text-xs text-blue-800 font-medium">A real login is created and approved immediately. Give the person the temporary password — they must choose their own password the first time they sign in.</p>
            </div>
            <SubmitButton busy={busy}>Create Account</SubmitButton>
          </form>
        </Modal>
      )}

      {resetFor && (
        <Modal title={`Reset password — ${resetFor.full_name}`} icon={KeyRound} onClose={() => setResetFor(null)}>
          <form onSubmit={doReset} className="space-y-4">
            <Field label="Temporary Password">
              <input required minLength={8} className={inputClass} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </Field>
            <p className="text-xs text-slate-500">Pass this on to {resetFor.full_name} in person or by phone. They will be asked to choose a new password when they sign in.</p>
            <SubmitButton busy={busy}>Set Temporary Password</SubmitButton>
          </form>
        </Modal>
      )}

      {familyOf && (
        <Modal title={`Children of ${familyOf.full_name}`} icon={HeartHandshake} onClose={() => setFamilyOf(null)}>
          <div className="space-y-4">
            <div className="flex gap-2">
              <select aria-label="Child" className={inputClass} value={childPick} onChange={(e) => setChildPick(e.target.value)}>
                <option value="">Select a student…</option>
                {students.filter((s) => !links.some((l) => l.guardian_id === familyOf.id && l.student_id === s.id)).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
              <select aria-label="Relationship" className={`${inputClass} w-40`} value={relationship} onChange={(e) => setRelationship(e.target.value)}>
                {["Parent", "Mother", "Father", "Guardian"].map((r) => <option key={r}>{r}</option>)}
              </select>
              <button onClick={addChild} disabled={!childPick} className="px-4 bg-indigo-600 text-white rounded-xl text-sm font-bold disabled:opacity-40">Link</button>
            </div>
            {links.filter((l) => l.guardian_id === familyOf.id).length === 0 ? (
              <p className="text-sm text-slate-400">No children linked yet.</p>
            ) : (
              links.filter((l) => l.guardian_id === familyOf.id).map((l) => (
                <div key={l.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100">
                  <span className="text-sm font-semibold text-slate-700">{nameOf(l.student_id)} <span className="text-xs text-slate-400">({l.relationship})</span></span>
                  <button onClick={() => removeLink(l.id)} className="text-slate-300 hover:text-red-500" title="Unlink"><X size={14} /></button>
                </div>
              ))
            )}
          </div>
        </Modal>
      )}

      {loading ? (
        <Loading label="Loading users..." />
      ) : activeTab === "users" ? (
        <>
          <PageHeading title="Identity & Access Management" subtitle="Manage user accounts, permission levels, and system access." />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <StatCard label="Admins & Owners" value={directory.filter((p) => ["owner", "administration"].includes(p.role)).length} icon={ShieldCheck} color="indigo" />
            <StatCard label="Faculty" value={directory.filter((p) => p.role === "teacher").length} icon={Key} color="blue" />
            <StatCard label="Students" value={directory.filter((p) => p.role === "student").length} icon={Users} color="emerald" />
            <StatCard label="Parents" value={directory.filter((p) => p.role === "parent").length} icon={HeartHandshake} color="pink" />
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
                        <select aria-label={`Role for ${p.full_name}`} value={p.role} onChange={(e) => updateProfile(p.id, { role: e.target.value }, `${p.full_name} is now ${e.target.value}.`)} className="text-xs font-bold uppercase tracking-wider rounded-xl px-2 py-1 bg-slate-100 text-slate-700 outline-none cursor-pointer">
                          {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="px-6 py-4">{p.active === false ? <Badge color="red">Revoked</Badge> : <Badge color="green">Active</Badge>}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end items-center gap-1">
                        {p.role === "parent" && <IconButton icon={HeartHandshake} title="Linked children" onClick={() => { setFamilyOf(p); setChildPick(""); }} />}
                        {!locked && <IconButton icon={KeyRound} title="Reset password" onClick={() => { setResetFor(p); setNewPassword(tempPassword()); }} />}
                        {!locked && (
                          <button
                            onClick={() => toggleActive(p)}
                            className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${p.active === false ? "text-emerald-600 bg-emerald-50 hover:bg-emerald-100" : "text-red-600 bg-red-50 hover:bg-red-100"}`}
                          >
                            {p.active === false ? <><UserCheck size={14} /> Restore Access</> : <><UserX size={14} /> Revoke Access</>}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Table>
          </Card>
        </>
      ) : activeTab === "approvals" ? (
        <>
          <PageHeading title="Account Approvals" subtitle="People who used “Request access” on the login screen. Choose their role and approve, or reject." />
          <Card>
            <Table headers={["Person", "Requested", "Role", "Actions"]} empty={pending.length === 0 && "No accounts are waiting for approval."}>
              {pending.map((p) => (
                <tr key={p.id}>
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-800 flex items-center gap-2"><Hourglass size={14} className="text-orange-500" /> {p.full_name}</div>
                    <div className="text-xs text-slate-400">{p.email}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-xs">{fmtDateTime(p.created_at)}</td>
                  <td className="px-6 py-4">
                    <select aria-label={`Approve ${p.full_name} as`} value={approveRole[p.id] ?? "student"} onChange={(e) => setApproveRole({ ...approveRole, [p.id]: e.target.value as Role })} className="text-xs font-bold uppercase rounded-xl px-2 py-1 bg-slate-100 outline-none">
                      {roleOptions.filter((r) => r !== "owner").map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button onClick={() => approve(p)} className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg inline-flex items-center gap-1"><Check size={12} /> Approve</button>
                    <button onClick={() => reject(p)} className="text-xs font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-lg inline-flex items-center gap-1"><X size={12} /> Reject</button>
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      ) : activeTab === "resets" ? (
        <>
          <PageHeading title="Password Reset Requests" subtitle="Sent from “Forgot password?” on the login screen. Set a temporary password and pass it on to the person." />
          <Card>
            <Table headers={["Account", "Requested", "Actions"]} empty={resets.length === 0 && "No open reset requests."}>
              {resets.map((r) => {
                const p = profiles.find((x) => x.id === r.profile_id);
                return (
                  <tr key={r.id}>
                    <td className="px-6 py-4"><div className="font-bold text-slate-800">{p?.full_name ?? r.email}</div><div className="text-xs text-slate-400">{r.email}</div></td>
                    <td className="px-6 py-4 text-slate-500 text-xs">{fmtDateTime(r.created_at)}</td>
                    <td className="px-6 py-4 text-right space-x-2">
                      {p && (
                        <button onClick={() => { setResetFor(p); setNewPassword(tempPassword()); }} className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg inline-flex items-center gap-1">
                          <KeyRound size={12} /> Set temporary password
                        </button>
                      )}
                      <button
                        onClick={async () => { await supabase.from("password_reset_requests").update({ resolved_at: new Date().toISOString() }).eq("id", r.id); reload(); }}
                        className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg"
                      >
                        Dismiss
                      </button>
                    </td>
                  </tr>
                );
              })}
            </Table>
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
