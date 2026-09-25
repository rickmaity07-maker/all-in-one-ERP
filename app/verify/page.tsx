"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldX, Search, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Result = { valid: boolean; revoked?: boolean; badge?: string; description?: string; skills?: string[]; holder?: string; issued_at?: string; issuer?: string };

// Public page: anyone can check a credential code without an account.
export default function Verify() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [checking, setChecking] = useState(false);

  const check = async (value: string) => {
    if (!value.trim()) return;
    setChecking(true);
    const { data, error } = await supabase.rpc("verify_credential", { p_code: value.trim() });
    setChecking(false);
    setResult(error ? { valid: false } : (data as Result));
  };

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("code");
    if (fromUrl) {
      setCode(fromUrl); // eslint-disable-line react-hooks/set-state-in-effect
      check(fromUrl);
    }
  }, []);

  return (
    <main className="flex-1 overflow-y-auto bg-[#F4F7FE] flex items-start md:items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl border border-slate-100 p-6 md:p-10">
        <h1 className="text-2xl font-black text-slate-800 flex items-center gap-3 mb-2"><ShieldCheck className="text-indigo-600" /> Verify a Credential</h1>
        <p className="text-sm text-slate-500 mb-6">Enter the verification code printed on the certificate.</p>
        <form onSubmit={(e) => { e.preventDefault(); check(code); }} className="flex gap-2 mb-6">
          <input aria-label="Verification code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. 3F9A1C0B7D2E"
            className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm outline-none focus:border-indigo-400" />
          <button className="px-5 py-3 bg-indigo-600 text-white font-bold rounded-xl flex items-center gap-2">{checking ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Verify</button>
        </form>
        {result && (result.valid ? (
          <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200" role="status">
            <p className="font-black text-emerald-700 flex items-center gap-2 mb-2"><ShieldCheck size={18} /> Valid credential</p>
            <p className="text-slate-800"><b>{result.holder}</b> earned <b>{result.badge}</b></p>
            {result.description && <p className="text-sm text-slate-600 mt-1">{result.description}</p>}
            {!!result.skills?.length && <p className="text-sm text-slate-600 mt-1">Skills: {result.skills.join(", ")}</p>}
            <p className="text-xs text-slate-500 mt-2">Issued by {result.issuer} on {result.issued_at ? new Date(result.issued_at).toLocaleDateString() : "—"}</p>
          </div>
        ) : (
          <div className="p-5 rounded-2xl bg-red-50 border border-red-200" role="status">
            <p className="font-black text-red-700 flex items-center gap-2"><ShieldX size={18} /> {result.revoked ? "This credential has been revoked" : "No valid credential matches this code"}</p>
            {result.revoked && result.holder && <p className="text-sm text-slate-600 mt-1">{result.badge} — {result.holder}</p>}
          </div>
        ))}
      </div>
    </main>
  );
}
