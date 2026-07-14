/**
 * Phase 2 authentication + RBAC context.
 *
 * Wraps Supabase Auth (identity/password/session) and the database-side RBAC
 * RPCs (me / me_permissions / record_login / record_logout / revoke_session).
 * Permissions are resolved server-side per request — never trusted from the
 * client — so this context is a convenience layer for UI gating only; the real
 * enforcement is RLS + SECURITY DEFINER functions in the database.
 *
 * Username login mapping (documented deviation): Supabase Auth is email-based,
 * so a tenant username maps to a deterministic synthetic auth email
 * `<username>@<tenant-slug>.cms.local`. Passwords are managed by Supabase Auth.
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
  signIn: (username: string, password: string, tenantSlug: string) => Promise<void>;
  signOut: () => Promise<void>;
  hasPermission: (slug: string, action: PermissionAction) => boolean;
  refresh: () => Promise<void>;
};

const SESSION_STORAGE_KEY = "cms.session_id";

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

  const loadContext = useCallback(async (activeSession: Session | null) => {
    setSession(activeSession);
    if (!activeSession) {
      setProfile(null);
      setPermissions({});
      return;
    }
    const [{ data: meRows }, { data: permRows }] = await Promise.all([
      supabase.rpc("me"),
      supabase.rpc("me_permissions"),
    ]);
    const me = Array.isArray(meRows)
      ? (meRows[0] as UserProfile | undefined)
      : (meRows as UserProfile | null);
    setProfile(me ?? null);
    setPermissions(toPermissionMap(permRows as PermissionRow[] | null));
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!mounted) return;
        appSessionId.current =
          typeof window !== "undefined" ? window.localStorage.getItem(SESSION_STORAGE_KEY) : null;
        await loadContext(data.session ?? null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void loadContext(nextSession ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadContext]);

  const signIn = useCallback(
    async (username: string, password: string, tenantSlug: string) => {
      const email = usernameToAuthEmail(username, tenantSlug);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await loadContext(data.session ?? null);
      // Record an app-side session row (Logged-in Users + force-logoff source).
      const { data: sid } = await supabase.rpc("record_login", {
        p_app: "WEB",
        p_ip: null,
        p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      });
      if (typeof sid === "string") {
        appSessionId.current = sid;
        if (typeof window !== "undefined") window.localStorage.setItem(SESSION_STORAGE_KEY, sid);
      }
    },
    [loadContext],
  );

  const signOut = useCallback(async () => {
    const sid = appSessionId.current;
    if (sid) {
      // PostgREST builder is a thenable (no `.catch`); swallow errors via then's reject arm.
      await supabase.rpc("record_logout", { p_session_id: sid }).then(undefined, () => undefined);
    }
    if (typeof window !== "undefined") window.localStorage.removeItem(SESSION_STORAGE_KEY);
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
      signOut,
      hasPermission,
      refresh,
    }),
    [loading, session, profile, permissions, signIn, signOut, hasPermission, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
