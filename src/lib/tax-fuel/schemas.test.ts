import { describe, expect, it } from "vitest";

import { fuelRateSchema, taxRateSchema } from "@/lib/tax-fuel/schemas";

describe("tax/fuel setup schemas", () => {
  it("accepts valid fuel rate", () => {
    const parsed = fuelRateSchema.parse({
      from_date: "2026-07-01",
      percentage: 12.5,
      product_code: "DOX",
      zone_code: "Z1",
    });
    expect(parsed.percentage).toBe(12.5);
    expect(parsed.status).toBe("ACTIVE");
  });

  it("rejects invalid fuel percentage", () => {
    expect(() => fuelRateSchema.parse({ from_date: "2026-07-01", percentage: 150 })).toThrow();
  });

  it("accepts valid tax rate", () => {
    const parsed = taxRateSchema.parse({
      from_date: "2026-07-01",
      igst_pct: 18,
      cgst_pct: 9,
      sgst_pct: 9,
    });
    expect(parsed.igst_pct).toBe(18);
    expect(parsed.tax_on_fuel).toBe(true);
  });
});
