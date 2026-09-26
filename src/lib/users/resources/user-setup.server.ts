import type { SupabaseClient } from "@supabase/supabase-js";

import { userSetupPasswordError } from "@/lib/users/resources/user-setup-rules";

type Admin = {
  auth: {
    admin: {
      createUser: (args: { email: string; password: string; email_confirm: boolean }) => Promise<{
        data: { user: { id: string } | null };
        error: { message: string } | null;
      }>;
      deleteUser: (id: string) => Promise<{ error: { message: string } | null }>;
      updateUserById: (id: string, attrs: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
  };
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: { auth_user_id?: string | null; email?: string | null } | null }>;
      };
    };
  };
};

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

type Rpc = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

function statusFor(message: string): number {
  const text = message.toLowerCase();
  if (text.includes("permission")) return 403;
  if (text.includes("already in use")) return 409;
  if (text.includes("not found")) return 404;
  return 400;
}

function payload(body: Record<string, unknown>, authUserId?: string): Record<string, unknown> {
  return {
    id: typeof body.id === "string" && body.id ? body.id : null,
    userGroupId: body.userGroupId ?? "",
    userType: body.userType ?? "",
    username: body.username ?? "",
    originId: body.originId ?? "",
    serviceCenterId: body.serviceCenterId ?? "",
    password: typeof body.password === "string" ? body.password : "",
    confirmPassword: typeof body.confirmPassword === "string" ? body.confirmPassword : "",
    customerId: body.customerId ?? "",
    staffGroup: body.staffGroup ?? "",
    companyId: body.companyId ?? "",
    birthDate: body.birthDate ?? "",
    joiningDate: body.joiningDate ?? "",
    email: body.email ?? "",
    mobile: body.mobile ?? "",
    status: body.status ?? "ACTIVE",
    applicationType: body.applicationType ?? "",
    backdatingModules: Array.isArray(body.backdatingModules) ? body.backdatingModules : [],
    applicationIds: Array.isArray(body.applicationIds) ? body.applicationIds : [],
    defaultApplicationId: body.defaultApplicationId ?? "",
    additionalEmails: body.additionalEmails ?? "",
    vendorId: body.vendorId ?? "",
    addEntryOnManifest: body.addEntryOnManifest === true,
    allowLoginWithOtp: body.allowLoginWithOtp === true,
    globalManifest: body.globalManifest === true,
    allowChangingAwbNo: body.allowChangingAwbNo === true,
    mobileAppLens: body.mobileAppLens === true,
    manifestBranch: body.manifestBranch === true,
    weightType: body.weightType ?? "KG",
    authUserId: authUserId ?? null,
  };
}

/**
 * save_user validates the password and writes the profile. It does not store
 * the password. This function hashes it through Supabase Auth.
 */
export async function saveUserAccount(args: {
  supabase: SupabaseClient;
  body: Record<string, unknown>;
}): Promise<{ id: string } | { error: string; status: number }> {
  const creating = !(typeof args.body.id === "string" && args.body.id);
  const password = typeof args.body.password === "string" ? args.body.password : "";
  const confirmPassword = typeof args.body.confirmPassword === "string" ? args.body.confirmPassword : "";
  const username = typeof args.body.username === "string" ? args.body.username : "";
  const email = typeof args.body.email === "string" ? args.body.email.trim().toLowerCase() : "";
  const policyError = userSetupPasswordError(password, confirmPassword, username, creating);
  if (policyError) return { error: policyError, status: 400 };

  const client = await admin();
  const rpc = args.supabase as unknown as Rpc;
  let createdAuthId: string | null = null;

  if (creating) {
    const created = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    createdAuthId = created.data.user?.id ?? null;
    if (created.error || !createdAuthId) {
      const message = created.error?.message?.toLowerCase() ?? "";
      if (message.includes("already")) return { error: "That email is already in use", status: 409 };
      return { error: "Could not create the account", status: 500 };
    }
  }

  const existingId = typeof args.body.id === "string" ? args.body.id : "";
  const { data: existing } = existingId
    ? await client.from("users").select("auth_user_id, email").eq("id", existingId).maybeSingle()
    : { data: null };

  const { data, error } = await rpc.rpc("save_user", {
    p_user: payload(args.body, createdAuthId ?? undefined),
  });
  if (error || typeof data !== "string") {
    if (createdAuthId) await client.auth.admin.deleteUser(createdAuthId);
    const message = error?.message || "Could not save the user";
    return { error: message, status: statusFor(message) };
  }

  const authUserId = createdAuthId ?? existing?.auth_user_id ?? null;
  if (!creating && authUserId && password) {
    const updated = await client.auth.admin.updateUserById(authUserId, { password });
    if (updated.error) return { error: "Could not set the password", status: 500 };
  }
  const previousEmail = existing?.email?.trim().toLowerCase() ?? "";
  if (!creating && authUserId && email && previousEmail !== email) {
    const renamed = await client.auth.admin.updateUserById(authUserId, { email, email_confirm: true });
    if (renamed.error) return { error: "Could not update the sign-in email", status: 500 };
  }

  return { id: data };
}
