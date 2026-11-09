import { describe, expect, it } from "vitest";

import {
  awbGstPercent,
  awbIntraState,
  balanceDue,
  childAwbNo,
  consigneeBookingErrors,
  fillEmptyPartyFields,
  formatChargeWeight,
  formatLockStamp,
  amountReceivedError,
  awbErrorField,
  awbTextErrors,
  formatMoney2,
  futureBookDateError,
  istBookDate,
  lockedByCaption,
  loosePostcodeOk,
  sumPieceCount,
  fuelPercentFor,
  hsnIsValid,
  manualChargeAmounts,
  rateRefreshDecision,
  resolveDivision,
  roundMoney2,
  splitRoundedGst,
  storedChargeDisplay,
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
    expect(formatChargeWeight(5.666, true)).toBe("6.000");
    expect(formatLockStamp("2026-11-09T10:02:00Z")).toBe("09 Nov 2026, 15:32");
    expect(lockedByCaption("Karthik Test Admin", "2026-11-09T10:02:00Z")).toBe(
      "Locked by Karthik Test Admin on 09 Nov 2026, 15:32",
    );
    expect(lockedByCaption("", null)).toBeNull();
  });

  it("rounds total GST first, then splits so the halves add back to that total", () => {
    const split = splitRoundedGst(577.5, { intraState: true, gstPct: 18 });
    expect(split.tax).toBe(103.95);
    expect(roundMoney2(split.cgst + split.sgst)).toBe(103.95);
    expect(split.cgst).toBe(51.98);
    expect(split.sgst).toBe(51.97);
  });

  it("puts the whole rounded GST into IGST when the states differ", () => {
    const split = splitRoundedGst(275, { intraState: false, gstPct: 18 });
    expect(split.tax).toBe(49.5);
    expect(split.igst).toBe(49.5);
    expect(split.cgst).toBe(0);
    expect(split.sgst).toBe(0);
  });

  it("shows money with two decimals", () => {
    expect(formatMoney2("324.5")).toBe("324.50");
    expect(formatMoney2(3894)).toBe("3894.00");
    expect(formatMoney2("")).toBe("");
    expect(formatMoney2(null)).toBe("");
  });

  it("shows stored charges on open and rates again only after a rate field changes", () => {
    const stored = storedChargeDisplay([
      {
        description: "Freight",
        amount: "250.00",
        fuelAmt: "25.00",
        igst: "0.00",
        cgst: "24.75",
        sgst: "24.75",
        total: "324.50",
      },
    ]);
    const freshInterState = splitRoundedGst(275, { intraState: false, gstPct: 18 });
    expect(stored).toEqual({
      freight: "250.00",
      other: "0.00",
      fuel: "25.00",
      igst: "0.00",
      cgst: "24.75",
      sgst: "24.75",
      total: "324.50",
    });
    expect(freshInterState.igst).toBe(49.5);
    expect(stored.igst).toBe("0.00");

    const loaded = "OSMO|DOX|FEDEX|0.500";
    expect(
      rateRefreshDecision({ isSavedAwb: true, loadedRateKey: loaded, currentRateKey: loaded }),
    ).toBe("show-stored");
    expect(
      rateRefreshDecision({ isSavedAwb: true, loadedRateKey: null, currentRateKey: loaded }),
    ).toBe("show-stored");
    expect(
      rateRefreshDecision({
        isSavedAwb: true,
        loadedRateKey: loaded,
        currentRateKey: "OSMO|DOX|FEDEX|1.000",
      }),
    ).toBe("recalculate");
    expect(
      rateRefreshDecision({ isSavedAwb: false, loadedRateKey: null, currentRateKey: loaded }),
    ).toBe("recalculate");
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

  it("charges GST on commercial exports and does not treat a blank state as a match", () => {
    expect(awbGstPercent({ commercial: true, csbType: "CSB 4" })).toBe(18);
    expect(awbGstPercent({ commercial: false, csbType: "CSB 5" })).toBe(18);
    expect(awbGstPercent({ gstPercent: 12 })).toBe(12);
    expect(awbIntraState("", "TS")).toBe(false);
    expect(awbIntraState("TS", "")).toBe(false);
    expect(awbIntraState("TS", "TS")).toBe(true);
    expect(awbIntraState("TS", "MH")).toBe(false);
  });

  it("requires the international consignee fields and a loose postcode", () => {
    expect(
      consigneeBookingErrors({
        companyName: "",
        address1: "",
        city: "",
        postcode: "10001",
        country: "",
        phone: "",
      }),
    ).toEqual([
      "Consignee company name is required",
      "Consignee address 1 is required",
      "Consignee city is required",
      "Consignee country is required",
      "Consignee phone is required",
    ]);
    expect(loosePostcodeOk("SW1A 1AA")).toBe(true);
    expect(loosePostcodeOk("10001")).toBe(true);
    expect(loosePostcodeOk("A-12")).toBe(true);
    expect(loosePostcodeOk("10001!")).toBe(false);
    expect(childAwbNo("000035", 2)).toBe("000035-2");
    expect(sumPieceCount(["1", "2", ""])).toBe(3);
  });

  it("keeps a typed shipper address when the customer profile has a blank address", () => {
    const current = { address1: "12 Test Road", city: "Hyderabad", companyName: { code: "", name: "" } };
    const incoming = { address1: "", city: "", companyName: { code: "ALIASSO", name: "ALI ASSOCIATES" } };
    expect(fillEmptyPartyFields(current, incoming)).toEqual({
      address1: "12 Test Road",
      city: "Hyderabad",
      companyName: { code: "ALIASSO", name: "ALI ASSOCIATES" },
    });
  });

  it("uses the India calendar date and rejects a future book date", () => {
    const beforeUtcMidnight = new Date("2026-11-08T20:00:00.000Z");
    expect(istBookDate(beforeUtcMidnight)).toBe("2026-11-09");
    expect(beforeUtcMidnight.toISOString().slice(0, 10)).toBe("2026-11-08");
    expect(futureBookDateError("2026-11-09", "2026-11-09")).toBeNull();
    expect(futureBookDateError("2026-11-01", "2026-11-09")).toBeNull();
    expect(futureBookDateError("2026-11-10", "2026-11-09")).toBe("Book Date cannot be in the future");
    expect(futureBookDateError("", "2026-11-09")).toBeNull();
  });

  it("prices a Rs 10 handling line from fuel and tax flags, ignoring any browser total", () => {
    const intra = manualChargeAmounts({
      itemAmount: 10,
      applyFuel: true,
      applyTaxOnFuel: false,
      applyTax: true,
      fuelPct: 10,
      gstPct: 18,
      intraState: true,
    });
    expect(intra).toEqual({
      fuelAmt: "1.00",
      igst: "0.00",
      cgst: "0.90",
      sgst: "0.90",
      total: "12.80",
    });
    const inter = manualChargeAmounts({
      itemAmount: 10,
      applyFuel: true,
      applyTaxOnFuel: false,
      applyTax: true,
      fuelPct: 10,
      gstPct: 18,
      intraState: false,
    });
    expect(inter.igst).toBe("1.80");
    expect(inter.cgst).toBe("0.00");
    expect(inter.total).toBe("12.80");
    expect(amountReceivedError("337.30", "337.30")).toBeNull();
    expect(amountReceivedError("337.30", "400")).toBe("Amount received cannot be more than the total");
  });

  it("rejects over-long party text, a bad email, and an early delivery date", () => {
    const errors = awbTextErrors({
      referenceNo: "R".repeat(31),
      bookDate: "2026-11-09",
      expectedDeliveryDate: "2026-11-08",
      paymentType: "Cash",
      shipper: { companyName: "N".repeat(101), email: "not-an-email", mobile: "123", country: "India", iecNo: "ABC" },
    });
    expect(errors).toContain("Reference No. cannot be longer than 30 characters");
    expect(errors).toContain("Shipper company name cannot be longer than 100 characters");
    expect(errors).toContain("Shipper email is not a valid email address");
    expect(errors).toContain("Shipper mobile must be 10 digits");
    expect(errors).toContain("Shipper IEC must be 10 letters or numbers");
    expect(errors).toContain("Cash Receipt No. is required for a cash payment");
    expect(errors).toContain("Expected delivery date cannot be before the book date");
    expect(awbErrorField("Shipper mobile must be 10 digits")).toBe("shipperMobile");
    expect(awbErrorField("Shipper email is not a valid email address")).toBe("shipperEmail");
    expect(awbErrorField("Shipper IEC must be 10 letters or numbers")).toBe("shipperIec");
    expect(awbErrorField("Cash Receipt No. is required for a cash payment")).toBe("cashReceiptNo");
    expect(awbErrorField("Amount received cannot be more than the total")).toBe("amountReceived");
    expect(awbErrorField("Expected delivery date cannot be before the book date")).toBe("expectedDelivery");
  });
});
