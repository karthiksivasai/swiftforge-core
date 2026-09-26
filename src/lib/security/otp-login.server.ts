import { sha256Hex, findUserByEmail, mintSessionForEmail, recordLoginAsUser, asInet, writeLoginLog, sendAccountEmail } from "@/lib/security/auth-server.server";
import { applicationAllows, otpRequestDecision, type AppChannel } from "@/lib/security/account-rules";

const OTP_TTL_MS = Number(process.env.OTP_TTL_MINUTES || 10) * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

function pepper(): string | null {
  return process.env.OTP_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

export function generateOtpCode(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 1_000_000).padStart(6, "0");
}

async function otpHash(code: string, userId: string): Promise<string> {
  const secret = pepper();
  if (!secret) throw new Error("OTP pepper is not configured");
  return sha256Hex(`${secret}:${userId}:${code}`);
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function requestLoginOtp(email: string, ip: string | null): Promise<"sent" | "silent" | "cooldown" | "email_failed" | "unconfigured"> {
  const client = await db();
  const account = await findUserByEmail(email);
  const decision = otpRequestDecision({
    exists: Boolean(account),
    active: account?.status === "ACTIVE",
    emailVerified: Boolean(account?.emailVerifiedAt),
    otpEnabled: Boolean(account?.otpEnabled),
    deleted: Boolean(account?.deletedAt),
  });
  if (!account || decision === "silent") return "silent";
  if (!pepper()) return "unconfigured";

  const { data: recent } = await client
    .from("otp_challenges")
    .select("created_at")
    .eq("user_id", account.userId)
    .eq("purpose", "LOGIN")
    .order("created_at", { ascending: false })
    .limit(1);
  const last = Array.isArray(recent) && recent[0] ? Date.parse(String(recent[0].created_at)) : 0;
  if (last && Date.now() - last < 60_000) return "cooldown";

  const now = new Date().toISOString();
  await client.from("otp_challenges").update({ consumed_at: now }).eq("user_id", account.userId).eq("purpose", "LOGIN").is("consumed_at", null);

  const code = generateOtpCode();
  const { error } = await client.from("otp_challenges").insert({
    tenant_id: account.tenantId,
    user_id: account.userId,
    purpose: "LOGIN",
    code_hash: await otpHash(code, account.userId),
    expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
  });
  if (error) return "email_failed";

  const sent = await sendAccountEmail(
    email,
    "Your Courier ERP sign-in code",
    `Your sign-in code is ${code}. It expires in ${Math.round(OTP_TTL_MS / 60000)} minutes and can be used once.`,
  );
  await client.from("audit_logs").insert({
    tenant_id: account.tenantId,
    entity_type: "users",
    entity_id: account.userId,
    action: "ACCESS",
    module_slug: "utl.user-setup",
    actor_id: account.authUserId,
    new_values: { event: sent ? "OTP_REQUESTED" : "OTP_EMAIL_FAILED" },
    ip_address: asInet(ip),
  });
  if (!sent) {
    await client.from("otp_challenges").update({ consumed_at: new Date().toISOString() }).eq("user_id", account.userId).is("consumed_at", null);
    return "email_failed";
  }
  return "sent";
}

export async function verifyLoginOtp(args: {
  email: string;
  code: string;
  channel: AppChannel;
  ip: string | null;
  userAgent: string | null;
}): Promise<{ accessToken: string; refreshToken: string; sessionId: string | null } | { error: string; status: number }> {
  const account = await findUserByEmail(args.email);
  const allowed = otpRequestDecision({
    exists: Boolean(account),
    active: account?.status === "ACTIVE",
    emailVerified: Boolean(account?.emailVerifiedAt),
    otpEnabled: Boolean(account?.otpEnabled),
    deleted: Boolean(account?.deletedAt),
  });
  if (!account || allowed !== "send" || !applicationAllows(account.applicationType, args.channel) || !/^\d{6}$/.test(args.code)) {
    return { error: "Invalid or expired code", status: 401 };
  }

  const client = await db();
  const { data: rows } = await client
    .from("otp_challenges")
    .select("id, code_hash, expires_at, attempts, consumed_at")
    .eq("user_id", account.userId)
    .eq("purpose", "LOGIN")
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || Number(row.attempts) >= OTP_MAX_ATTEMPTS) {
    return { error: "Invalid or expired code", status: 401 };
  }

  const expected = await otpHash(args.code, account.userId);
  if (expected !== row.code_hash) {
    const attempts = Number(row.attempts) + 1;
    await client.from("otp_challenges").update({
      attempts,
      consumed_at: attempts >= OTP_MAX_ATTEMPTS ? new Date().toISOString() : null,
    }).eq("id", row.id);
    await client.from("audit_logs").insert({
      tenant_id: account.tenantId,
      entity_type: "users",
      entity_id: account.userId,
      action: "ACCESS",
      module_slug: "utl.user-setup",
      actor_id: account.authUserId,
      new_values: { event: "OTP_VERIFY_FAILED" },
      ip_address: asInet(args.ip),
    });
    return { error: "Invalid or expired code", status: 401 };
  }

  await client.from("otp_challenges").update({ consumed_at: new Date().toISOString() }).eq("id", row.id);
  const authEmail = account.email;
  if (!authEmail) return { error: "Invalid or expired code", status: 401 };
  const session = await mintSessionForEmail(authEmail);
  if ("error" in session) return { error: "Invalid or expired code", status: 401 };
  const sessionId = await recordLoginAsUser(session.accessToken, args.userAgent, asInet(args.ip));
  await writeLoginLog({
    tenantId: account.tenantId,
    userId: account.userId,
    username: account.username,
    event: "LOGIN_SUCCESS",
    ip: args.ip,
    userAgent: args.userAgent,
    detail: "otp",
  });
  await client.from("audit_logs").insert({
    tenant_id: account.tenantId,
    entity_type: "users",
    entity_id: account.userId,
    action: "LOGIN",
    module_slug: "utl.user-setup",
    actor_id: account.authUserId,
    new_values: { event: "OTP_VERIFY_SUCCESS" },
    ip_address: asInet(args.ip),
  });
  return { accessToken: session.accessToken, refreshToken: session.refreshToken, sessionId };
}
