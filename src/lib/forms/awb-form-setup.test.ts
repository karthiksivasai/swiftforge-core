import { describe, expect, it } from "vitest";

import {
  AWB_FIELD_MESSAGES,
  applyAwbFormSetupRepeats,
  awbFieldRequirements,
  defaultAwbFormSetup,
  instructionAfterClientHydrate,
  parseAwbFormSetup,
  resolvePaymentType,
  type AwbFormSetupSettings,
  type AwbRepeatForm,
} from "@/lib/forms/awb-form-setup";
import { awbOptionalFieldErrors } from "@/lib/forms/awb-entry-required-fields";

const pair = (code: string, name = code) => ({ code, name });

function party(prefix: string) {
  return {
    origin: pair(`${prefix}-O`, `${prefix} Origin`),
    companyName: pair(`${prefix}-C`, `${prefix} Company`),
    contactName: `${prefix} contact`,
    address1: `${prefix} address 1`,
    address2: `${prefix} address 2`,
    pincode: "500001",
    city: `${prefix} city`,
    state: `${prefix} state`,
    telephone: "040",
    mobileNo: "9000000000",
    email: `${prefix}@example.com`,
    country: "India",
    iecNo: "IEC1234567",
    documentType: "PAN",
    documentNo: "ABCDE1234F",
  };
}

function blank(): AwbRepeatForm {
  return {
    clientName: pair("", ""),
    bookDate: "2026-11-15",
    bookTime: "2201",
    content: "",
    product: pair("", ""),
    vendor: pair("", ""),
    airline: "",
    service: pair("", ""),
    instruction: "",
    shipper: party("new"),
    consignee: party("new-c"),
    awbNo: "",
    chargeLines: [],
    customerChargesTotal: "0",
    vendorChargesTotal: "0",
  };
}

function previous(): AwbRepeatForm {
  return {
    ...blank(),
    clientName: pair("C1", "Client One"),
    bookDate: "2026-01-02",
    bookTime: "0900",
    content: "Old content",
    product: pair("DOX", "Documents"),
    vendor: pair("V1", "Vendor One"),
    airline: "Emirates",
    service: pair("SVC", "Express"),
    instruction: "Leave at desk",
    shipper: party("old-shipper"),
    consignee: party("old-consignee"),
    awbNo: "100010",
    chargeLines: [{ id: "stale", total: "500.00" }],
    customerChargesTotal: "500.00",
    vendorChargesTotal: "200.00",
  };
}

const emptyConsignee = {
  destination: pair("", ""),
  consignee: {
    companyName: "",
    address1: "",
    city: "",
    postcode: "",
    country: "",
    phone: "",
  },
  airline: "",
};

describe("AWB form setup defaults and parsing", () => {
  it("defaults airline optional and payment override on", () => {
    const settings = defaultAwbFormSetup();
    expect(settings.airlineNotRequired).toBe(true);
    expect(settings.allowPaymentTypeOverride).toBe(true);
    expect(settings.customerRepeat).toBe(false);
    expect(settings.awbNoPlus1).toBe(false);
  });

  it("keeps awbNoPlus1 when an older payload still has it", () => {
    expect(parseAwbFormSetup({ awbNoPlus1: true, airlineNotRequired: false }).awbNoPlus1).toBe(true);
    expect(parseAwbFormSetup({ airlineNotRequired: "yes" }).airlineNotRequired).toBe(true);
  });
});

describe("AWB required-field rules", () => {
  const base = defaultAwbFormSetup();

  it("requires the consignee block and not the airline by default", () => {
    expect(awbOptionalFieldErrors(emptyConsignee, base)).toEqual([
      AWB_FIELD_MESSAGES.destination,
      AWB_FIELD_MESSAGES.consigneeCompany,
      AWB_FIELD_MESSAGES.consigneeAddress1,
      AWB_FIELD_MESSAGES.consigneeCity,
      AWB_FIELD_MESSAGES.consigneePostcode,
      AWB_FIELD_MESSAGES.consigneeCountry,
      AWB_FIELD_MESSAGES.consigneePhone,
    ]);
  });

  it("lets the consignee company name be blank without dropping the rest", () => {
    const setup: AwbFormSetupSettings = { ...base, allowConsigneeNameBlank: true };
    expect(awbFieldRequirements(setup).consigneeCompany).toBe(false);
    expect(awbFieldRequirements(setup).consigneeAddress1).toBe(true);
    expect(awbOptionalFieldErrors(emptyConsignee, setup)).not.toContain(
      AWB_FIELD_MESSAGES.consigneeCompany,
    );
    expect(awbOptionalFieldErrors(emptyConsignee, setup)).toContain(
      AWB_FIELD_MESSAGES.consigneeAddress1,
    );
  });

  it("makes destination and the whole consignee block optional", () => {
    const setup: AwbFormSetupSettings = { ...base, consigneeNotRequired: true };
    expect(awbOptionalFieldErrors(emptyConsignee, setup)).toEqual([]);
  });

  it("requires an airline when Airline Not Required is off", () => {
    const setup: AwbFormSetupSettings = { ...base, airlineNotRequired: false };
    expect(awbOptionalFieldErrors(emptyConsignee, setup)).toContain(AWB_FIELD_MESSAGES.airline);
  });

  it("name-blank does not override consignee not required", () => {
    const setup: AwbFormSetupSettings = {
      ...base,
      consigneeNotRequired: true,
      allowConsigneeNameBlank: false,
    };
    expect(awbOptionalFieldErrors(emptyConsignee, setup)).toEqual([]);
  });
});

describe("AWB repeat mapping", () => {
  const flags = defaultAwbFormSetup();

  it("copies nothing and does not invent the next AWB number when every repeat is off", () => {
    const next = applyAwbFormSetupRepeats(blank(), previous(), { ...flags, awbNoPlus1: true });
    expect(next.clientName.code).toBe("");
    expect(next.awbNo).toBe("");
    expect(next.bookTime).toBe("2201");
    expect(next.chargeLines).toEqual([]);
    expect(next.customerChargesTotal).toBe("0");
  });

  it("copies each repeat field and leaves the others reset", () => {
    const cases: Array<[keyof AwbFormSetupSettings, (form: AwbRepeatForm) => string]> = [
      ["customerRepeat", (form) => form.clientName.name],
      ["dateRepeat", (form) => form.bookDate],
      ["contentRepeat", (form) => form.content],
      ["productRepeat", (form) => form.product.code],
      ["instructionRepeat", (form) => form.instruction],
      ["vendorRepeat", (form) => form.vendor.code],
      ["airlineRepeat", (form) => form.airline],
      ["serviceRepeat", (form) => form.service.code],
      ["destinationRepeat", (form) => form.consignee.origin.code],
    ];
    for (const [key, read] of cases) {
      const next = applyAwbFormSetupRepeats(blank(), previous(), { ...flags, [key]: true });
      expect(read(next), key).toBe(read(previous()));
      expect(next.chargeLines, key).toEqual([]);
      expect(next.vendorChargesTotal, key).toBe("0");
      expect(next.bookTime, key).toBe("2201");
      expect(next.awbNo, key).toBe("");
    }
  });

  it("copies the consignee company and contact only", () => {
    const next = applyAwbFormSetupRepeats(blank(), previous(), {
      ...flags,
      consigneeNameRepeat: true,
    });
    expect(next.consignee.companyName.name).toBe("old-consignee Company");
    expect(next.consignee.contactName).toBe("old-consignee contact");
    expect(next.consignee.address1).toBe("new-c address 1");
    expect(next.consignee.origin.code).toBe("new-c-O");
  });

  it("copies the whole shipper block", () => {
    const next = applyAwbFormSetupRepeats(blank(), previous(), {
      ...flags,
      shipperDetailsRepeat: true,
    });
    expect(next.shipper).toMatchObject({
      origin: { code: "old-shipper-O" },
      companyName: { name: "old-shipper Company" },
      contactName: "old-shipper contact",
      address1: "old-shipper address 1",
      pincode: "500001",
      city: "old-shipper city",
      state: "old-shipper state",
      telephone: "040",
      mobileNo: "9000000000",
      email: "old-shipper@example.com",
      country: "India",
      iecNo: "IEC1234567",
      documentType: "PAN",
      documentNo: "ABCDE1234F",
    });
  });

  it("lets the repeated instruction win over the client master instruction", () => {
    expect(
      instructionAfterClientHydrate({
        instructionRepeat: true,
        repeatedInstruction: "Leave at desk",
        clientInstruction: "From client master",
      }),
    ).toBe("Leave at desk");
    expect(
      instructionAfterClientHydrate({
        instructionRepeat: false,
        repeatedInstruction: "Leave at desk",
        clientInstruction: "From client master",
      }),
    ).toBe("From client master");
  });
});

describe("payment type lock", () => {
  it("keeps a typed value when the customer master is blank", () => {
    expect(
      resolvePaymentType({
        allowPaymentTypeOverride: false,
        canOverride: false,
        masterPaymentType: "",
        submitted: "Cash",
      }),
    ).toEqual({ paymentType: "Cash", error: null, overrideLogged: false });
  });

  it("rejects a different payment type when override is off", () => {
    expect(
      resolvePaymentType({
        allowPaymentTypeOverride: false,
        canOverride: true,
        masterPaymentType: "Credit",
        submitted: "Cash",
      }).error,
    ).toBe(AWB_FIELD_MESSAGES.paymentType);
  });

  it("rejects a different payment type when the user lacks permission", () => {
    expect(
      resolvePaymentType({
        allowPaymentTypeOverride: true,
        canOverride: false,
        masterPaymentType: "Credit",
        submitted: "Cash",
      }).error,
    ).toBe(AWB_FIELD_MESSAGES.paymentType);
  });

  it("logs an override only when the flag and the permission are both on", () => {
    expect(
      resolvePaymentType({
        allowPaymentTypeOverride: true,
        canOverride: true,
        masterPaymentType: "Credit",
        submitted: "Cash",
      }),
    ).toEqual({ paymentType: "Cash", error: null, overrideLogged: true });
  });
});
