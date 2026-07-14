import { describe, it, expect } from "vitest";

import { consigneeCreateSchema } from "./consignees";
import { shipperCreateSchema } from "./shippers";
import {
  customerCreateSchema,
  customerFuelSurchargeSchema,
  customerOtherChargeSchema,
  customerVolumetricSchema,
  customerKycDocumentSchema,
} from "./customers";
import {
  vendorCreateSchema,
  vendorAddressSchema,
  vendorContactSchema,
  vendorDocumentSchema,
  vendorServiceSchema,
  vendorApiCredentialSchema,
} from "./vendors";

const UUID = "22222222-2222-2222-2222-222222222222";

describe("consigneeCreateSchema", () => {
  it("trims required text and defaults status to ACTIVE", () => {
    expect(
      consigneeCreateSchema.parse({
        code: " CN1 ",
        name: " Acme ",
        mobile: " 9999999999 ",
      }),
    ).toEqual({
      code: "CN1",
      name: "Acme",
      customer_id: null,
      customer_name: null,
      mobile: "9999999999",
      email: null,
      address: null,
      pin_code: null,
      city: null,
      state_id: null,
      country_id: null,
      status: "ACTIVE",
    });
  });

  it("requires code, name, and mobile", () => {
    expect(() => consigneeCreateSchema.parse({ code: " ", name: "X", mobile: "1" })).toThrow(
      /Code is required/,
    );
    expect(() => consigneeCreateSchema.parse({ code: "C", name: " ", mobile: "1" })).toThrow(
      /Name is required/,
    );
    expect(() => consigneeCreateSchema.parse({ code: "C", name: "N", mobile: " " })).toThrow(
      /Mobile is required/,
    );
  });

  it("passes through optional FK uuids and normalizes empty to null", () => {
    expect(
      consigneeCreateSchema.parse({
        code: "C",
        name: "N",
        mobile: "1",
        customer_id: UUID,
        state_id: UUID,
        country_id: "",
      }),
    ).toMatchObject({ customer_id: UUID, state_id: UUID, country_id: null });
  });
});

describe("shipperCreateSchema", () => {
  it("mirrors consignee shape with INACTIVE status", () => {
    expect(
      shipperCreateSchema.parse({
        code: "SH1",
        name: "Sender",
        mobile: "8888888888",
        status: "INACTIVE",
      }),
    ).toMatchObject({ status: "INACTIVE" });
  });

  it("rejects invalid status", () => {
    expect(() =>
      shipperCreateSchema.parse({ code: "S", name: "N", mobile: "1", status: "ARCHIVED" }),
    ).toThrow();
  });
});

describe("customerCreateSchema", () => {
  it("requires code, name, and mobile", () => {
    expect(() => customerCreateSchema.parse({ code: " ", name: "X", mobile: "1" })).toThrow(
      /Code is required/,
    );
  });
});

describe("customer child schemas", () => {
  it("accepts optional fuel surcharge fields", () => {
    expect(
      customerFuelSurchargeSchema.parse({
        entry_code: " F1 ",
        percentage: "5.5",
      }),
    ).toMatchObject({ entry_code: "F1", percentage: 5.5, vendor: null });
  });

  it("accepts optional other charge fields", () => {
    expect(
      customerOtherChargeSchema.parse({
        charge_type: "HANDLING",
        amount: "100",
      }),
    ).toMatchObject({ charge_type: "HANDLING", amount: 100 });
  });

  it("accepts optional volumetric fields", () => {
    expect(
      customerVolumetricSchema.parse({
        product: "DOC",
        cm_divisor: "5000",
      }),
    ).toMatchObject({ product: "DOC", cm_divisor: 5000 });
  });

  it("requires kyc_type on KYC documents", () => {
    expect(() => customerKycDocumentSchema.parse({ file_name: "x.pdf" })).toThrow(/KYC type/);
    expect(customerKycDocumentSchema.parse({ kyc_type: "PAN", file_name: "pan.pdf" })).toEqual({
      kyc_type: "PAN",
      file_name: "pan.pdf",
    });
  });
});

describe("vendorCreateSchema", () => {
  it("requires code, name, and mobile", () => {
    expect(() => vendorCreateSchema.parse({ code: " ", name: "X", mobile: "1" })).toThrow(
      /Code is required/,
    );
  });

  it("normalizes mode to uppercase enum", () => {
    expect(
      vendorCreateSchema.parse({ code: "V1", name: "Vendor", mobile: "1", mode: "Air" }),
    ).toMatchObject({
      mode: "AIR",
    });
  });
});

describe("vendor child schemas", () => {
  it("accepts optional address fields", () => {
    expect(vendorAddressSchema.parse({ name: "HQ", address1: "Line 1" })).toMatchObject({
      name: "HQ",
      address1: "Line 1",
    });
  });

  it("accepts optional contact fields", () => {
    expect(vendorContactSchema.parse({ name: "Ops", mobile: "999" })).toMatchObject({
      name: "Ops",
      mobile: "999",
    });
  });

  it("requires doc_type on vendor documents", () => {
    expect(() => vendorDocumentSchema.parse({ file_name: "gst.pdf" })).toThrow(/Document type/);
    expect(
      vendorDocumentSchema.parse({ doc_type: " GST ", file_name: "gst.pdf", remark: "FY26" }),
    ).toMatchObject({ doc_type: "GST", file_name: "gst.pdf", remark: "FY26" });
  });

  it("requires service on vendor services", () => {
    expect(() => vendorServiceSchema.parse({ min_weight: "1" })).toThrow(/Service/);
    expect(
      vendorServiceSchema.parse({
        service: " EXPRESS ",
        billing_vendor_id: UUID,
        min_weight: "0.5",
        max_weight: "30",
        is_single_piece: true,
      }),
    ).toMatchObject({
      service: "EXPRESS",
      billing_vendor_id: UUID,
      min_weight: 0.5,
      max_weight: 30,
      is_single_piece: true,
      status: "ACTIVE",
    });
  });

  it("requires carrier_code on vendor API credentials", () => {
    expect(() => vendorApiCredentialSchema.parse({ api_key: "secret" })).toThrow(/Carrier code/);
    expect(
      vendorApiCredentialSchema.parse({
        carrier_code: " DHL ",
        api_key: "key1",
        endpoint_url: "https://api.example/dhl",
        is_active: false,
      }),
    ).toMatchObject({
      carrier_code: "DHL",
      api_key: "key1",
      endpoint_url: "https://api.example/dhl",
      is_active: false,
    });
  });
});
