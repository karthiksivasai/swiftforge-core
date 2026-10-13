/**
 * Phase 2 authentication + RBAC context.
 *
 * Wraps Supabase Auth (identity/password/session) and the database-side RBAC
 * RPCs (me / me_permissions / record_login / record_logout / revoke_session).
 * Permissions are resolved server-side per request — never trusted from the
 * client — so this context is a convenience layer for UI gating only; the real
 * enforcement is RLS + SECURITY DEFINER functions in the database.
 *
 * Email login. The tenant is read from the matching public.users row after the
 * email is authenticated. The client does not send a company code.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { can, type PermissionAction, type PermissionActions } from "@/lib/permissions";
import { CMS_SESSION_STORAGE_KEY } from "@/lib/security/session";

export const AUTH_EMAIL_DOMAIN_SUFFIX = "cms.local";

export function usernameToAuthEmail(username: string, tenantSlug: string): string {
  return `${username.trim().toLowerCase()}@${tenantSlug.trim().toLowerCase()}.${AUTH_EMAIL_DOMAIN_SUFFIX}`;
}

// Re-exported for backward compatibility; the canonical source is @/lib/permissions.
export type { PermissionAction, PermissionActions } from "@/lib/permissions";

export type PermissionRow = PermissionActions & {
  slug: string;
  section: string;
  name: string;
  under_menu: string | null;
};

export type UserProfile = {
  id: string;
  tenant_id: string;
  auth_user_id: string;
  username: string;
  user_type: "ADMIN" | "STAFF" | "CUSTOMER";
  full_name: string | null;
  email: string | null;
  home_branch_id: string | null;
  is_global: boolean;
  status: string;
};

type AuthState = {
  loading: boolean;
  session: Session | null;
  profile: UserProfile | null;
  permissions: Record<string, PermissionActions>;
  isAuthenticated: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signInWithOtp: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  hasPermission: (slug: string, action: PermissionAction) => boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function toPermissionMap(rows: PermissionRow[] | null): Record<string, PermissionActions> {
  const map: Record<string, PermissionActions> = {};
  for (const r of rows ?? []) {
    map[r.slug] = {
      all_access: r.all_access,
      can_add: r.can_add,
      can_modify: r.can_modify,
      can_delete: r.can_delete,
      can_list: r.can_list,
      can_search: r.can_search,
    };
  }
  return map;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [permissions, setPermissions] = useState<Record<string, PermissionActions>>({});
  const appSessionId = useRef<string | null>(null);
  const ignoreAuthEvent = useRef(false);

  const loadContext = useCallback(async (activeSession: Session | null, options?: { fresh?: boolean }) => {
    setSession(activeSession);
    if (!activeSession) {
      setProfile(null);
      setPermissions({});
      return;
    }
    const sessionId =
      typeof window !== "undefined" ? window.localStorage.getItem(CMS_SESSION_STORAGE_KEY) : null;
    if (!options?.fresh && sessionId) {
      const { data: active, error: sessionError } = await supabase.rpc("my_session_is_active", {
        p_session_id: sessionId,
      });
      if (!sessionError && active === false) {
        await supabase.auth.signOut();
        setProfile(null);
        setPermissions({});
        setSession(null);
        return;
      }
    }
    const [{ data: meRows, error: meError }, { data: permRows }] = await Promise.all([
      supabase.rpc("me"),
      supabase.rpc("me_permissions"),
    ]);
    if (meError) {
      setProfile(null);
      setPermissions({});
      return;
    }
    const me = Array.isArray(meRows)
      ? (meRows[0] as UserProfile | undefined)
      : (meRows as UserProfile | null);
    if (!me) {
      await supabase.auth.signOut();
      setProfile(null);
      setPermissions({});
      setSession(null);
      return;
    }
    setProfile(me);
    setPermissions(toPermissionMap(permRows as PermissionRow[] | null));
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!mounted) return;
        appSessionId.current =
          typeof window !== "undefined" ? window.localStorage.getItem(CMS_SESSION_STORAGE_KEY) : null;
        await loadContext(data.session ?? null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (ignoreAuthEvent.current) return;
      void loadContext(nextSession ?? null);
    });

    const watch = window.setInterval(() => {
      void supabase.auth.getSession().then(({ data: current }) => loadContext(current.session ?? null));
    }, 20_000);

    return () => {
      mounted = false;
      window.clearInterval(watch);
      sub.subscription.unsubscribe();
    };
  }, [loadContext]);

  const applyTokens = useCallback(
    async (body: { access_token?: string; refresh_token?: string; session_id?: string | null; error?: string }, responseOk: boolean) => {
      if (!responseOk || !body.access_token || !body.refresh_token) {
        throw new Error(body.error || "Invalid username or password");
      }
      if (typeof body.session_id === "string") {
        appSessionId.current = body.session_id;
        if (typeof window !== "undefined") {
          window.localStorage.setItem(CMS_SESSION_STORAGE_KEY, body.session_id);
        }
      }
      ignoreAuthEvent.current = true;
      try {
        const { data, error } = await supabase.auth.setSession({
          access_token: body.access_token,
          refresh_token: body.refresh_token,
        });
        if (error) throw error;
        void loadContext(data.session ?? null, { fresh: true });
      } finally {
        ignoreAuthEvent.current = false;
      }
    },
    [loadContext],
  );

  const signIn = useCallback(
    async (username: string, password: string) => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, channel: "WEB" }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        access_token?: string;
        refresh_token?: string;
        session_id?: string | null;
      };
      await applyTokens(body, response.ok);
    },
    [applyTokens],
  );

  const signInWithOtp = useCallback(
    async (email: string, code: string) => {
      const response = await fetch("/api/auth/otp-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, channel: "WEB" }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        access_token?: string;
        refresh_token?: string;
        session_id?: string | null;
      };
      await applyTokens(body, response.ok);
    },
    [applyTokens],
  );

  const signOut = useCallback(async () => {
    const sid = appSessionId.current;
    if (sid) {
      // PostgREST builder is a thenable (no `.catch`); swallow errors via then's reject arm.
      await supabase.rpc("record_logout", { p_session_id: sid }).then(undefined, () => undefined);
    }
    if (typeof window !== "undefined") window.localStorage.removeItem(CMS_SESSION_STORAGE_KEY);
    appSessionId.current = null;
    await supabase.auth.signOut();
    setProfile(null);
    setPermissions({});
    setSession(null);
  }, []);

  const hasPermission = useCallback(
    (slug: string, action: PermissionAction) => can(permissions[slug], action),
    [permissions],
  );

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await loadContext(data.session ?? null);
  }, [loadContext]);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      profile,
      permissions,
      isAuthenticated: Boolean(session),
      signIn,
      signInWithOtp,
      signOut,
      hasPermission,
      refresh,
    }),
    [loading, session, profile, permissions, signIn, signInWithOtp, signOut, hasPermission, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
