import { passwordPolicyError, parsePasswordPolicy, type PasswordPolicy } from "@/lib/security/password-policy";
import {
  createSupabaseFetch,
  isNewSupabaseApiKey,
  supabaseProjectUrl,
  supabasePublishableKey,
} from "@/lib/security/supabase-env.server";

const LOCKOUT_LIMIT = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function asInet(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return value;
  if (value.includes(":") && /^[0-9a-f:]+$/i.test(value)) return value;
  return null;
}

type AdminClient = {
  from: (table: string) => any;
  auth: {
    admin: {
      updateUserById: (id: string, attrs: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      getUserById: (id: string) => Promise<{ data: { user: { id: string; email?: string | null } | null }; error: { message: string } | null }>;
      generateLink: (args: { type: "magiclink"; email: string }) => Promise<{ data: { properties?: { hashed_token?: string } } | null; error: { message: string } | null }>;
    };
  };
};

async function admin(): Promise<AdminClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AdminClient;
}

export type LoginAccount = {
  tenantId: string;
  userId: string;
  authUserId: string | null;
  email: string | null;
  username: string;
  status: string;
  applicationType: string;
  otpEnabled: boolean;
  emailVerifiedAt: string | null;
  deletedAt: string | null;
};

const LOGIN_ACCOUNT_COLUMNS =
  "id, tenant_id, auth_user_id, email, username, status, application_type, otp_login_enabled, email_verified_at, deleted_at";

function mapLoginAccount(user: Record<string, unknown>): LoginAccount {
  return {
    tenantId: String(user.tenant_id),
    userId: String(user.id),
    authUserId: user.auth_user_id ? String(user.auth_user_id) : null,
    email: user.email ? String(user.email) : null,
    username: String(user.username ?? ""),
    status: String(user.status ?? ""),
    applicationType: String(user.application_type ?? "PORTAL"),
    otpEnabled: user.otp_login_enabled === true,
    emailVerifiedAt: user.email_verified_at ? String(user.email_verified_at) : null,
    deletedAt: user.deleted_at ? String(user.deleted_at) : null,
  };
}

export async function findUserByEmail(email: string): Promise<LoginAccount | null> {
  const db = await admin();
  const { data, error } = await db
    .from("users")
    .select(LOGIN_ACCOUNT_COLUMNS)
    .eq("email_normalized", email)
    .is("deleted_at", null)
    .limit(2);
  if (error || !Array.isArray(data) || data.length !== 1) return null;
  return mapLoginAccount(data[0] as Record<string, unknown>);
}

export async function findUserByUsername(username: string): Promise<LoginAccount | null> {
  const wanted = username.trim().toLowerCase();
  if (!wanted) return null;
  const pattern = wanted.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  const db = await admin();
  const { data, error } = await db
    .from("users")
    .select(LOGIN_ACCOUNT_COLUMNS)
    .is("deleted_at", null)
    .ilike("username", pattern)
    .limit(10);
  if (error || !Array.isArray(data) || data.length === 0 || data.length >= 10) return null;
  const matches = (data as Record<string, unknown>[]).filter(
    (row) => String(row.username ?? "").trim().toLowerCase() === wanted,
  );
  if (matches.length !== 1) return null;
  return mapLoginAccount(matches[0]);
}

export async function authEmailForUser(authUserId: string): Promise<string | null> {
  const db = await admin();
  const { data, error } = await db.auth.admin.getUserById(authUserId);
  if (error || !data.user?.email) return null;
  return data.user.email;
}

export async function loadPasswordPolicy(tenantId: string): Promise<PasswordPolicy> {
  const db = await admin();
  const { data } = await db
    .from("tenant_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", "password_policy")
    .limit(1);
  const row = Array.isArray(data) ? data[0] : null;
  return parsePasswordPolicy(row && typeof row === "object" ? (row as { value?: unknown }).value : null);
}

export async function findTenantUser(tenantSlug: string, username: string): Promise<{
  tenantId: string;
  userId: string;
  authUserId: string | null;
  email: string | null;
  username: string;
  status: string;
} | null> {
  const db = await admin();
  const { data: tenant } = await db
    .from("tenants")
    .select("id")
    .eq("slug", tenantSlug.trim().toLowerCase())
    .is("deleted_at", null)
    .maybeSingle();
  if (!tenant?.id) return null;

  const { data: user } = await db
    .from("users")
    .select("id, auth_user_id, email, username, status")
    .eq("tenant_id", tenant.id)
    .ilike("username", username.trim())
    .is("deleted_at", null)
    .maybeSingle();
  if (!user?.id) return null;
  return {
    tenantId: String(tenant.id),
    userId: String(user.id),
    authUserId: user.auth_user_id ? String(user.auth_user_id) : null,
    email: user.email ? String(user.email) : null,
    username: String(user.username),
    status: String(user.status ?? ""),
  };
}

export async function loginLocked(tenantId: string, username: string): Promise<boolean> {
  const db = await admin();
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MS).toISOString();
  const { count } = await db
    .from("login_logs")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("event", "LOGIN_FAILED")
    .ilike("username", username)
    .gte("created_at", since);
  return (count ?? 0) >= LOCKOUT_LIMIT;
}

export async function writeLoginLog(args: {
  tenantId: string;
  userId: string | null;
  username: string;
  event: "LOGIN_FAILED" | "LOGIN_SUCCESS";
  userType?: string | null;
  ip: string | null;
  userAgent: string | null;
  detail?: string;
}): Promise<void> {
  const db = await admin();
  await db.from("login_logs").insert({
    tenant_id: args.tenantId,
    user_id: args.userId,
    username: args.username,
    event: args.event,
    user_type: args.userType ?? null,
    ip_address: asInet(args.ip),
    user_agent: args.userAgent,
    detail: args.detail ?? null,
  });
}

export function authEmailFor(username: string, tenantSlug: string): string {
  return `${username.trim().toLowerCase()}@${tenantSlug.trim().toLowerCase()}.cms.local`;
}

export async function signInWithPassword(email: string, password: string): Promise<{
  accessToken: string;
  refreshToken: string;
} | { error: string }> {
  const supabaseUrl = supabaseProjectUrl();
  const supabaseKey = supabasePublishableKey();
  if (!supabaseUrl || !supabaseKey) return { error: "Server auth is not configured" };

  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(supabaseUrl, supabaseKey, {
    global: { fetch: createSupabaseFetch(supabaseKey) },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) return { error: "Invalid username or password" };
  return { accessToken: data.session.access_token, refreshToken: data.session.refresh_token };
}

export async function recordLoginAsUser(accessToken: string, userAgent: string | null, ip: string | null): Promise<string | null> {
  const supabaseUrl = supabaseProjectUrl();
  const supabaseKey = supabasePublishableKey();
  if (!supabaseUrl || !supabaseKey) return null;
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(supabaseUrl, supabaseKey, {
    global: {
      fetch: createSupabaseFetch(supabaseKey),
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data } = await client.rpc("record_login", {
    p_app: "WEB",
    p_ip: ip,
    p_user_agent: userAgent,
  });
  return typeof data === "string" ? data : null;
}

export async function storeAccessToken(
  userId: string,
  tenantId: string,
  tokenHash: string,
  purpose: "RESET" | "INVITE",
  ttlMs: number,
): Promise<void> {
  const db = await admin();
  const now = new Date().toISOString();
  await db
    .from("password_reset_tokens")
    .update({ used_at: now })
    .eq("user_id", userId)
    .eq("purpose", purpose)
    .is("used_at", null);
  await db.from("password_reset_tokens").insert({
    tenant_id: tenantId,
    user_id: userId,
    token_hash: tokenHash,
    purpose,
    expires_at: new Date(Date.now() + ttlMs).toISOString(),
  });
}

export async function storePasswordReset(userId: string, tenantId: string, tokenHash: string): Promise<void> {
  await storeAccessToken(userId, tenantId, tokenHash, "RESET", 30 * 60 * 1000);
}

export async function consumeAccessToken(
  token: string,
  password: string,
  purpose: "RESET" | "INVITE",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = await admin();
  const tokenHash = await sha256Hex(token);
  const { data: match } = await db
    .from("password_reset_tokens")
    .select("id, user_id, tenant_id, expires_at, used_at, purpose")
    .eq("token_hash", tokenHash)
    .eq("purpose", purpose)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!match) return { ok: false, error: "This link is invalid or has expired" };

  const { data: user } = await db
    .from("users")
    .select("id, auth_user_id, username, tenant_id, status, deleted_at")
    .eq("id", match.user_id)
    .maybeSingle();
  if (!user?.auth_user_id || user.deleted_at) return { ok: false, error: "This link is invalid or has expired" };

  const policy = await loadPasswordPolicy(String(user.tenant_id));
  const policyError = passwordPolicyError(password, String(user.username ?? ""), policy);
  if (policyError) return { ok: false, error: policyError };

  const { error } = await db.auth.admin.updateUserById(String(user.auth_user_id), {
    password,
    email_confirm: true,
  });
  if (error) return { ok: false, error: "Could not update password" };

  const now = new Date().toISOString();
  await db.from("password_reset_tokens").update({ used_at: now }).eq("id", match.id);
  await db.from("users").update({
    email_verified_at: now,
    access_invalid_before: now,
  }).eq("id", user.id);
  await db
    .from("sessions")
    .update({ revoked_at: now, revoke_reason: purpose === "INVITE" ? "ACTIVATED" : "PASSWORD_RESET" })
    .eq("user_id", user.id)
    .is("revoked_at", null);
  await deleteGoTrueSessions(String(user.auth_user_id), null);
  await db.from("audit_logs").insert({
    tenant_id: user.tenant_id,
    entity_type: "users",
    entity_id: user.id,
    action: "ACCESS",
    module_slug: "utl.user-setup",
    actor_id: user.auth_user_id,
    new_values: { event: purpose === "INVITE" ? "PASSWORD_ACTIVATED" : "PASSWORD_RESET" },
  });
  return { ok: true };
}

export async function consumePasswordReset(token: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return consumeAccessToken(token, password, "RESET");
}

export async function deleteGoTrueSessions(authUserId: string, authSessionId: string | null): Promise<void> {
  const supabaseUrl = supabaseProjectUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;
  const path = authSessionId
    ? `${supabaseUrl}/auth/v1/admin/users/${authUserId}/sessions/${authSessionId}`
    : `${supabaseUrl}/auth/v1/admin/users/${authUserId}/sessions`;
  await fetch(path, {
    method: "DELETE",
    headers: {
      apikey: serviceKey,
      ...(isNewSupabaseApiKey(serviceKey) ? {} : { Authorization: `Bearer ${serviceKey}` }),
    },
  }).catch(() => undefined);
}

export async function mintSessionForEmail(email: string): Promise<{ accessToken: string; refreshToken: string } | { error: string }> {
  const db = await admin();
  const link = await db.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) return { error: "Could not start a session" };

  const supabaseUrl = supabaseProjectUrl();
  const supabaseKey = supabasePublishableKey();
  if (!supabaseUrl || !supabaseKey) return { error: "Server auth is not configured" };

  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(supabaseUrl, supabaseKey, {
    global: { fetch: createSupabaseFetch(supabaseKey) },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (error || !data.session) return { error: "Could not start a session" };
  return { accessToken: data.session.access_token, refreshToken: data.session.refresh_token };
}

export function deliverableEmail(email: string | null): string | null {
  if (!email) return null;
  const value = email.trim().toLowerCase();
  if (!value.includes("@") || value.endsWith("@cms.local") || value.endsWith(".cms.local")) return null;
  return value;
}

export async function sendAccountEmail(to: string, subject: string, text: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESET_EMAIL_FROM;
  if (!apiKey || !from) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  return res.ok;
}

export async function sendResetEmail(to: string, token: string, origin: string): Promise<boolean> {
  const link = `${origin.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
  return sendAccountEmail(
    to,
    "Reset your Courier ERP password",
    `Use this link within 30 minutes to choose a new password:\n\n${link}\n\nIf you did not request this, ignore this email.`,
  );
}
