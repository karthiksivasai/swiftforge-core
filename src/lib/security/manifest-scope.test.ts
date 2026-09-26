import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { manifestAssignedBranchIds, manifestBranchVisible, type ManifestScopeUser } from "./manifest-scope";

const branches = ["hub", "branch-a", "branch-b", "branch-c"];

function user(partial: Partial<ManifestScopeUser> & Pick<ManifestScopeUser, "subtype">): ManifestScopeUser {
  return {
    isAdmin: false,
    homeBranchId: null,
    explicitBranchIds: [],
    hubMappedBranchIds: [],
    crossBranch: false,
    ...partial,
  };
}

describe("manifest branch scope", () => {
  it("limits a branch user to the home branch", () => {
    const branch = user({ subtype: "BRANCH", homeBranchId: "branch-a", explicitBranchIds: ["branch-b"] });
    expect(manifestAssignedBranchIds(branch, branches)).toEqual(["branch-a"]);
    expect(manifestBranchVisible({
      user: branch,
      allBranchIds: branches,
      ownerBranchId: "branch-b",
      destinationBranchId: null,
      handover: false,
    })).toBe(false);
  });

  it("lets a hub user see the hub and explicitly mapped branches", () => {
    const hub = user({
      subtype: "HUB",
      homeBranchId: "hub",
      hubMappedBranchIds: ["branch-a"],
      explicitBranchIds: ["branch-b"],
    });
    expect(manifestAssignedBranchIds(hub, branches)).toEqual(["hub", "branch-a", "branch-b"]);
    expect(manifestBranchVisible({
      user: hub,
      allBranchIds: branches,
      ownerBranchId: "branch-c",
      destinationBranchId: null,
      handover: false,
    })).toBe(false);
  });

  it("gives admins the tenant and other roles only explicit branches", () => {
    expect(manifestAssignedBranchIds(user({ subtype: "OTHER", isAdmin: true }), branches)).toEqual(branches);
    const other = user({ subtype: "OTHER", homeBranchId: "branch-a", explicitBranchIds: ["branch-c"] });
    expect(manifestAssignedBranchIds(other, branches)).toEqual(["branch-a", "branch-c"]);
  });

  it("allows cross-branch rows only for a handover or the explicit permission", () => {
    const branch = user({ subtype: "BRANCH", homeBranchId: "branch-a" });
    expect(manifestBranchVisible({
      user: branch,
      allBranchIds: branches,
      ownerBranchId: "branch-b",
      destinationBranchId: "branch-a",
      handover: true,
    })).toBe(true);
    expect(manifestBranchVisible({
      user: branch,
      allBranchIds: branches,
      ownerBranchId: "branch-b",
      destinationBranchId: "branch-a",
      handover: false,
    })).toBe(false);
    const permitted = user({ subtype: "BRANCH", homeBranchId: "branch-a", crossBranch: true });
    expect(manifestBranchVisible({
      user: permitted,
      allBranchIds: branches,
      ownerBranchId: "branch-c",
      destinationBranchId: null,
      handover: false,
    })).toBe(true);
  });
});

describe("manifest scope migration", () => {
  const sql = readFileSync(join(import.meta.dirname, "../../../supabase/migrations/0119_manifest_branch_scope.sql"), "utf8");

  it("enforces scope in policies, bagging, transfer, and audit without granting data permissions from the scan flag", () => {
    expect(sql).toContain("allow_mobile_scanning");
    expect(sql).toContain("Does not grant shipment, bagging, manifest, or status-update permissions");
    expect(sql).toContain("txn.manifest-cross-branch");
    expect(sql).toContain("hub_branch_links");
    expect(sql).toContain("CROSS_BRANCH_VIEW");
    expect(sql).toContain("MANIFEST_CREATED");
    expect(sql).toContain("list_baggings");
    expect(sql).toContain("manifest_scan_events_select");
    expect(sql).toContain("bagging_manifests_select");
    expect(sql).not.toContain("user_allows_mobile_scanning() then true");
    expect(sql).toContain("Bagging permission is required");
    expect(sql).toContain("Manifest permission is required");
  });
});
