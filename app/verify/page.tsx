"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldX, Search, Loader2, FileKey2, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { verifyCredentialJwt } from "@/lib/credentials";
import { useT } from "@/lib/i18n";
import LanguagePicker from "@/components/LanguagePicker";

type Result = { valid: boolean; revoked?: boolean; badge?: string; description?: string; skills?: string[]; holder?: string; issued_at?: string; issuer?: string;
  code?: string; credential_jwt?: string | null; public_jwk?: JsonWebKey | null };
type Signature = "none" | "valid" | "invalid";

// Public page: anyone can check a credential code without an account.
export default function Verify() {
  const t = useT();
  const [code, setCode] = useState("");
  const [signature, setSignature] = useState<Signature>("none");
  const [result, setResult] = useState<Result | null>(null);
  const [checking, setChecking] = useState(false);

  const check = async (value: string) => {
    if (!value.trim()) return;
    setChecking(true);
    const { data, error } = await supabase.rpc("verify_credential", { p_code: value.trim() });
    const res = error ? { valid: false } : (data as Result);
    // The signed credential must verify against the school's public key and describe this same award.
    let sig: Signature = "none";
    if (res.valid && res.credential_jwt && res.public_jwk) {
      const vc = await verifyCredentialJwt(res.credential_jwt, res.public_jwk);
      sig = vc && vc.credentialSubject?.achievement?.name === res.badge && vc.credentialSubject?.name === res.holder && String(vc.id).endsWith(`code=${res.code}`) ? "valid" : "invalid";
    }
    setChecking(false);
    setSignature(sig);
    setResult(res);
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
        <h1 className="text-2xl font-black text-slate-800 flex items-center gap-3 mb-2"><ShieldCheck className="text-indigo-600" /> {t("Verify a Credential")}</h1>
        <div className="flex justify-between items-center gap-4 mb-6">
          <p className="text-sm text-slate-500">{t("Enter the verification code printed on the certificate.")}</p>
          <LanguagePicker />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); check(code); }} className="flex gap-2 mb-6">
          <input aria-label={t("Verification code")} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. 3F9A1C0B7D2E"
            className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm outline-none focus:border-indigo-400" />
          <button className="px-5 py-3 bg-indigo-600 text-white font-bold rounded-xl flex items-center gap-2">{checking ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} {t("Verify")}</button>
        </form>
        {result && (result.valid ? (
          <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200" role="status">
            <p className="font-black text-emerald-700 flex items-center gap-2 mb-2"><ShieldCheck size={18} /> {t("Valid credential")}</p>
            <p className="text-slate-800">{t("{holder} earned {badge}", { holder: result.holder ?? "", badge: result.badge ?? "" })}</p>
            {result.description && <p className="text-sm text-slate-600 mt-1">{result.description}</p>}
            {!!result.skills?.length && <p className="text-sm text-slate-600 mt-1">{t("Skills")}: {result.skills.join(", ")}</p>}
            <p className="text-xs text-slate-500 mt-2">{t("Issued by {issuer} on {date}", { issuer: result.issuer ?? "", date: result.issued_at ? new Date(result.issued_at).toLocaleDateString() : "—" })}</p>
            {signature === "valid" && (
              <p className="mt-3 text-xs font-bold text-emerald-800 flex items-center gap-2" data-testid="signature-valid"><FileKey2 size={14} /> {t("Digitally signed by the school — signature checked (Open Badges 3.0, ES256).")}</p>
            )}
            {signature === "invalid" && (
              <p className="mt-3 text-xs font-bold text-red-700 flex items-center gap-2"><AlertTriangle size={14} /> {t("The digital signature does not match this record.")}</p>
            )}
          </div>
        ) : (
          <div className="p-5 rounded-2xl bg-red-50 border border-red-200" role="status">
            <p className="font-black text-red-700 flex items-center gap-2"><ShieldX size={18} /> {t(result.revoked ? "This credential has been revoked" : "No valid credential matches this code")}</p>
            {result.revoked && result.holder && <p className="text-sm text-slate-600 mt-1">{result.badge} — {result.holder}</p>}
          </div>
        ))}
      </div>
    </main>
  );
}
