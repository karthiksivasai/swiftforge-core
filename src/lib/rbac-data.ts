/**
 * Phase 2 RBAC data-access layer (browser, RLS-scoped anon client).
 *
 * Every call runs through the authenticated user's JWT, so Row Level Security
 * and the permission-gated policies in migrations 0009/0011 are the real
 * boundary. These helpers just shape the queries the User Setup, Access Rights,
 * and Logged-in Users screens need.
 */
import { supabase } from "@/integrations/supabase/client";

export type SessionRow = {
  id: string;
  app: string;
  ip_address: string | null;
  created_at: string;
  user_id: string;
  username: string;
  user_type: string;
};

export type UserRow = {
  id: string;
  username: string;
  full_name: string | null;
  user_type: string;
  status: string;
  home_branch_id: string | null;
  application_type: string;
};

export type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  status: string;
};

export type PermissionModuleRow = {
  id: string;
  slug: string;
  section: string;
  name: string;
  under_menu: string | null;
  sort_order: number;
};

export type GroupPermissionRow = {
  module_id: string;
  all_access: boolean;
  can_add: boolean;
  can_modify: boolean;
  can_delete: boolean;
  can_list: boolean;
  can_search: boolean;
};

export async function listActiveSessions(): Promise<SessionRow[]> {
  const { data, error } = await supabase
    .from("sessions")
    .select("id, app, ip_address, created_at, user_id, users(username, user_type)")
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  type Raw = {
    id: string;
    app: string;
    ip_address: string | null;
    created_at: string;
    user_id: string;
    users:
      { username: string; user_type: string } | { username: string; user_type: string }[] | null;
  };
  return (data as Raw[]).map((r) => {
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    return {
      id: r.id,
      app: r.app,
      ip_address: r.ip_address,
      created_at: r.created_at,
      user_id: r.user_id,
      username: u?.username ?? "—",
      user_type: u?.user_type ?? "—",
    };
  });
}

export async function forceLogoff(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc("revoke_session", { p_session_id: sessionId });
  if (error) throw error;
}

export async function listUsers(): Promise<UserRow[]> {
  const { data, error } = await supabase
    .from("users")
    .select("id, username, full_name, user_type, status, home_branch_id, application_type")
    .is("deleted_at", null)
    .order("username");
  if (error) throw error;
  return data as UserRow[];
}

export async function listGroups(): Promise<GroupRow[]> {
  const { data, error } = await supabase
    .from("user_groups")
    .select("id, name, description, is_system, status")
    .is("deleted_at", null)
    .order("name");
  if (error) throw error;
  return data as GroupRow[];
}

export async function listPermissionModules(): Promise<PermissionModuleRow[]> {
  const { data, error } = await supabase
    .from("permission_modules")
    .select("id, slug, section, name, under_menu, sort_order")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return data as PermissionModuleRow[];
}

export async function getGroupPermissions(groupId: string): Promise<GroupPermissionRow[]> {
  const { data, error } = await supabase
    .from("group_permissions")
    .select("module_id, all_access, can_add, can_modify, can_delete, can_list, can_search")
    .eq("group_id", groupId);
  if (error) throw error;
  return data as GroupPermissionRow[];
}

export type SaveGrant = GroupPermissionRow;

export async function saveGroupPermissions(
  tenantId: string,
  groupId: string,
  grants: SaveGrant[],
): Promise<void> {
  const rows = grants.map((g) => ({ ...g, tenant_id: tenantId, group_id: groupId }));
  const { error } = await supabase
    .from("group_permissions")
    .upsert(rows, { onConflict: "group_id,module_id" });
  if (error) throw error;
}

export async function createGroup(tenantId: string, name: string): Promise<void> {
  const { error } = await supabase.from("user_groups").insert({ tenant_id: tenantId, name });
  if (error) throw error;
}
