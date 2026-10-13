import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { NAV_PERMISSION_BY_PATH } from "@/lib/nav-permissions";

const root = join(import.meta.dirname, "../../../..");
const migration = readFileSync(join(root, "supabase/migrations/0136_area_master.sql"), "utf8");
const screen = readFileSync(join(root, "src/routes/master.operation.area.tsx"), "utf8");

describe("area master enforcement", () => {
  it("requires List on areas and keeps the form in the permission catalog", () => {
    expect(NAV_PERMISSION_BY_PATH["/master/operation/area"]).toBe("mst.area-master");
    expect(migration).toContain("app.apply_list_select('areas', 'mst.area-master')");
    expect(migration).toContain("lookup_permission_slug");
    expect(migration).toContain("area-service-center");
    expect(screen).toContain("enabled: canList");
    expect(migration).toContain("public.list_areas");
    expect(screen).toContain('supabase.rpc("list_areas")');
    expect(screen).toContain("authed && !canSearch");
    expect(screen).toContain('lookupKey="area-service-center"');
  });

  it("derives destination, keeps branch-scoped case-insensitive names, and names delete references", () => {
    expect(migration).toContain("areas_tenant_branch_name_ci_uq");
    expect(migration).toContain("lower(name)");
    expect(migration).toContain("app.resolve_area_placement");
    expect(migration).toContain("delivery run sheet(s)");
    expect(migration).toContain("pickup(s)");
    expect(migration).toContain('Area name "%" already exists');
    expect(migration).toContain("app.insert_area_for_import");
    expect(screen).toContain("readOnly");
  });

  it("keeps the signed-out screen read-only", () => {
    expect(screen).toContain("Signed-out preview is read-only");
    expect(screen).toContain("const canAdd = authed && rc.perms.canAdd");
    expect(screen).not.toContain("setDemoRows");
  });
});
