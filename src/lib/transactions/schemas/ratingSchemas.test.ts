import { describe, expect, it } from "vitest";
import { ratingSnapshotToChargeLines, ratingToSummary } from "@/lib/transactions/ratingUiMap";
import type { RatingBreakdown } from "@/lib/transactions/resources/rating";

const sample: RatingBreakdown = {
  freight: 200,
  fuel: 30,
  tax: 50.4,
  other_charges: 50,
  vendor_cost: 80,
  total: 330.4,
  snapshot: [
    {
      id: "1",
      side: "CUSTOMER",
      description: "Freight",
      rate: 100,
      amount: 200,
      fuel_applies: true,
      fuel_amount: 30,
      tax_applies: true,
      igst: 0,
      sgst: 25.2,
      cgst: 25.2,
      total: 280.4,
      charges_type: "SYSTEM",
    },
  ],
  raw: {},
};

describe("ratingUiMap", () => {
  it("maps server totals without client recalculation", () => {
    const s = ratingToSummary(sample);
    expect(s.freight).toBe("200.00");
    expect(s.fuel).toBe("30.00");
    expect(s.tax).toBe("50.40");
    expect(s.otherCharges).toBe("50.00");
    expect(s.totalAmount).toBe("330.40");
  });

  it("maps snapshot lines for AWB charges panel", () => {
    const lines = ratingSnapshotToChargeLines(sample);
    expect(lines).toHaveLength(1);
    expect(lines[0].description).toBe("Freight");
    expect(lines[0].chargesType).toBe("SYSTEM");
    expect(lines[0].fuelAmt).toBe("30.00");
  });
});
