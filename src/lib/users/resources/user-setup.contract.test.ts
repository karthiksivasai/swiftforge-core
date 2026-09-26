import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { userSetupPasswordError } from "./user-setup-rules";

const root = join(import.meta.dirname, "../../../..");

describe("user setup password rules", () => {
  it("rejects each of the four rules and a mismatched confirmation", () => {
    expect(userSetupPasswordError("longpassword1", "longpassword1", "ada", true)).toBe(
      "Password must contain one special character.",
    );
    expect(userSetupPasswordError("longpassword!", "longpassword!", "ada", true)).toBe(
      "Password must contain one numeric character.",
    );
    expect(userSetupPasswordError("short1!", "short1!", "ada", true)).toBe(
      "Password length should be greater or equal to 8 characters.",
    );
    expect(userSetupPasswordError("Ada-user1", "Ada-user1", "Ada-user1", true)).toBe(
      "UserName and Password cannot be same.",
    );
    expect(userSetupPasswordError("Courier-19", "other", "ada", true)).toBe("Confirm Password must equal Password");
    expect(userSetupPasswordError("", "", "ada", false)).toBeNull();
    expect(userSetupPasswordError("Courier-19", "Courier-19", "ada", true)).toBeNull();
  });
});

describe("user setup migration", () => {
  const sql = readFileSync(join(root, "supabase/migrations/0123_user_setup_screen.sql"), "utf8");

  it("gates every user RPC on utility.user_setup and does not store the password", () => {
    expect(sql).toContain("utility.user_setup");
    expect(sql).toContain("app.user_has_permission(p_tenant, 'utility.user_setup', p_action)");
    expect(sql).toContain("Password must contain one special character.");
    expect(sql).toContain("Password must contain one numeric character.");
    expect(sql).toContain("Password length should be greater or equal to 8 characters.");
    expect(sql).toContain("UserName and Password cannot be same.");
    expect(sql).toContain("using errcode = '42501'");
    expect(sql).toContain("p_offset");
    expect(sql).not.toContain(".limit(100)");
    expect(sql).toContain("revoke all on function public.list_users(text, integer, integer) from public");
    expect(sql).toContain("grant execute on function public.save_user(jsonb) to authenticated, service_role");
    expect(sql).toContain("never");
    expect(sql).not.toContain("insert into public.users (\n      tenant_id, auth_user_id, username, user_type, password");
    expect(sql).toContain("tenant_id");
    expect(sql).not.toContain("drop table public.users");
  });
});

describe("user setup directory", () => {
  const sql = readFileSync(join(root, "supabase/migrations/0124_user_setup_directory.sql"), "utf8");

  it("keeps the list tenant-scoped and permission-gated", () => {
    expect(sql).toContain("app.user_setup_require_view");
    expect(sql).toContain("p_offset");
    expect(sql).toContain("group_name");
    expect(sql).toContain("company_code");
    expect(sql).not.toContain(".limit(100)");
    expect(sql).not.toContain("password");
    expect(sql).toContain("revoke all on function public.list_users(text, integer, integer, jsonb) from public");
    expect(sql).toContain("grant execute on function public.user_setup_summary() to authenticated, service_role");
  });
});
