import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { NAV_PERMISSION_BY_PATH } from "@/lib/nav-permissions";
import { catalogFromModules, grantsFor, matrixHtml, sectionOrder } from "@/routes/utility.users.access-rights";

const root = join(import.meta.dirname, "../../..");
const migration = readFileSync(
  join(root, "supabase/migrations/0133_access_rights_list_search.sql"),
  "utf8",
);
const screen = readFileSync(join(root, "src/routes/utility.users.access-rights.tsx"), "utf8");

describe("access rights list and search enforcement", () => {
  it("requires List on the read policy and keeps Search as its own gate", () => {
    expect(migration).toContain("app.apply_list_select");
    expect(migration).toContain("app.user_has_permission(tenant_id, %L, 'list')");
    expect(migration).toContain("when r.proname ~ '^(search_|lookup_)' then 'search'");
    expect(migration).toContain("else 'list'");
    expect(migration).toContain("app.lookup_permission_slug(p_key), 'search'");
    expect(migration).toContain("'unknown.lookup'");
    expect(migration).not.toContain("or app.user_has_permission(p_tenant, 'utl.serviceable-pincode', 'list')");
  });

  it("enforces Add, Modify, and Delete on invoice documents", () => {
    const writes = readFileSync(
      join(root, "supabase/migrations/0134_invoice_permission_writes.sql"),
      "utf8",
    );
    expect(writes).toContain("'doc.generate-invoice'");
    expect(writes).toContain("'add'");
    expect(writes).toContain("'modify'");
    expect(writes).toContain("'delete'");
    expect(writes).toContain("'txn.debit-note'");
    expect(writes).toContain("'txn.credit-note'");
  });

  it("lets Modify insert a grant row and audits the module plus flag changes", () => {
    expect(migration).toContain("app.user_has_permission(tenant_id, 'utl.access-rights', 'modify')");
    expect(migration).toContain("module=%s");
    expect(migration).toContain("all_access %s->%s add %s->%s modify %s->%s delete %s->%s list %s->%s search %s->%s");
  });

  it("maps the previously unmapped menu forms onto catalog slugs", () => {
    expect(NAV_PERMISSION_BY_PATH["/master/operation/pin-code"]).toBe("mst.pincode-master");
    expect(NAV_PERMISSION_BY_PATH["/utility/integration-configuration"]).toBe("utl.integration-configuration");
    expect(NAV_PERMISSION_BY_PATH["/utility/rate-zone-update/rate-update-jobs"]).toBe("utl.rate-update-jobs");
    expect(NAV_PERMISSION_BY_PATH["/utility/rate-zone-update/zone-update-jobs"]).toBe("utl.zone-update-jobs");
    expect(NAV_PERMISSION_BY_PATH["/documents/invoice-generation"]).toBe("doc.generate-invoice");
    expect(NAV_PERMISSION_BY_PATH["/documents/invoice-print"]).toBe("doc.print-invoice");
    expect(NAV_PERMISSION_BY_PATH["/documents/invoice-finalise"]).toBe("doc.invoice-finalise");
    expect(migration).toContain("'utl.integration-configuration'");
    expect(migration).toContain("'utl.rate-update-jobs'");
    expect(migration).toContain("'utl.zone-update-jobs'");
    expect(migration).toContain("name = 'Pin Code'");
    expect(migration).toContain("name = 'Invoice Generation'");
    expect(migration).toContain("name = 'Invoice Print'");
  });

  it("builds the grid from catalog rows and keeps the eight sections", () => {
    expect(sectionOrder).toEqual([
      "Masters",
      "Transaction",
      "Documents",
      "Reports",
      "Utilities",
      "Manager Notification",
      "CRM",
      "Mobile Application",
    ]);
    const catalog = catalogFromModules([
      {
        id: "mod-1",
        slug: "mst.customer-master",
        section: "MASTERS",
        name: "Customer Master",
        under_menu: "Masters",
        sort_order: 1,
      },
      {
        id: "mod-2",
        slug: "utl.rate-update-jobs",
        section: "UTILITIES",
        name: "Rate Update Jobs",
        under_menu: "Rate / Zone Update",
        sort_order: 2,
      },
    ]);
    expect(catalog.Masters.map((item) => item.slug)).toEqual(["mst.customer-master"]);
    expect(catalog.Utilities.map((item) => item.slug)).toEqual(["utl.rate-update-jobs"]);
    expect(catalog["Manager Notification"]).toEqual([]);
    expect(catalog.CRM).toEqual([]);
    const grants = grantsFor(catalog.Masters, { "mst.customer-master-list": true });
    expect(grants).toEqual([
      {
        module_id: "mod-1",
        all_access: false,
        can_add: false,
        can_modify: false,
        can_delete: false,
        can_list: true,
        can_search: false,
      },
    ]);
  });

  it("prints the six-column matrix and does not pretend a signed-out user has access", () => {
    expect(screen).not.toContain("Print queued");
    expect(screen).toContain("Un Check All");
    expect(screen).toContain("Signed-out preview is read-only");
    expect(screen).toContain("listPermissionModules");
    const html = matrixHtml(
      "Operations",
      catalogFromModules([
        {
          id: "mod-1",
          slug: "doc.generate-invoice",
          section: "DOCUMENTS",
          name: "Invoice Generation",
          under_menu: "Documents",
          sort_order: 1,
        },
      ]),
      { "doc.generate-invoice-list": true },
      false,
    );
    expect(html).toContain("Invoice Generation");
    expect(html).toContain("All Access");
    expect(html).toContain("Search");
    expect(html).toContain("<td>Yes</td>");
    expect(matrixHtml("Preview", catalogFromModules([]), {}, true)).toContain("No access is granted");
  });
});
