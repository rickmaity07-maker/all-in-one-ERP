"use client";

import { useEffect, useState } from "react";
import { Settings, User, Lock, RefreshCw, Download, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { getAppVersion, useUpdater } from "@/lib/updater";
import { Card, Field, SubmitButton, inputClass, toast } from "@/components/ui";
import { errorMessage } from "@/lib/utils";

export default function SettingsPage() {
  const { profile, user, refresh } = useSession();
  const { status, check, install } = useUpdater();
  const [version, setVersion] = useState("");
  const [name, setName] = useState(profile?.full_name ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"" | "name" | "password">("");

  useEffect(() => {
    getAppVersion().then(setVersion);
  }, []);

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setBusy("name");
    const { error } = await supabase.from("profiles").update({ full_name: name.trim() }).eq("id", profile.id);
    setBusy("");
    if (error) return toast(errorMessage(error), "error");
    await refresh();
    toast("Profile updated.");
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return toast("Passwords do not match.", "error");
    setBusy("password");
    const { error } = await supabase.auth.updateUser({ password });
    setBusy("");
    if (error) return toast(errorMessage(error), "error");
    if (profile?.must_change_password) {
      const { error: flagError } = await supabase.from("profiles").update({ must_change_password: false }).eq("id", profile.id);
      if (flagError) return toast(errorMessage(flagError), "error");
      await refresh();
    }
    setPassword("");
    setConfirm("");
    toast("Password changed.");
  };

  return (
    <main className="flex-1 bg-[#F4F7FE] overflow-y-auto">
      <div className="px-4 md:px-10 py-6 md:py-10 space-y-8 max-w-4xl">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-800 mb-2 flex items-center gap-3"><Settings size={28} className="text-indigo-600" /> Settings</h1>
          <p className="text-slate-500 font-medium">Manage your account and keep the app up to date.</p>
        </div>

        {profile?.must_change_password && (
          <div className="p-5 rounded-3xl bg-orange-50 border border-orange-200 text-orange-800 font-semibold flex items-center gap-3">
            <Lock size={20} className="shrink-0" />
            You signed in with a temporary password. Choose your own password below to continue using the app.
          </div>
        )}

        <Card title="App Updates">
          <div className="flex items-center justify-between gap-6">
            <div>
              <p className="text-sm text-slate-500 font-medium">Installed version</p>
              <p className="text-2xl font-black text-slate-800">{version || "…"}</p>
              <div className="mt-2 text-sm font-semibold">
                {status.state === "checking" && <span className="text-slate-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Checking for updates…</span>}
                {status.state === "none" && <span className="text-emerald-600 flex items-center gap-2"><CheckCircle2 size={14} /> You are on the latest version.</span>}
                {status.state === "available" && <span className="text-indigo-600">Version {status.version} is ready to install.</span>}
                {status.state === "downloading" && <span className="text-indigo-600">Downloading… {status.percent}%</span>}
                {status.state === "installing" && <span className="text-indigo-600">Installing — the app will restart.</span>}
                {status.state === "error" && <span className="text-red-600 flex items-center gap-2"><AlertCircle size={14} /> Update check failed: {status.message}</span>}
                {status.state === "unsupported" && <span className="text-slate-500">Automatic updates are available in the desktop app.</span>}
              </div>
              {status.state === "available" && status.notes && (
                <pre className="mt-4 text-xs text-slate-600 bg-slate-50 rounded-xl p-4 whitespace-pre-wrap font-sans max-h-48 overflow-y-auto">{status.notes}</pre>
              )}
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              {status.state === "available" ? (
                <button onClick={install} className="flex items-center gap-2 bg-emerald-500 text-white px-6 py-3 rounded-xl text-sm font-bold shadow-md hover:bg-emerald-600">
                  <Download size={16} /> Update &amp; restart
                </button>
              ) : (
                <button
                  onClick={check}
                  disabled={status.state === "checking" || status.state === "downloading" || status.state === "installing"}
                  className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl text-sm font-bold shadow-md hover:bg-slate-800 disabled:opacity-60"
                >
                  <RefreshCw size={16} /> Check for updates
                </button>
              )}
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card title="Profile">
            <form onSubmit={saveName} className="space-y-4">
              <Field label="Email">
                <input className={`${inputClass} opacity-70`} value={user?.email ?? ""} disabled />
              </Field>
              <Field label="Full Name">
                <input className={inputClass} required value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <SubmitButton busy={busy === "name"}><User size={16} /> Save Profile</SubmitButton>
            </form>
          </Card>

          <Card title="Password">
            <form onSubmit={savePassword} className="space-y-4">
              <Field label="New Password">
                <input type="password" minLength={8} required className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              <Field label="Confirm Password">
                <input type="password" minLength={8} required className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </Field>
              <SubmitButton busy={busy === "password"}><Lock size={16} /> Change Password</SubmitButton>
            </form>
          </Card>
        </div>
      </div>
    </main>
  );
}
