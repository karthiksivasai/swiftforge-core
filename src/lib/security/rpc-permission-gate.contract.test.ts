import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../../..");
const migrationsDir = join(root, "supabase/migrations");
const sqlTest = readFileSync(join(root, "supabase/tests/0125_rpc_permission_gates.sql"), "utf8");

const permRe =
  /user_has_permission|user_setup_can|user_setup_require_view|has_permission\(|assert_[a-z0-9_]*permission/i;

/**
 * Client-callable functions that stay tenant-scoped on purpose.
 * A new public SECURITY DEFINER RPC is not allowed to join this list by
 * accident: the test fails unless the name is both ungated and listed here.
 */
const allowlist: Record<string, string> = {
  apply_vendor_shipping_result: "slug is ambiguous between AWB entry and vendor booking",
  get_messaging_provider_status: "slug is ambiguous between notification setup and messaging",
  get_party_contact: "slug depends on the shipper/consignee argument",
  get_vendor_carrier_config: "slug is ambiguous between vendor master and AWB entry",
  get_vendor_shipping_context: "slug is ambiguous between vendor booking and AWB entry",
  list_report_jobs: "report slug depends on the report key",
  list_shipment_vendor_activity: "slug is ambiguous between vendor booking and AWB entry",
  list_shipment_vendor_documents: "slug is ambiguous between vendor booking and AWB entry",
  list_vendor_services: "slug is ambiguous between vendor master and service mapping",
  lookup: "slug depends on the lookup key",
  me: "session identity",
  me_navigation: "session identity",
  me_permissions: "session identity",
  my_session_is_active: "session identity",
  public_track_shipment: "anonymous tracking, no group",
  record_login: "session identity",
  record_logout: "session identity",
  remember_party_contact: "slug depends on the shipper/consignee argument",
  search_party_contacts: "slug depends on the shipper/consignee argument",
  search_postal_pincodes: "shared address lookup with no single module",
  set_vendor_api_status: "slug is ambiguous between vendor booking and AWB entry",
  test_email_configuration: "delegates to send_email, which checks utl.notification",
};

const gated: Array<{ name: string; slug: string; actions: string[] }> = [
  { name: "get_drs_completion_board", slug: "txn.drs-scan", actions: ["list", "search"] },
  { name: "get_inscan_reconciliation", slug: "txn.pickup-insacn", actions: ["list", "search"] },
  { name: "record_pickup_inscan", slug: "txn.pickup-insacn", actions: ["add"] },
  { name: "get_manifest_inscan_board", slug: "txn.manifest-in-scan", actions: ["list", "search"] },
  { name: "record_undelivery_scan", slug: "txn.un-delivery-scan", actions: ["add"] },
  { name: "get_pod_by_awb", slug: "txn.pod-entry-ok-update", actions: ["list", "search"] },
  { name: "validate_shipment_booking", slug: "txn.awb-entry", actions: ["list", "search"] },
  { name: "get_awb_entry_draft", slug: "txn.awb-entry", actions: ["list", "search"] },
  { name: "upsert_awb_entry_draft", slug: "txn.awb-entry", actions: ["add", "modify"] },
  { name: "clear_awb_entry_draft", slug: "txn.awb-entry", actions: ["delete"] },
  { name: "get_branch_awb_stock_summary", slug: "txn.awb-entry", actions: ["list", "search"] },
  { name: "validate_manual_awb", slug: "txn.awb-entry", actions: ["list", "search"] },
  { name: "lookup_international_destinations", slug: "mst.destination-master", actions: ["list", "search"] },
  { name: "list_shipment_documents", slug: "txn.awb-entry", actions: ["list", "search"] },
  { name: "get_shipment_document", slug: "txn.awb-entry", actions: ["list", "search"] },
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

function latestPublicDefiners(): Map<string, string> {
  const fnRe = /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)/gi;
  const latest = new Map<string, string>();
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    const text = readFileSync(join(migrationsDir, file), "utf8");
    const matches = [...text.matchAll(fnRe)];
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index ?? 0;
      const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
      const chunk = text.slice(start, end);
      if (!/security\s+definer/i.test(chunk.slice(0, 9000))) continue;
      latest.set(matches[i][1].toLowerCase(), chunk);
    }
  }
  return latest;
}

function clientCallableNames(definers: Map<string, string>): Set<string> {
  const granted = new Set<string>();
  const grantStmt = /grant\s+execute\s+on\s+function\b[^;]*;/gi;
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"))) {
    const text = readFileSync(join(migrationsDir, file), "utf8");
    for (const stmt of text.matchAll(grantStmt)) {
      if (!/\bto\s+(?:authenticated|anon|public)\b/i.test(stmt[0])) continue;
      for (const name of stmt[0].matchAll(/public\.(\w+)/gi)) granted.add(name[1].toLowerCase());
    }
  }
  const called = new Set<string>();
  const rpcRe = /\.rpc\(\s*["']([a-z0-9_]+)["']/gi;
  for (const file of walk(join(root, "src"))) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(rpcRe)) called.add(match[1].toLowerCase());
  }
  const names = new Set<string>();
  for (const name of definers.keys()) {
    if (granted.has(name) || called.has(name)) names.add(name);
  }
  return names;
}

describe("client RPC permission gates", () => {
  const definers = latestPublicDefiners();
  const callable = clientCallableNames(definers);
  const ungated = [...callable]
    .filter((name) => !permRe.test(definers.get(name) ?? ""))
    .sort();

  it("fails when a client-callable function only checks the tenant", () => {
    expect(ungated).toEqual(Object.keys(allowlist).sort());
  });

  it("gates each confirmed function on its catalog slug and action", () => {
    const migration = readFileSync(join(migrationsDir, "0125_rpc_permission_gates.sql"), "utf8");
    for (const gate of gated) {
      const body = definers.get(gate.name) ?? "";
      expect(body, gate.name).toMatch(/security\s+definer/i);
      expect(permRe.test(body), gate.name).toBe(true);
      for (const action of gate.actions) {
        expect(body, `${gate.name} ${action}`).toContain(
          `app.user_has_permission(${gate.name === "lookup_international_destinations" ? "app.current_tenant_id()" : "v_tenant"}, '${gate.slug}', '${action}')`,
        );
      }
      expect(body, gate.name).toContain("using errcode = '42501'");
      expect(body, gate.name).toContain("permission is required");
      expect(migration, gate.name).toContain(`function public.${gate.name}`);
    }
  });

  it("calls each gated function without the grant, with it, and as a tenant admin", () => {
    const deny = sqlTest.split("\n  -- DENY\n")[1]?.split("\n  -- ALLOW\n")[0] ?? "";
    const allow = sqlTest.split("\n  -- ALLOW\n")[1]?.split("\n  -- ADMIN\n")[0] ?? "";
    const admin = sqlTest.split("\n  -- ADMIN\n")[1] ?? "";
    expect(deny).toContain("permission is required");
    expect(sqlTest).toContain("rollback");
    for (const gate of gated) {
      expect(deny, `${gate.name} deny`).toContain(`public.${gate.name}`);
      expect(allow, `${gate.name} allow`).toContain(`public.${gate.name}`);
      expect(admin, `${gate.name} admin`).toContain(`public.${gate.name}`);
    }
  });
});
