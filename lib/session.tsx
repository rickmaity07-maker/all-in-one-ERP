"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type Role = "owner" | "administration" | "teacher" | "student" | "parent" | "alumni";

export type Profile = {
  id: string;
  full_name: string;
  role: Role;
  email?: string | null;
  active?: boolean | null;
  pending?: boolean | null;
  must_change_password?: boolean | null;
};

type SessionState = {
  user: User | null;
  profile: Profile | null;
  role: Role;
  loading: boolean;
  // True while the profile could not be loaded because the server is unreachable.
  unreachable: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export const ADMIN_ROLES: Role[] = ["owner", "administration"];
export const STAFF_ROLES: Role[] = ["owner", "administration", "teacher"];

// Email is not readable from profiles (privacy); it comes from the signed-in auth user instead.
const PROFILE_COLUMNS = "id, full_name, role, active, pending, must_change_password";

export const LOGIN_NOTICE_KEY = "erp_login_notice";
const PROFILE_CACHE = "erp_profile_";

// Last profile loaded for this user, so a dropped connection (common on phones) doesn't look like
// a missing or unapproved account. Only the user's own name/role flags; the server still enforces access.
const cachedProfile = (id: string): Profile | null => {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_CACHE + id) ?? "null");
  } catch {
    return null;
  }
};
const cacheProfile = (p: Profile) => {
  try {
    localStorage.setItem(PROFILE_CACHE + p.id, JSON.stringify({ ...p, email: undefined }));
  } catch {}
};

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreachable, setUnreachable] = useState(false);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Id of the user whose profile we want. Loads that finish for anyone else (e.g. a slow request
  // from before a log-out/log-in) are ignored so they can't overwrite the current profile.
  const wanted = useRef<string | null>(null);

  const loadProfile = useCallback(async function load(u: User | null): Promise<void> {
    wanted.current = u?.id ?? null;
    if (!u) {
      setProfile(null);
      return;
    }
    if (retry.current) clearTimeout(retry.current);
    const { data, error } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", u.id).maybeSingle();
    if (wanted.current !== u.id) return;
    if (error) {
      // Network or server trouble: keep going with what we knew and try again shortly.
      const cached = cachedProfile(u.id);
      if (cached) setProfile({ ...cached, email: u.email });
      setUnreachable(!cached);
      retry.current = setTimeout(() => load(u), 5000);
      return;
    }
    setUnreachable(false);
    if (data) {
      const p = { ...(data as Profile), email: u.email } as Profile;
      cacheProfile(p);
      setProfile(p);
    } else {
      // The database trigger creates the profile on sign-up; until it exists treat the account as pending.
      setProfile({ id: u.id, full_name: u.email?.split("@")[0] ?? "User", role: "student", email: u.email, active: false, pending: true });
    }
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    setUser(data.user);
    await loadProfile(data.user);
  }, [loadProfile]);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      const u = data.session?.user ?? null;
      setUser(u);
      await loadProfile(u);
      if (!cancelled) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        const u = session?.user ?? null;
        setUser(u);
        // Defer DB calls out of the auth callback (supabase-js can deadlock otherwise).
        setTimeout(() => loadProfile(u), 0);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    const id = wanted.current;
    wanted.current = null;
    if (retry.current) clearTimeout(retry.current);
    try {
      if (id) localStorage.removeItem(PROFILE_CACHE + id);
    } catch {}
    // This device only: the default ("global") would also sign the person out on their phone,
    // the web version and every other device at the same time.
    await supabase.auth.signOut({ scope: "local" });
    setUser(null);
    setProfile(null);
  }, []);

  return (
    <SessionContext.Provider value={{ user, profile, role: profile?.role ?? "student", loading, unreachable, refresh, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

export function isAdmin(role: Role) {
  return ADMIN_ROLES.includes(role);
}

export function isStaff(role: Role) {
  return STAFF_ROLES.includes(role);
}

export function setLoginNotice(message: string) {
  try {
    sessionStorage.setItem(LOGIN_NOTICE_KEY, message);
  } catch {}
}

// Sends signed-out visitors to the login screen, keeps pending/deactivated accounts out,
// and forces a password change after an administrator reset.
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, unreachable, signOut } = useSession();
  // The web version uses folder-style URLs ("/settings/"); compare paths without the trailing slash.
  const pathname = (usePathname() ?? "/").replace(/(.)\/+$/, "$1");
  const router = useRouter();
  // The login screen and the public credential checker need no account.
  const isLogin = pathname === "/" || pathname.startsWith("/verify");
  const blocked = !!profile && profile.active === false;
  const mustChange = !!profile?.must_change_password && profile.active !== false;

  useEffect(() => {
    if (loading || isLogin) return;
    if (!user) router.replace("/");
    else if (blocked) {
      setLoginNotice(
        profile?.pending
          ? "Your account is waiting for an administrator to approve it. You'll be able to sign in once it's approved."
          : "This account has been deactivated. Contact an administrator."
      );
      signOut().then(() => router.replace("/"));
    } else if (mustChange && pathname !== "/settings") router.replace("/settings");
  }, [loading, user, blocked, mustChange, isLogin, pathname, profile?.pending, router, signOut]);

  if (!isLogin && user && !profile && unreachable) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center text-slate-500 font-semibold">
        Can&apos;t reach the server. Check your internet connection — retrying automatically…
      </div>
    );
  }
  // Wait for the profile too, so pages never render with a stale/default role.
  if (!isLogin && (loading || !user || !profile || profile.id !== user.id || blocked)) return null;
  if (!isLogin && mustChange && pathname !== "/settings") return null;
  return <>{children}</>;
}
