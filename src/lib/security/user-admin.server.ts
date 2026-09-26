import { randomToken, sha256Hex, deleteGoTrueSessions, sendAccountEmail, storeAccessToken } from "@/lib/security/auth-server.server";
import type { UserWriteInput } from "@/lib/security/account-rules";

type Admin = {
  from: (table: string) => any;
  auth: {
    admin: {
      createUser: (args: { email: string; password: string; email_confirm: boolean }) => Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
      deleteUser: (id: string) => Promise<{ error: { message: string } | null }>;
      updateUserById: (id: string, attrs: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
  };
};

async function db(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

function userRow(tenantId: string, authUserId: string, input: UserWriteInput, actorId: string) {
  return {
    tenant_id: tenantId,
    auth_user_id: authUserId,
    username: input.username,
    user_type: input.userType,
    user_subtype: input.userSubtype,
    full_name: input.fullName || null,
    email: input.email,
    mobile: input.mobile || null,
    origin_id: input.originId,
    home_branch_id: input.serviceCenterId,
    customer_id: input.customerId,
    birth_date: input.birthDate,
    joining_date: input.joiningDate,
    status: input.status,
    application_type: input.applicationType,
    allow_changing_date: input.allowChangingDate || null,
    add_entry_on_manifest: input.addEntryOnManifest,
    otp_login_enabled: input.allowLoginWithOtp,
    global_manifest: input.globalManifest,
    allow_changing_awb_no: input.allowChangingAwbNo,
    allow_mobile_scanning: input.allowMobileScanning,
    weight_unit: input.weightUnit,
    created_by: actorId,
    updated_by: actorId,
  };
}

async function owned(client: Admin, table: string, id: string, tenantId: string): Promise<boolean> {
  const { data } = await client.from(table).select("id").eq("id", id).eq("tenant_id", tenantId).is("deleted_at", null).maybeSingle();
  return Boolean(data?.id);
}

async function assertLinks(client: Admin, tenantId: string, input: UserWriteInput): Promise<string | null> {
  if (!(await owned(client, "branches", input.serviceCenterId, tenantId))) return "Service center is not in this company";
  if (!(await owned(client, "user_groups", input.groupId, tenantId))) return "Group is not in this company";
  if (input.originId && !(await owned(client, "destinations", input.originId, tenantId))) return "Origin is not in this company";
  if (input.customerId && !(await owned(client, "customers", input.customerId, tenantId))) return "Customer is not in this company";
  return null;
}

async function writeAudit(client: Admin, args: {
  tenantId: string;
  entityId: string | null;
  action: "ADD" | "MODIFY" | "DELETE" | "ACCESS";
  actorId: string | null;
  event: string;
  ip: string | null;
}): Promise<void> {
  const { error } = await client.from("audit_logs").insert({
    tenant_id: args.tenantId,
    entity_type: "users",
    entity_id: args.entityId,
    action: args.action,
    module_slug: "utl.user-setup",
    actor_id: args.actorId,
    new_values: { event: args.event },
    ip_address: args.ip,
  });
  if (error) console.error("user audit insert failed", error.message);
}

async function revokeAccess(client: Admin, userId: string, authUserId: string | null, reason: string): Promise<void> {
  const now = new Date().toISOString();
  await client.from("sessions").update({ revoked_at: now, revoke_reason: reason }).eq("user_id", userId).is("revoked_at", null);
  await client.from("users").update({ access_invalid_before: now }).eq("id", userId);
  if (authUserId) {
    await client.auth.admin.updateUserById(authUserId, { ban_duration: "876000h" }).catch(() => undefined);
    await deleteGoTrueSessions(authUserId, null);
  }
}

async function usernameTaken(client: Admin, tenantId: string, username: string, exceptId?: string): Promise<boolean> {
  const { data } = await client.from("users").select("id").eq("tenant_id", tenantId).ilike("username", username).is("deleted_at", null);
  return (data ?? []).some((row: { id: string }) => row.id !== exceptId);
}

async function emailTaken(client: Admin, email: string, exceptId?: string): Promise<boolean> {
  const { data } = await client.from("users").select("id").eq("email_normalized", email).is("deleted_at", null);
  return (data ?? []).some((row: { id: string }) => row.id !== exceptId);
}

export async function listManagedUsers(tenantId: string, search: string): Promise<Record<string, unknown>[]> {
  const client = await db();
  let query = client
    .from("users")
    .select("id, username, full_name, email, mobile, user_type, user_subtype, status, application_type, home_branch_id, origin_id, customer_id, birth_date, joining_date, allow_changing_date, add_entry_on_manifest, otp_login_enabled, global_manifest, allow_changing_awb_no, allow_mobile_scanning, weight_unit, email_verified_at")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("username")
    .limit(100);
  if (search) {
    const pat = `%${search.replace(/[%_]/g, "")}%`;
    query = query.or(`username.ilike.${pat},email.ilike.${pat}`);
  }
  const { data, error } = await query;
  if (error) throw new Error("Could not load users");
  const rows = (data ?? []) as Array<Record<string, unknown> & { id: string }>;
  const ids = rows.map((row) => row.id);
  const { data: members } = ids.length
    ? await client.from("user_group_members").select("user_id, group_id").eq("tenant_id", tenantId).in("user_id", ids)
    : { data: [] };
  const groupByUser = new Map<string, string>();
  for (const member of members ?? []) {
    if (!groupByUser.has(member.user_id)) groupByUser.set(member.user_id, member.group_id);
  }
  return rows.map((row) => ({ ...row, group_id: groupByUser.get(row.id) ?? null }));
}

export async function listUserLookups(tenantId: string): Promise<{
  branches: { id: string; code: string; name: string }[];
  origins: { id: string; code: string; name: string }[];
  customers: { id: string; code: string; name: string }[];
  groups: { id: string; name: string }[];
}> {
  const client = await db();
  const [branches, origins, customers, groups] = await Promise.all([
    client.from("branches").select("id, code, name").eq("tenant_id", tenantId).is("deleted_at", null).order("code").limit(200),
    client.from("destinations").select("id, code, name").eq("tenant_id", tenantId).is("deleted_at", null).order("name").limit(200),
    client.from("customers").select("id, code, name").eq("tenant_id", tenantId).is("deleted_at", null).order("name").limit(200),
    client.from("user_groups").select("id, name").eq("tenant_id", tenantId).eq("status", "ACTIVE").is("deleted_at", null).order("name").limit(200),
  ]);
  return {
    branches: branches.data ?? [],
    origins: origins.data ?? [],
    customers: customers.data ?? [],
    groups: groups.data ?? [],
  };
}

async function sendInvite(client: Admin, args: {
  tenantId: string;
  userId: string;
  email: string;
  origin: string;
  actorId: string;
  ip: string | null;
  purpose: "INVITE" | "RESET";
}): Promise<boolean> {
  const token = randomToken();
  await storeAccessToken(args.userId, args.tenantId, await sha256Hex(token), args.purpose, args.purpose === "INVITE" ? INVITE_TTL_MS : 30 * 60 * 1000);
  const path = args.purpose === "INVITE" ? "/activate" : "/reset-password";
  const link = `${args.origin.replace(/\/$/, "")}${path}?token=${encodeURIComponent(token)}`;
  const sent = await sendAccountEmail(
    args.email,
    args.purpose === "INVITE" ? "Activate your Courier ERP account" : "Reset your Courier ERP password",
    args.purpose === "INVITE"
      ? `An administrator created an account for you. Open this link within 24 hours and choose your own password:\n\n${link}\n\nThe link works once.`
      : `Open this link within 30 minutes to choose a new password:\n\n${link}\n\nThe link works once.`,
  );
  await client.from("users").update({ invitation_sent_at: new Date().toISOString() }).eq("id", args.userId);
  await writeAudit(client, {
    tenantId: args.tenantId,
    entityId: args.userId,
    action: "ACCESS",
    actorId: args.actorId,
    event: sent ? (args.purpose === "INVITE" ? "INVITE_SENT" : "PASSWORD_RESET_SENT") : "INVITE_FAILED",
    ip: args.ip,
  });
  return sent;
}

export async function createManagedUser(args: {
  tenantId: string;
  actorId: string;
  input: UserWriteInput;
  origin: string;
  ip: string | null;
}): Promise<{ id: string; emailSent: boolean } | { error: string; status: number }> {
  const client = await db();
  const linkError = await assertLinks(client, args.tenantId, args.input);
  if (linkError) return { error: linkError, status: 400 };
  if (await usernameTaken(client, args.tenantId, args.input.username)) return { error: "That username is already in use", status: 409 };
  if (await emailTaken(client, args.input.email)) return { error: "That email is already in use", status: 409 };

  const secret = `${randomToken()}aA1!`;
  const created = await client.auth.admin.createUser({
    email: args.input.email,
    password: secret,
    email_confirm: false,
  });
  const authUserId = created.data.user?.id;
  if (created.error || !authUserId) {
    const message = created.error?.message?.toLowerCase() ?? "";
    if (message.includes("already")) return { error: "That email is already in use", status: 409 };
    return { error: "Could not create the account", status: 500 };
  }

  const { data: inserted, error: insertError } = await client
    .from("users")
    .insert(userRow(args.tenantId, authUserId, args.input, args.actorId))
    .select("id")
    .single();
  if (insertError || !inserted?.id) {
    await client.auth.admin.deleteUser(authUserId);
    return { error: "Could not create the account", status: 500 };
  }

  const { error: memberError } = await client.from("user_group_members").insert({
    tenant_id: args.tenantId,
    user_id: inserted.id,
    group_id: args.input.groupId,
    created_by: args.actorId,
  });
  if (memberError) {
    await client.from("users").delete().eq("id", inserted.id);
    await client.auth.admin.deleteUser(authUserId);
    return { error: "Could not create the account", status: 500 };
  }

  await writeAudit(client, {
    tenantId: args.tenantId,
    entityId: inserted.id,
    action: "ADD",
    actorId: args.actorId,
    event: "USER_CREATED",
    ip: args.ip,
  });

  let emailSent = false;
  try {
    emailSent = await sendInvite(client, {
      tenantId: args.tenantId,
      userId: inserted.id,
      email: args.input.email,
      origin: args.origin,
      actorId: args.actorId,
      ip: args.ip,
      purpose: "INVITE",
    });
  } catch (error) {
    console.error("invite send failed", error instanceof Error ? error.message : "unknown");
  }

  return { id: inserted.id, emailSent };
}

export async function updateManagedUser(args: {
  tenantId: string;
  actorId: string;
  userId: string;
  input: UserWriteInput;
  ip: string | null;
}): Promise<{ ok: true; emailChanged: boolean } | { error: string; status: number }> {
  const client = await db();
  const { data: existing } = await client
    .from("users")
    .select("id, auth_user_id, email_normalized, status, deleted_at")
    .eq("id", args.userId)
    .eq("tenant_id", args.tenantId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!existing?.id) return { error: "User was not found", status: 404 };

  const linkError = await assertLinks(client, args.tenantId, args.input);
  if (linkError) return { error: linkError, status: 400 };
  if (await usernameTaken(client, args.tenantId, args.input.username, args.userId)) return { error: "That username is already in use", status: 409 };
  if (await emailTaken(client, args.input.email, args.userId)) return { error: "That email is already in use", status: 409 };

  const emailChanged = existing.email_normalized !== args.input.email;
  const patch: Record<string, unknown> = {
    ...userRow(args.tenantId, existing.auth_user_id, args.input, args.actorId),
    updated_at: new Date().toISOString(),
  };
  delete patch.created_by;
  if (emailChanged) patch.email_verified_at = null;
  const { error } = await client.from("users").update(patch).eq("id", args.userId).eq("tenant_id", args.tenantId);
  if (error) return { error: "Could not update the user", status: 500 };

  if (emailChanged && existing.auth_user_id) {
    const renamed = await client.auth.admin.updateUserById(existing.auth_user_id, {
      email: args.input.email,
      email_confirm: false,
    });
    if (renamed.error) return { error: "Could not update the sign-in email", status: 500 };
  }

  await client.from("user_group_members").delete().eq("user_id", args.userId).eq("tenant_id", args.tenantId);
  await client.from("user_group_members").insert({
    tenant_id: args.tenantId,
    user_id: args.userId,
    group_id: args.input.groupId,
    created_by: args.actorId,
  });

  if (args.input.status === "INACTIVE" && existing.status !== "INACTIVE") {
    await revokeAccess(client, args.userId, existing.auth_user_id, "DEACTIVATED");
  }
  if (args.input.status === "ACTIVE" && existing.status === "INACTIVE" && existing.auth_user_id) {
    await client.auth.admin.updateUserById(existing.auth_user_id, { ban_duration: "none" });
  }

  await writeAudit(client, {
    tenantId: args.tenantId,
    entityId: args.userId,
    action: "MODIFY",
    actorId: args.actorId,
    event: "USER_UPDATED",
    ip: args.ip,
  });
  return { ok: true, emailChanged };
}

async function loadLiveUser(client: Admin, tenantId: string, userId: string) {
  const { data } = await client
    .from("users")
    .select("id, auth_user_id, email, email_verified_at, status, deleted_at")
    .eq("id", userId)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();
  return data as { id: string; auth_user_id: string | null; email: string | null; email_verified_at: string | null; status: string } | null;
}

export async function deactivateManagedUser(tenantId: string, actorId: string, userId: string, ip: string | null) {
  const client = await db();
  const user = await loadLiveUser(client, tenantId, userId);
  if (!user) return { error: "User was not found", status: 404 };
  const { error } = await client.from("users").update({ status: "INACTIVE", updated_by: actorId, updated_at: new Date().toISOString() }).eq("id", userId).eq("tenant_id", tenantId);
  if (error) return { error: "Could not deactivate the user", status: 500 };
  await revokeAccess(client, userId, user.auth_user_id, "DEACTIVATED");
  await writeAudit(client, { tenantId, entityId: userId, action: "MODIFY", actorId, event: "USER_DEACTIVATED", ip });
  return { ok: true as const };
}

export async function reactivateManagedUser(tenantId: string, actorId: string, userId: string, ip: string | null) {
  const client = await db();
  const user = await loadLiveUser(client, tenantId, userId);
  if (!user) return { error: "User was not found", status: 404 };
  const { error } = await client.from("users").update({ status: "ACTIVE", updated_by: actorId, updated_at: new Date().toISOString() }).eq("id", userId).eq("tenant_id", tenantId);
  if (error) return { error: "Could not reactivate the user", status: 500 };
  if (user.auth_user_id) await client.auth.admin.updateUserById(user.auth_user_id, { ban_duration: "none" });
  await writeAudit(client, { tenantId, entityId: userId, action: "MODIFY", actorId, event: "USER_REACTIVATED", ip });
  return { ok: true as const };
}

export async function softDeleteManagedUser(tenantId: string, actorId: string, userId: string, ip: string | null) {
  const client = await db();
  const user = await loadLiveUser(client, tenantId, userId);
  if (!user) return { error: "User was not found", status: 404 };
  const now = new Date().toISOString();
  const { error } = await client.from("users").update({
    deleted_at: now,
    status: "INACTIVE",
    updated_by: actorId,
    updated_at: now,
  }).eq("id", userId).eq("tenant_id", tenantId);
  if (error) return { error: "Could not delete the user", status: 500 };
  await revokeAccess(client, userId, user.auth_user_id, "SOFT_DELETED");
  await writeAudit(client, { tenantId, entityId: userId, action: "DELETE", actorId, event: "USER_SOFT_DELETED", ip });
  return { ok: true as const };
}

export async function resendManagedAccess(args: {
  tenantId: string;
  actorId: string;
  userId: string;
  origin: string;
  ip: string | null;
}) {
  const client = await db();
  const user = await loadLiveUser(client, args.tenantId, args.userId);
  if (!user?.email) return { error: "User was not found", status: 404 };
  let sent = false;
  try {
    sent = await sendInvite(client, {
      tenantId: args.tenantId,
      userId: user.id,
      email: user.email,
      origin: args.origin,
      actorId: args.actorId,
      ip: args.ip,
      purpose: user.email_verified_at ? "RESET" : "INVITE",
    });
  } catch (error) {
    console.error("resend failed", error instanceof Error ? error.message : "unknown");
  }
  if (!sent) return { error: "The email could not be sent. Check the mail provider and try again.", status: 502 };
  return { ok: true as const };
}
