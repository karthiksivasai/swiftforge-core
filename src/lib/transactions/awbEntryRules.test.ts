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
import {
  collectAwbProductionErrors,
  emptyForm,
} from "@/routes/transaction.awb-entry";

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

  it("returns empty string and never 5000 when piece unit is inches and no inch divisor exists", () => {
    expect(
      resolveDivision({
        measurementUnit: "Inch",
        productName: "AIR",
        rows: [{ product: "AIR", cm_divisor: 5000, inch_divisor: null }],
      }),
    ).toBe("");
    expect(resolveDivision({ measurementUnit: "Inch", rows: [] })).toBe("");
  });

  it("validates LUT Bond/UT without crashing and checks expiry", () => {
    const form = emptyForm();
    form.vendor = { id: "v1", code: "FEDEX", name: "FedEx" };
    form.shipper.address1 = "123 Main St";
    form.shipper.pincode = "500001";
    form.shipper.city = "Hyderabad";
    form.shipper.state = "Telangana";
    form.proforma.csbType = "CSB 5";
    form.proforma.exportReason = "SALE";
    form.proforma.adCode = "ADCODE01";
    form.shipper.iecNo = "0123456789";
    form.proforma.bondUt = "Yes";
    form.bookDate = "2026-11-10";
    form.proforma.lines = [
      { id: "1", boxNo: "1", packages: "1", description: "Silk Sarees", hsCode: "5007", quantity: "10", weight: "1.0", unit: "PCS", rate: "100", amount: "1000", igstPercent: "0", igstAmount: "0" },
    ];

    // 1. Crash test: clientProfile passed with valid LUT
    const clientProfile = {
      id: "c1",
      code: "RAVI",
      name: "Ravi Textiles",
      billingStateCode: "36",
      lutNumber: "LUT-2026-FUTURE",
      lutExpiryDate: "2027-03-31",
      defaults: { currency: "USD", preferredProduct: { id: "p1", code: "COM", name: "Commercial" } },
      defaultVendor: { id: "v1", code: "FEDEX", name: "FedEx" },
      activeLut: true,
      iecNumber: "0123456789",
      bankAdCode: "ADCODE01",
    } as any;

    const noCrashErrors = collectAwbProductionErrors(form, clientProfile);
    expect(noCrashErrors.filter((e) => e.includes("Bond / UT") || e.includes("LUT"))).toHaveLength(0);

    // 2. Expired LUT check
    const expiredProfile = { ...clientProfile, lutExpiryDate: "2026-03-31" };
    const expiredErrors = collectAwbProductionErrors(form, expiredProfile);
    expect(expiredErrors).toContain(
      "Bond / UT is selected as Yes, but the LUT on file (LUT-2026-FUTURE) expired on 2026-03-31. An active, unexpired LUT is required.",
    );

    // 3. Manual LUT typed without expiry date
    form.proforma.lutNo = "LUT-MANUAL-001";
    form.proforma.lutExpiry = "";
    const manualNoExpiryErrors = collectAwbProductionErrors(form, null);
    expect(manualNoExpiryErrors).toContain("LUT Expiry Date is required when LUT Number is entered on the Proforma tab.");

    // 4. Manual LUT typed with valid future expiry date
    form.proforma.lutExpiry = "2027-12-31";
    const manualValidErrors = collectAwbProductionErrors(form, null);
    expect(manualValidErrors.filter((e) => e.includes("LUT"))).toHaveLength(0);
  });

  it("exempts non-commercial DOX shipments from CSB Type and Export Reason requirements", () => {
    const doxForm = emptyForm();
    doxForm.vendor = { id: "v1", code: "FEDEX", name: "FedEx" };
    doxForm.shipper.address1 = "123 Main St";
    doxForm.shipper.pincode = "500001";
    doxForm.shipper.city = "Hyderabad";
    doxForm.shipper.state = "Telangana";
    doxForm.product = { id: "p1", code: "DOX", name: "Documents" };
    doxForm.piecesUnit = "DOX";
    doxForm.commercial = false;
    doxForm.proforma.csbType = "";
    doxForm.proforma.exportReason = "";
    doxForm.proforma.lines = [];

    const errors = collectAwbProductionErrors(doxForm);
    expect(errors.filter((e) => e.includes("CSB Type") || e.includes("Export reason"))).toHaveLength(0);
    expect(errors.filter((e) => e.includes("Proforma line item is required"))).toHaveLength(0);
  });

  it("blocks save when dimensions are in inches without an inch divisor", () => {
    const form = emptyForm();
    form.piecesLines = [
      {
        id: "p1",
        childAwb: "",
        actualWeightPerPc: "1.0",
        pieces: "1",
        length: "12",
        breadth: "12",
        height: "12",
        measurementUnit: "Inch",
        division: "5000", // invalid cm fallback
        volWeight: "0.345",
        chargeWeight: "1.000",
      },
    ];
    const errors = collectAwbProductionErrors(form);
    expect(errors).toContain(
      "Box 1: No inch volumetric divisor (e.g. 305 or 166) is configured for this customer or vendor. Configure an inch divisor or enter dimensions in cm.",
    );
  });
});
