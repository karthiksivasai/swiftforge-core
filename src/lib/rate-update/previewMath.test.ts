import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { canOpenPath } from "@/lib/nav-permissions";
import {
  customerTotal,
  freightAmount,
  fuelAmount,
  grandDifference,
  quoteRateUpdate,
  rateUpdateScopeBlocked,
  skipReason,
  taxAmount,
  updateTypeEffects,
} from "@/lib/rate-update/previewMath";

const migration = readFileSync(
  join(import.meta.dirname, "../../../supabase/migrations/0151_safe_rate_update.sql"),
  "utf8",
);

const base = {
  updateType: "AWB_RATE" as const,
  oldFreight: 100,
  oldFuel: 10,
  oldTax: 19.8,
  manualTotal: 25,
  otherTotal: 0,
  oldVendor: 80,
  weight: 2.3,
  minWeight: 0.5,
  ratePerKg: 100 as number | null,
  fuelPct: 10,
  taxPct: 18,
  newVendor: 90 as number | null,
  oldZone: "7",
  newZone: "8",
  skip: null,
};

describe("rate update preview math", () => {
  it("prices freight from the greater of weight and minimum", () => {
    expect(freightAmount(0.5, 0.5, 100)).toBe(50);
    expect(freightAmount(2.3, 0.5, 100)).toBe(230);
    expect(freightAmount(12, 0.5, 40)).toBe(480);
    expect(freightAmount(0.4, 0.5, 100)).toBe(50);
    expect(fuelAmount(230, 10)).toBe(23);
    expect(taxAmount(253, 18)).toBe(45.54);
  });

  it("keeps manual lines in the customer total", () => {
    const quoted = quoteRateUpdate(base);
    const freight = freightAmount(2.3, 0.5, 100);
    const fuel = fuelAmount(freight, 10);
    const tax = taxAmount(freight + fuel, 18);
    expect(quoted.newFreight).toBe(freight);
    expect(quoted.newFuel).toBe(fuel);
    expect(quoted.newTax).toBe(tax);
    expect(quoted.newTotal).toBe(customerTotal(freight, fuel, tax, 25, 0));
    expect(quoted.oldTotal).toBe(customerTotal(100, 10, 19.8, 25, 0));
    expect(quoted.difference).toBe(quoted.newTotal - quoted.oldTotal);
    expect(quoted.newVendor).toBe(80);
    expect(quoted.newZone).toBe("8");
    expect(updateTypeEffects("AWB_RATE").manualLines).toBe(false);
    expect(updateTypeEffects("AWB_RATE").vendorCost).toBe(false);
  });

  it("keeps the booked freight when there is no rate card", () => {
    const quoted = quoteRateUpdate({ ...base, ratePerKg: null, newZone: "7" });
    expect(quoted.newFreight).toBe(100);
    expect(quoted.newFuel).toBe(10);
    expect(quoted.newTax).toBe(19.8);
    expect(quoted.changed).toBe(false);

    const fuelChange = quoteRateUpdate({ ...base, ratePerKg: null, newZone: "7", fuelPct: 20 });
    expect(fuelChange.newFreight).toBe(100);
    expect(fuelChange.newFuel).toBe(20);
    expect(fuelChange.changed).toBe(true);
  });

  it("changes only vendor cost for Vendor Rate", () => {
    const quoted = quoteRateUpdate({ ...base, updateType: "VENDOR_RATE" });
    expect(quoted.newFreight).toBe(100);
    expect(quoted.newFuel).toBe(10);
    expect(quoted.newTax).toBe(19.8);
    expect(quoted.newZone).toBe("7");
    expect(quoted.oldTotal).toBe(80);
    expect(quoted.newTotal).toBe(90);
    expect(quoted.difference).toBe(10);
    expect(updateTypeEffects("VENDOR_RATE")).toEqual({
      customerFreight: false,
      fuelAndTax: false,
      vendorCost: true,
      zone: false,
      manualLines: false,
    });
  });

  it("keeps vendor cost when Vendor Rate has no contract", () => {
    const quoted = quoteRateUpdate({ ...base, updateType: "VENDOR_RATE", newVendor: null });
    expect(quoted.newVendor).toBe(80);
    expect(quoted.difference).toBe(0);
    expect(quoted.changed).toBe(false);
  });

  it("changes only fuel and tax for Tax & Fuel", () => {
    const quoted = quoteRateUpdate({ ...base, updateType: "TAX_FUEL", fuelPct: 20, taxPct: 18 });
    expect(quoted.newFreight).toBe(100);
    expect(quoted.newFuel).toBe(20);
    expect(quoted.newTax).toBe(taxAmount(120, 18));
    expect(quoted.newVendor).toBe(80);
    expect(quoted.newZone).toBe("7");
    expect(updateTypeEffects("TAX_FUEL").customerFreight).toBe(false);
    expect(updateTypeEffects("TAX_FUEL").zone).toBe(false);
  });

  it("skips locked, invoiced, and cancelled AWBs and does not count them", () => {
    expect(skipReason({ isLocked: true, invoiceId: null, status: "BOOKED" })).toBe("locked");
    expect(skipReason({ isLocked: false, invoiceId: "inv", status: "BOOKED" })).toBe("invoiced");
    expect(skipReason({ isLocked: false, invoiceId: null, status: "CANCELLED" })).toBe("cancelled");
    expect(skipReason({ isLocked: false, invoiceId: null, status: "VOID" })).toBe("cancelled");
    expect(skipReason({ isLocked: false, invoiceId: null, status: "BOOKED" })).toBeNull();

    const locked = quoteRateUpdate({ ...base, skip: "locked" });
    expect(locked.newFreight).toBe(locked.oldFreight);
    expect(locked.difference).toBe(0);
    expect(locked.changed).toBe(false);
    expect(locked.newZone).toBe("7");

    expect(
      grandDifference([
        { difference: 10, skip: null },
        { difference: 99, skip: "locked" },
        { difference: 5, skip: null },
        { difference: 40, skip: "invoiced" },
      ]),
    ).toBe(15);
  });

  it("blocks a blank customer, vendor, and destination unless the user confirms the range", () => {
    expect(
      rateUpdateScopeBlocked({ customer: "", vendor: " ", destination: "", confirmAll: false }),
    ).toBe(true);
    expect(
      rateUpdateScopeBlocked({ customer: "", vendor: "", destination: "", confirmAll: true }),
    ).toBe(false);
    expect(
      rateUpdateScopeBlocked({ customer: "ACME", vendor: "", destination: "", confirmAll: false }),
    ).toBe(false);
  });

  it("adds every row into the grand total, including past the old 5000 cap", () => {
    const rows = Array.from({ length: 5001 }, () => ({ difference: 1, skip: null }));
    expect(grandDifference(rows)).toBe(5001);
  });
});

describe("safe rate update migration", () => {
  it("previews first, requires modify, and does not delete charge lines", () => {
    expect(migration).toContain("preview_rate_update");
    expect(migration).toContain("apply_rate_update");
    expect(migration).toContain("utl.rate-update', 'modify'");
    expect(migration).toContain("'locked'");
    expect(migration).toContain("'invoiced'");
    expect(migration).toContain("'cancelled'");
    expect(migration).toContain("confirm_all");
    expect(migration).toContain("charges_type = 'MANUAL'");
    expect(migration).not.toContain("limit 5000");
    expect(migration.toLowerCase()).not.toContain("delete from public.shipment_charge_snapshots");
    expect(migration).toContain("Rate update jobs are retired");
    expect(migration).toContain("Zone update jobs are retired");
    expect(migration).toContain("utl.rate-update-jobs");
    expect(migration).toContain("is_active = false");
  });

  it("opens Rate Update only with modify, and the job screens are unmapped", () => {
    const can = (slug: string, action: string) => slug === "utl.rate-update" && action === "list";
    expect(
      canOpenPath("/utility/rate-zone-update/rate-update", can, false),
    ).toBe(false);
    const modify = (slug: string, action: string) =>
      slug === "utl.rate-update" && action === "modify";
    expect(canOpenPath("/utility/rate-zone-update/rate-update", modify, false)).toBe(true);
    expect(canOpenPath("/utility/rate-zone-update/rate-update-jobs", modify, false)).toBe(false);
  });
});
