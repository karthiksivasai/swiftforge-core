import { describe, expect, it } from "vitest";
import {
  calculatePieceWeights,
  computeShipmentRating,
  resolveCustomerRate,
  validateServiceWeight,
  type CustomerRateRecord,
  type RateQueryInput,
  type ServiceWeightRuleRecord,
} from "./ratingEngine";

describe("Courier Charge Details Rating Engine", () => {
  const sampleRateCard: CustomerRateRecord[] = [
    {
      id: "rate-ref-1",
      customer_code: "CKING",
      contract_no: "243792",
      product_code: "SPX",
      vendor_code: "DTAU",
      origin_code: "HYD",
      destination_code: "AUSTRALIA",
      rate_per_kg: 444.91,
      status: "ACTIVE",
      from_date: "2020-01-01",
    },
    {
      id: "rate-ref-generic-dest",
      customer_code: "CKING",
      contract_no: "243792",
      product_code: "SPX",
      origin_code: "HYD",
      destination_code: null, // wildcard
      rate_per_kg: 350.0,
      status: "ACTIVE",
      from_date: "2020-01-01",
    },
  ];

  const sampleRules: ServiceWeightRuleRecord[] = [
    {
      id: "rule-1",
      service_code: "COURIER PLEASE",
      service_name: "COURIER PLEASE",
      min_weight: 0.5,
      max_weight: 999.0,
      status: "ACTIVE",
    },
  ];

  it("computes exact verified reference case with full precision", () => {
    const query: RateQueryInput = {
      customerCode: "CKING",
      contractNo: "243792",
      productCode: "SPX",
      vendorCode: "DTAU",
      serviceCode: "COURIER PLEASE",
      originCode: "HYD",
      destinationCode: "AUSTRALIA",
      bookDate: "2026-08-14",
      division: 5000,
      customerBillingStateCode: "TELANGANA",
      branchStateCode: "TELANGANA",
      gstPct: 18,
      fuelPct: 0,
      pieces: [
        { actualWeight: 25, pieces: 1, length: 50, width: 50, height: 50 },
        { actualWeight: 13, pieces: 1, length: 50, width: 45, height: 20 },
      ],
    };

    const res = computeShipmentRating(query, sampleRateCard, sampleRules);

    // Chargeable weight check: (50*50*50/5000=25 vs 25)=25, (50*45*20/5000=9 vs 13)=13 -> 25+13=38
    expect(res.chargeableWeight).toBe(38);
    expect(res.ratePerKg).toBe(444.91);

    // Contract charges: 444.91 * 38 = 16906.58
    expect(res.contractCharges).toBe(16906.58);
    expect(res.subTotal).toBe(16906.58);
    expect(res.fuelAmount).toBe(0);

    // Intra-state GST (TELANGANA === TELANGANA): 9% CGST + 9% SGST
    expect(res.isIntraState).toBe(true);
    expect(res.cgst).toBeCloseTo(1521.5922, 4);
    expect(res.sgst).toBeCloseTo(1521.5922, 4);
    expect(res.igst).toBe(0);

    // Total Amount: 16906.58 + 1521.5922 + 1521.5922 = 19949.7644 -> UI display formats to 19949.76
    expect(res.totalAmount).toBeCloseTo(19949.7644, 4);
  });

  it("computes inter-state GST (IGST) when customer state differs from branch state", () => {
    const query: RateQueryInput = {
      customerCode: "CKING",
      contractNo: "243792",
      productCode: "SPX",
      vendorCode: "DTAU",
      serviceCode: "COURIER PLEASE",
      originCode: "HYD",
      destinationCode: "AUSTRALIA",
      bookDate: "2026-08-14",
      customerBillingStateCode: "MAHARASHTRA", // Different state
      branchStateCode: "TELANGANA",
      gstPct: 18,
      pieces: [{ actualWeight: 38, pieces: 1, length: 10, width: 10, height: 10 }],
    };

    const res = computeShipmentRating(query, sampleRateCard, sampleRules);

    expect(res.isIntraState).toBe(false);
    expect(res.cgst).toBe(0);
    expect(res.sgst).toBe(0);
    expect(res.igst).toBeCloseTo(3043.1844, 4);
    expect(res.totalAmount).toBeCloseTo(19949.7644, 4);
  });

  it("selects max(volumetric, actual Weight) per piece row", () => {
    const pieces = [
      // Volumetric = 60*60*60*1/5000 = 43.2 kg, Actual = 10 kg -> max = 43.2
      { actualWeight: 10, pieces: 1, length: 60, width: 60, height: 60 },
      // Volumetric = 20*20*20*1/5000 = 1.6 kg, Actual = 15 kg -> max = 15.0
      { actualWeight: 15, pieces: 1, length: 20, width: 20, height: 20 },
    ];

    const { chargeableWeight, calculatedPieces } = calculatePieceWeights(pieces, 5000);

    expect(calculatedPieces[0].volumetric).toBe(43.2);
    expect(calculatedPieces[0].rowChargeWeight).toBe(43.2);

    expect(calculatedPieces[1].volumetric).toBe(1.6);
    expect(calculatedPieces[1].rowChargeWeight).toBe(15);

    expect(chargeableWeight).toBe(58.2);
  });

  it("resolves the most specific rate row (destination > generic wildcard)", () => {
    const matched = resolveCustomerRate(sampleRateCard, {
      customerCode: "CKING",
      contractNo: "243792",
      productCode: "SPX",
      originCode: "HYD",
      destinationCode: "AUSTRALIA",
      bookDate: "2026-08-14",
      chargeableWeight: 38,
    });

    expect(matched).not.toBeNull();
    expect(matched?.id).toBe("rate-ref-1");
    expect(matched?.rate_per_kg).toBe(444.91);
  });

  it("throws 422 error key when no matching rate row exists", () => {
    const query: RateQueryInput = {
      customerCode: "NONEXISTENT",
      contractNo: "999999",
      serviceCode: "COURIER PLEASE",
      bookDate: "2026-08-14",
      pieces: [{ actualWeight: 10, pieces: 1, length: 10, width: 10, height: 10 }],
    };

    expect(() => computeShipmentRating(query, sampleRateCard, sampleRules)).toThrowError(
      /NO_RATE_FOUND: Could not resolve rate for key/,
    );
  });

  // --- SERVICE WEIGHT VALIDATION TESTS ---

  it("test 1: rejects chargeableWeight under minimum (0.4 kg) with exact reference error message", () => {
    const check = validateServiceWeight({
      serviceCode: "COURIER PLEASE",
      chargeableWeight: 0.4,
      rules: sampleRules,
    });

    expect(check.valid).toBe(false);
    expect(check.message).toBe(
      "weight allowed between 0.500 to 999.000 For COURIER PLEASE service",
    );
  });

  it("test 2: accepts exact boundary weights (0.500 kg and 999.000 kg)", () => {
    const minCheck = validateServiceWeight({
      serviceCode: "COURIER PLEASE",
      chargeableWeight: 0.5,
      rules: sampleRules,
    });
    expect(minCheck.valid).toBe(true);

    const maxCheck = validateServiceWeight({
      serviceCode: "COURIER PLEASE",
      chargeableWeight: 999.0,
      rules: sampleRules,
    });
    expect(maxCheck.valid).toBe(true);
  });

  it("test 3: rejects chargeableWeight over maximum (999.001 kg)", () => {
    const check = validateServiceWeight({
      serviceCode: "COURIER PLEASE",
      chargeableWeight: 999.001,
      rules: sampleRules,
    });

    expect(check.valid).toBe(false);
    expect(check.message).toBe(
      "weight allowed between 0.500 to 999.000 For COURIER PLEASE service",
    );
  });

  it("test 4: accepts service with no rule (documented default allow)", () => {
    const check = validateServiceWeight({
      serviceCode: "EXPRESS DTD",
      chargeableWeight: 0.2,
      rules: sampleRules,
    });

    expect(check.valid).toBe(true);
  });

  it("test 5: computeShipmentRating blocks out-of-range request and throws exact error message", () => {
    const query: RateQueryInput = {
      customerCode: "CKING",
      contractNo: "243792",
      productCode: "SPX",
      vendorCode: "DTAU",
      serviceCode: "COURIER PLEASE",
      originCode: "HYD",
      destinationCode: "AUSTRALIA",
      bookDate: "2026-08-14",
      pieces: [{ actualWeight: 0.4, pieces: 1, length: 1, width: 1, height: 1 }], // chargeableWeight = 0.4 kg
    };

    expect(() => computeShipmentRating(query, sampleRateCard, sampleRules)).toThrowError(
      "weight allowed between 0.500 to 999.000 For COURIER PLEASE service",
    );
  });
});
