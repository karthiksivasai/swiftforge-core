import { describe, expect, it } from "vitest";

import {
  applyVendorSlabs,
  compareVendorRates,
  quoteSelectedVendor,
  type VendorTariff,
} from "./vendorTariff";

const dhl: VendorTariff = {
  id: "dhl-au",
  vendorId: "vendor-dhl",
  vendorCode: "DHL",
  vendorName: "DHL Express",
  productCode: "SPX",
  originCode: "HYD",
  destinationCode: "AUSTRALIA",
  contractNo: "144629",
  zoneId: null,
  zoneCode: "12",
  service: "EXPRESS",
  fromDate: "2024-01-01",
  status: "ACTIVE",
  slabs: [
    { seq: 1, rate_type: "PER_KG", weight: 0, rate: 200 },
    { seq: 2, rate_type: "MINIMUM", weight: 0, rate: 500 },
  ],
};

const fedex: VendorTariff = {
  ...dhl,
  id: "fedex-au",
  vendorId: "vendor-fedex",
  vendorCode: "FEDEX",
  vendorName: "FedEx",
  service: "ECONOMY",
  slabs: [{ seq: 1, rate_type: "PER_KG", weight: 0, rate: 150 }],
};

const otherLane: VendorTariff = {
  ...dhl,
  id: "dhl-us",
  destinationCode: "USA",
  slabs: [{ seq: 1, rate_type: "FLAT", weight: 0, rate: 50 }],
};

describe("vendor tariff pricing", () => {
  it("applies a per-kg rate and raises it to the minimum", () => {
    expect(applyVendorSlabs(1, dhl.slabs)).toEqual({ freight: 500, ratePerKg: 200 });
    expect(applyVendorSlabs(4, dhl.slabs)).toEqual({ freight: 800, ratePerKg: 200 });
  });

  it("stops at the first slab the weight fits", () => {
    const slabs = [
      { seq: 1, rate_type: "PER_SLAB" as const, weight: 5, rate: 400 },
      { seq: 2, rate_type: "PER_SLAB" as const, weight: 10, rate: 700 },
    ];
    expect(applyVendorSlabs(5, slabs).freight).toBe(400);
    expect(applyVendorSlabs(8, slabs).freight).toBe(700);
  });

  it("prices only the selected vendor and adds fuel and tax", () => {
    const quote = quoteSelectedVendor([dhl, fedex], {
      vendorCode: "DHL",
      productCode: "SPX",
      originCode: "HYD",
      destinationCode: "AUSTRALIA",
      serviceCode: "EXPRESS",
      bookDate: "2026-11-07",
      chargeableWeight: 4,
      fuelPct: 10,
      gstPct: 18,
    });

    expect(quote?.vendorCode).toBe("DHL");
    expect(quote?.freight).toBe(800);
    expect(quote?.fuelAmount).toBe(80);
    expect(quote?.taxAmount).toBe(158.4);
    expect(quote?.totalAmount).toBe(1038.4);
  });

  it("lists every carrier on the lane, cheapest first", () => {
    const rows = compareVendorRates([dhl, fedex, otherLane], {
      productCode: "SPX",
      originCode: "HYD",
      destinationCode: "AUSTRALIA",
      bookDate: "2026-11-07",
      chargeableWeight: 4,
      fuelPct: 0,
      gstPct: 0,
    });

    expect(rows.map((row) => row.vendorCode)).toEqual(["FEDEX", "DHL"]);
    expect(rows[0]?.totalAmount).toBe(600);
    expect(rows[1]?.totalAmount).toBe(800);
  });
});
