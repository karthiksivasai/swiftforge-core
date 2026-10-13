import { describe, expect, it } from "vitest";

import {
  awbGstPercent,
  awbIntraState,
  balanceDue,
  formatChargeWeight,
  fuelPercentFor,
  hsnIsValid,
  manualChargeAmounts,
  resolveDivision,
} from "@/lib/transactions/awbEntryRules";

describe("AWB entry rules", () => {
  it("uses the customer cm divisor for a matching product and falls back to 5000", () => {
    expect(
      resolveDivision({
        measurementUnit: "Centimeter",
        productCode: "AIR",
        rows: [{ product: "AIR", cm_divisor: 6000, inch_divisor: 166 }],
      }),
    ).toBe("6000");
    expect(resolveDivision({ measurementUnit: "Centimeter", rows: [] })).toBe("5000");
  });

  it("uses the inch divisor when the piece unit is inches", () => {
    expect(
      resolveDivision({
        measurementUnit: "Inch",
        productName: "AIR",
        rows: [{ product: "AIR", cm_divisor: 5000, inch_divisor: 166 }],
      }),
    ).toBe("166");
  });

  it("rounds charge weight up to the next 0.5 kg only when the vendor flag is on", () => {
    expect(formatChargeWeight(1.1, false)).toBe("1.100");
    expect(formatChargeWeight(1.1, true)).toBe("1.500");
    expect(formatChargeWeight(1.5, true)).toBe("1.500");
  });

  it("adds fuel and GST into the item total from the charge flags", () => {
    const intra = manualChargeAmounts({
      itemAmount: 100,
      applyFuel: true,
      applyTaxOnFuel: false,
      applyTax: true,
      fuelPct: 10,
      gstPct: 18,
      intraState: true,
    });
    expect(intra.fuelAmt).toBe("10.00");
    expect(intra.cgst).toBe("9.00");
    expect(intra.sgst).toBe("9.00");
    expect(intra.igst).toBe("0.00");
    expect(intra.total).toBe("128.00");
  });

  it("picks the most specific fuel percent and computes balance", () => {
    expect(
      fuelPercentFor({
        vendorCode: "DHL",
        rows: [
          { percentage: 15 },
          { vendor: "DHL", percentage: 20 },
        ],
      }),
    ).toBe(20);
    expect(balanceDue("128.00", "28")).toBe("100.00");
    expect(hsnIsValid("")).toBe(true);
    expect(hsnIsValid("12345678")).toBe(true);
    expect(hsnIsValid("1234")).toBe(false);
  });

  it("zero-rates commercial exports and treats a blank state as intra-state", () => {
    expect(awbGstPercent({ commercial: true, csbType: "CSB 4" })).toBe(0);
    expect(awbGstPercent({ commercial: false, csbType: "CSB 5" })).toBe(0);
    expect(awbGstPercent({ commercial: false, csbType: "CSB 4" })).toBe(18);
    expect(awbIntraState("", "Karnataka")).toBe(true);
    expect(awbIntraState("Telangana", "Karnataka")).toBe(false);
  });
});
