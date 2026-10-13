import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { NAV_PERMISSION_BY_PATH } from "@/lib/nav-permissions";

const root = join(import.meta.dirname, "../../../..");
const migration = readFileSync(join(root, "supabase/migrations/0135_airline_master.sql"), "utf8");
const screen = readFileSync(join(root, "src/routes/master.operation.airline.tsx"), "utf8");

describe("airline master enforcement", () => {
  it("requires List on airlines and keeps the form in the permission catalog", () => {
    expect(NAV_PERMISSION_BY_PATH["/master/operation/airline"]).toBe("mst.airlines");
    expect(migration).toContain("app.apply_list_select('airlines', 'mst.airlines')");
    expect(migration).toContain("lookup_permission_slug");
    expect(screen).toContain("enabled: canList");
    expect(migration).toContain("public.list_airlines");
    expect(screen).toContain('supabase.rpc("list_airlines")');
    expect(screen).toContain("authed && !canSearch");
  });

  it("blocks a referenced delete and rejects a case-variant duplicate", () => {
    expect(migration).toContain("airlines_tenant_name_ci_uq");
    expect(migration).toContain("lower(name)");
    expect(migration).toContain("bagging record(s)");
    expect(migration).toContain("airway bill(s)");
    expect(migration).toContain('Airline name "%s" already exists');
    expect(migration).toContain("app.insert_airline_for_import");
  });

  it("keeps the signed-out screen read-only", () => {
    expect(screen).toContain("Signed-out preview is read-only");
    expect(screen).toContain("const canAdd = authed && rc.perms.canAdd");
    expect(screen).not.toContain("setDemoRows");
  });
});
