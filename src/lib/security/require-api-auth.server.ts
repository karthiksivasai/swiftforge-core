/**
 * File-route equivalent of `requireSupabaseAuth`.
 *
 * `requireSupabaseAuth` is TanStack function middleware, so it does not run
 * inside `createFileRoute` server handlers. This guard performs the same
 * bearer-token check, then requires a tenant, an active app session, and a
 * module permission. Call it at the start of every protected `/api/*` handler.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { clientAddress, takeRateLimit } from "@/lib/security/rate-limit";
import { CMS_SESSION_HEADER } from "@/lib/security/session";

export type ApiPermissionAction = "add" | "modify" | "delete" | "list" | "search";

export type ApiPermission = {
  slug: string;
  action: ApiPermissionAction;
};

export type ApiAuthContext = {
  supabase: SupabaseClient;
  userId: string;
  tenantId: string;
  username: string;
  homeBranchId: string | null;
  userType: string;
};

type GuardOptions = {
  /** Caller must hold at least one of these permissions. */
  anyOf: ApiPermission[];
  limit?: number;
  windowMs?: number;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function deny(status: number, error: string, headers?: HeadersInit): Response {
  return Response.json({ error }, { status, headers });
}

export async function requireApiAuth(request: Request, options: GuardOptions): Promise<ApiAuthContext | Response> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return deny(500, "Server auth is not configured");
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return deny(401, "Unauthorized");
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token || token.split(".").length !== 3) {
    return deny(401, "Unauthorized");
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: {
      fetch: createSupabaseFetch(supabaseKey),
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    return deny(401, "Unauthorized");
  }
  const userId = String(data.claims.sub);

  const limit = options.limit ?? 120;
  const windowMs = options.windowMs ?? 60_000;
  const path = new URL(request.url).pathname;
  const rate = takeRateLimit(`user:${userId}:${path}`, limit, windowMs);
  if (!rate.ok) {
    return deny(429, "Too many requests", { "Retry-After": String(rate.retryAfterSec) });
  }

  const sessionId = request.headers.get(CMS_SESSION_HEADER)?.trim() ?? "";
  if (!UUID_RE.test(sessionId)) {
    return deny(401, "Unauthorized");
  }

  const { data: sessionActive, error: sessionError } = await supabase.rpc("my_session_is_active", {
    p_session_id: sessionId,
  });
  if (sessionError || sessionActive !== true) {
    return deny(401, "Unauthorized");
  }

  const { data: meRows, error: meError } = await supabase.rpc("me");
  if (meError) return deny(401, "Unauthorized");
  const me = Array.isArray(meRows) ? meRows[0] : meRows;
  const tenantId = me && typeof me === "object" && "tenant_id" in me ? String(me.tenant_id ?? "") : "";
  if (!tenantId) return deny(401, "Unauthorized");

  let permitted = false;
  for (const permission of options.anyOf) {
    const { data: allowed, error: permError } = await supabase.rpc("has_permission", {
      p_slug: permission.slug,
      p_action: permission.action,
    });
    if (!permError && allowed === true) {
      permitted = true;
      break;
    }
  }
  if (!permitted) return deny(403, "Forbidden");

  const row = me as {
    tenant_id: string;
    username?: string | null;
    home_branch_id?: string | null;
    user_type?: string | null;
  };

  return {
    supabase,
    userId,
    tenantId,
    username: row.username ?? "",
    homeBranchId: row.home_branch_id ?? null,
    userType: row.user_type ?? "",
  };
}

export function requirePublicRateLimit(request: Request, scope: string, limit: number, windowMs: number): Response | null {
  const rate = takeRateLimit(`ip:${clientAddress(request)}:${scope}`, limit, windowMs);
  if (rate.ok) return null;
  return deny(429, "Too many requests", { "Retry-After": String(rate.retryAfterSec) });
}
