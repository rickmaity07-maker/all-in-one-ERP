"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock, ArrowRight, Zap, Loader2, AlertCircle, User, CheckCircle2, KeyRound } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured, supabaseUrl, supabaseAnonKey } from "@/lib/supabase";
import { useSession, LOGIN_NOTICE_KEY } from "@/lib/session";

// Single sign-on buttons, e.g. NEXT_PUBLIC_SSO_PROVIDERS="azure,google,saml:school.edu".
// Each provider must also be enabled in Supabase → Authentication → Providers (SAML needs the Pro plan).
const SSO = (process.env.NEXT_PUBLIC_SSO_PROVIDERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const SSO_LABEL: Record<string, string> = { azure: "Microsoft", google: "Google", keycloak: "Keycloak", workos: "WorkOS" };

const fieldClass =
  "w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-medium";

export default function LoginScreen() {
  const router = useRouter();
  const { user, loading } = useSession();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  useEffect(() => {
    try {
      const notice = sessionStorage.getItem(LOGIN_NOTICE_KEY);
      if (notice) {
        // One-off message handed over from the auth guard via sessionStorage.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setErrorMsg(notice);
        sessionStorage.removeItem(LOGIN_NOTICE_KEY);
      }
    } catch {}
  }, []);

  // Already signed in (e.g. app restarted) → straight to the dashboard.
  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg("");
    setInfoMsg("");

    try {
      if (!isSupabaseConfigured) throw new Error("The app is missing its database settings. See README → Setup.");

      if (mode === "forgot") {
        // Never reveals whether the email exists. An administrator sets a temporary password.
        const { error } = await supabase.rpc("request_password_reset", { p_email: email });
        if (error) throw error;
        setInfoMsg("Request sent. An administrator will set a temporary password and pass it on to you.");
        setMode("signin");
        return;
      }
      if (mode === "signup") {
        // Separate, non-persistent client: the request must not sign anyone in on this device.
        const requestClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false, storageKey: "erp-request" } });
        const { error } = await requestClient.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName.trim() } },
        });
        if (error) throw error;
        // New accounts wait for an administrator; don't leave a half-usable session behind.
        await requestClient.auth.signOut();
        setInfoMsg("Request sent. An administrator must approve your account before you can sign in.");
        setMode("signin");
        setPassword("");
        return;
      } else {
        // A dead mobile connection can leave the request hanging; don't spin forever.
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Could not reach the server. Check your internet connection and try again.")), 25_000)
        );
        const { error } = await Promise.race([supabase.auth.signInWithPassword({ email, password }), timeout]);
        if (error) throw error;
      }
      router.push("/dashboard");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "";
      // The browser reports a refused/unreachable request as "Failed to fetch" (e.g. the sign-in service's
      // rate limit for a shared school network, or no connection) — say what the person can do instead.
      setErrorMsg(
        /failed to fetch|network|load failed|rate limit|too many/i.test(message)
          ? "Couldn't reach the sign-in service. Check your connection; if many people are signing in on this network at once, wait a minute and try again."
          : message || "Failed to authenticate. Please check your credentials."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const sso = async (provider: string) => {
    setErrorMsg("");
    const redirectTo = `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`;
    const { error } = provider.startsWith("saml:")
      ? await supabase.auth.signInWithSSO({ domain: provider.slice(5), options: { redirectTo } })
      : await supabase.auth.signInWithOAuth({ provider: provider as "azure", options: { redirectTo, scopes: provider === "azure" ? "email" : undefined } });
    if (error) setErrorMsg(error.message);
  };

  return (
    <main className="flex-1 bg-[#F4F7FE] flex items-center justify-center relative overflow-hidden h-full w-full">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-linear-to-br from-cyan-400 to-blue-600 rounded-full blur-[120px] opacity-40 mix-blend-multiply"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-linear-to-br from-[#8A2387] to-[#E94057] rounded-full blur-[120px] opacity-40 mix-blend-multiply"></div>

      <div className="w-212.5 max-w-[95%] my-6 bg-white/60 backdrop-blur-2xl rounded-3xl shadow-[0_24px_48px_rgba(0,0,0,0.05)] border border-white flex overflow-hidden z-10">

        {/* Left Side: Branding */}
        <div className="hidden md:flex w-1/2 bg-linear-to-br from-[#2A0845] to-[#6441A5] p-12 text-white flex-col justify-between relative overflow-hidden">
          <div className="relative z-10">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-8 backdrop-blur-md shadow-inner border border-white/10">
              <Zap size={24} className="text-cyan-300" />
            </div>
            <h1 className="text-4xl font-black mb-4 leading-tight">Kern OS<br />Architecture.</h1>
            <p className="text-white/70 font-medium leading-relaxed">
              Welcome back to the enterprise portal. Access your curriculum, track tasks, and manage operations from a single secure endpoint.
            </p>
          </div>

          <div className="relative z-10 text-xs font-bold tracking-wider text-white/50 uppercase">
            Database Connection:{" "}
            {isSupabaseConfigured ? <span className="text-emerald-400 ml-1">Configured</span> : <span className="text-pink-400 ml-1">Not configured</span>}
          </div>
        </div>

        {/* Right Side: Login / Sign-up Form */}
        <div className="w-full md:w-1/2 p-6 md:p-12 bg-white flex flex-col justify-center">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">{mode === "signin" ? "Secure Sign In" : mode === "signup" ? "Request Access" : "Forgot Password"}</h2>
          <p className="text-sm font-medium text-slate-500 mb-8">
            {mode === "signin"
              ? "Enter your credentials to access the cloud portal."
              : mode === "signup"
                ? "An administrator approves new accounts and assigns your role."
                : "Enter your email. An administrator will set a temporary password for you."}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm font-semibold">
                <AlertCircle size={18} className="shrink-0" />
                {errorMsg}
              </div>
            )}
            {infoMsg && (
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 text-emerald-700 text-sm font-semibold">
                <CheckCircle2 size={18} className="shrink-0" />
                {infoMsg}
              </div>
            )}

            {mode === "signup" && (
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input type="text" required placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} className={fieldClass} />
              </div>
            )}
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input type="email" required placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldClass} />
            </div>
            {mode !== "forgot" && (
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input type="password" required minLength={8} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={fieldClass} />
            </div>
            )}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white py-4 rounded-2xl text-sm font-bold shadow-md hover:bg-slate-800 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <><Loader2 size={16} className="animate-spin" /> {mode === "signin" ? "Authenticating..." : "Sending request..."}</>
              ) : (
                <>{mode === "signin" ? "Connect to Database" : mode === "signup" ? "Request Access" : "Send Reset Request"} <ArrowRight size={16} /></>
              )}
            </button>
          </form>

          {mode === "signin" && SSO.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-center text-xs font-bold uppercase tracking-wider text-slate-400">or</p>
              {SSO.map((p) => (
                <button key={p} type="button" onClick={() => sso(p)} className="w-full py-3 rounded-2xl border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50">
                  Continue with {p.startsWith("saml:") ? `school SSO (${p.slice(5)})` : SSO_LABEL[p] ?? p}
                </button>
              ))}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-4 text-sm font-semibold">
            <button
              onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setErrorMsg(""); setInfoMsg(""); }}
              className="text-indigo-600 hover:text-indigo-800"
            >
              {mode === "signin" ? "No account yet? Request access" : "Back to sign in"}
            </button>
            {mode === "signin" && (
              <button onClick={() => { setMode("forgot"); setErrorMsg(""); setInfoMsg(""); }} className="text-slate-500 hover:text-slate-700 flex items-center gap-1">
                <KeyRound size={14} /> Forgot password?
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
