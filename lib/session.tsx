"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type Role = "owner" | "administration" | "teacher" | "student";

export type Profile = {
  id: string;
  full_name: string;
  role: Role;
  email?: string | null;
  active?: boolean | null;
};

type SessionState = {
  user: User | null;
  profile: Profile | null;
  role: Role;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export const ADMIN_ROLES: Role[] = ["owner", "administration"];
export const STAFF_ROLES: Role[] = ["owner", "administration", "teacher"];

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (u: User | null) => {
    if (!u) {
      setProfile(null);
      return;
    }
    const { data } = await supabase.from("profiles").select("*").eq("id", u.id).maybeSingle();
    // The database trigger creates the profile on sign-up; until it exists treat the user as a student.
    setProfile(
      (data as Profile) ?? { id: u.id, full_name: u.email?.split("@")[0] ?? "User", role: "student", email: u.email }
    );
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
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, []);

  return (
    <SessionContext.Provider value={{ user, profile, role: profile?.role ?? "student", loading, refresh, signOut }}>
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

// Sends signed-out visitors back to the login screen and deactivated accounts out of the app.
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/";

  useEffect(() => {
    if (loading || isLogin) return;
    if (!user) router.replace("/");
    else if (profile && profile.active === false) {
      try { sessionStorage.setItem("erp_login_notice", "This account has been deactivated. Contact an administrator."); } catch {}
      signOut().then(() => router.replace("/"));
    }
  }, [loading, user, profile, isLogin, router, signOut]);

  // Wait for the profile too, so pages never render with a stale/default role.
  if (!isLogin && (loading || !user || !profile || profile.id !== user.id)) return null;
  return <>{children}</>;
}
