import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveBaggingLineWeight } from "./bagging-rules";

const root = join(import.meta.dirname, "../../../..");
const sql = readFileSync(join(root, "supabase/migrations/0120_bagging_integrity.sql"), "utf8");
const page = readFileSync(join(root, "src/routes/transaction.bagging.tsx"), "utf8");

describe("bagging integrity migration", () => {
  it("requires txn.bagging on every bagging RPC", () => {
    for (const name of [
      "lookup_shipment_for_bagging",
      "record_bagging",
      "list_baggings",
      "get_bagging_details",
      "delete_bagging",
      "record_bagging_progress",
    ]) {
      expect(sql, name).toContain(name);
    }
    expect(sql).toContain("app.user_has_permission(v_tenant, 'txn.bagging', 'add')");
    expect(sql).toContain("app.user_has_permission(v_tenant, 'txn.bagging', 'modify')");
    expect(sql).toContain("app.user_has_permission(v_tenant, 'txn.bagging', 'delete')");
    expect(sql).toContain("app.user_has_permission(v_tenant, 'txn.bagging', 'list')");
    expect(sql).toContain("app.user_has_permission(v_tenant, 'txn.bagging', 'search')");
  });

  it("rejects an invented weight, unknown AWBs, and a random manifest number", () => {
    expect(sql).toContain("AWB % is not in shipments");
    expect(sql).toContain("Weight 10.000 is not allowed unless the shipment weight is 10");
    expect(sql).toContain("Could not allocate a bagging manifest number");
    expect(sql).not.toContain("random()");
    expect(sql).toContain("row_version = v_expected");
    expect(sql).toContain("bagging_awb_lines_live_awb_uq");
    expect(sql).toContain("deleted_at = now()");
    expect(sql).not.toMatch(/delete\s+from\s+public\.bagging_awb_lines/i);
  });

  it("searches bag and AWB and filters product, dates, and status", () => {
    expect(sql).toContain("bal.bag_no ilike v_pat");
    expect(sql).toContain("bal.awb_no ilike v_pat");
    expect(sql).toContain("p_from_date");
    expect(sql).toContain("p_to_date");
    expect(sql).toContain("p_status");
    expect(sql).toContain("upper(pr.code) = upper(btrim(p_product_code))");
    expect(sql).toContain("least(greatest(coalesce(p_limit, 50), 1), 500)");
  });

  it("pages the list, records reversals, and exposes history", () => {
    const ops = readFileSync(join(root, "supabase/migrations/0122_bagging_operations.sql"), "utf8");
    expect(ops).toContain("public.count_baggings");
    expect(ops).toContain("public.list_bagging_events");
    expect(ops).toContain("service_center");
    expect(ops).toContain("BAGGING_PROGRESS_REVERSED");
    expect(ops).not.toMatch(/delete\s+from\s+public\.bagging_events/i);
    expect(page).toContain("offset: (page - 1) * PAGE_SIZE");
    expect(page).toContain("countBaggings");
    expect(page).toContain("listBaggingEvents");
  });

  it("looks up the live shipment forwarding column", () => {
    const lookup = readFileSync(join(root, "supabase/migrations/0121_bagging_lookup_columns.sql"), "utf8");
    expect(lookup).toContain("s.forwarding_awb");
    expect(lookup).not.toContain("s.forwarding_no");
    expect(lookup).not.toContain("shipper_id");
    expect(lookup).toContain("app.user_has_permission(v_tenant, 'txn.bagging', 'list')");
  });
});

describe("bagging page gates", () => {
  it("does not invent a 10.000 weight or offer stub exports", () => {
    expect(page).not.toContain('"10.000"');
    expect(page).not.toContain("Export to CSB");
    expect(page).not.toContain("Download Tiff");
    expect(page).not.toContain("Format 1");
    expect(page).toContain('hasPermission("txn.bagging"');
    expect(page).toContain("resolveBaggingLineWeight");
  });
});

describe("resolveBaggingLineWeight", () => {
  it("uses the shipment weight when the operator leaves weight blank", () => {
    expect(resolveBaggingLineWeight("", "2.500")).toEqual({ ok: true, weight: "2.500" });
  });

  it("rejects the invented 10.000 default when the shipment is not 10", () => {
    const result = resolveBaggingLineWeight("10.000", "2.500");
    expect(result.ok).toBe(false);
  });

  it("allows 10 when the shipment weight is 10", () => {
    expect(resolveBaggingLineWeight("10.000", "10.000")).toEqual({ ok: true, weight: "10.000" });
  });

  it("rejects an AWB that has no shipment weight", () => {
    expect(resolveBaggingLineWeight("", null).ok).toBe(false);
    expect(resolveBaggingLineWeight("1.200", "").ok).toBe(false);
  });
});
