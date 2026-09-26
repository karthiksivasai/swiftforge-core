import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../../..");

describe("user lifecycle migration", () => {
  const sql = readFileSync(join(root, "supabase/migrations/0118_user_lifecycle.sql"), "utf8");

  it("adds email identity, subtype, and stored-only lens fields without dropping users", () => {
    expect(sql).toContain("users_email_normalized_uq");
    expect(sql).toContain("users_tenant_email_uq");
    expect(sql).toContain("user_subtype");
    expect(sql).toContain("mobile_app_lens");
    expect(sql).toContain("manifest_branch");
    expect(sql).toContain("email_verified_at");
    expect(sql).not.toContain("drop table public.users");
    expect(sql).toContain("Rollback");
  });
});

describe("user setup screen", () => {
  const source = readFileSync(join(root, "src/routes/utility.users.user-setup.tsx"), "utf8");
  const resource = readFileSync(join(root, "src/lib/users/resources/user-setup.ts"), "utf8");

  it("persists through the users API and does not keep a local seed", () => {
    expect(resource).toContain("/api/users");
    expect(source).toContain("saveUser");
    expect(source).not.toContain("rowsSeed");
    expect(source).toContain("utl.user-setup");
    expect(source).toContain("utility.user_setup");
    expect(source).toContain("Mobile App Lens");
    expect(source).not.toContain("Mobile app lens");
  });
});
