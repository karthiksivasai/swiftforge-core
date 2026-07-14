import { describe, it, expect } from "vitest";

import {
  serviceCenterCreateSchema,
  serviceCenterUpdateSchema,
  serviceCenterTermsSchema,
} from "./serviceCenters";
import { fieldExecutiveCreateSchema, fieldExecutiveUpdateSchema } from "./fieldExecutives";

const UUID = "55555555-5555-4555-8555-555555555555";

describe("serviceCenterCreateSchema", () => {
  it("requires code + name and normalizes empty optionals to null", () => {
    const out = serviceCenterCreateSchema.parse({ code: " HYD ", name: " Hyderabad " });
    expect(out.code).toBe("HYD");
    expect(out.name).toBe("Hyderabad");
    expect(out.branch).toBeNull();
    expect(out.bank_name).toBeNull();
    expect(out.rcp_last_no).toBeNull();
  });

  it("keeps supplied optional values (trimmed)", () => {
    const out = serviceCenterCreateSchema.parse({
      code: "BAN",
      name: "Bangalore",
      branch: " BLR ",
      gst_no: "29ABCDE",
      last_invoice_prefix: "INV",
    });
    expect(out).toMatchObject({ branch: "BLR", gst_no: "29ABCDE", last_invoice_prefix: "INV" });
  });

  it("rejects a blank code or name", () => {
    expect(() => serviceCenterCreateSchema.parse({ code: "  ", name: "X" })).toThrow(
      /Code is required/,
    );
    expect(() => serviceCenterCreateSchema.parse({ code: "X", name: "  " })).toThrow(
      /Name is required/,
    );
  });

  it("allows partial patches on update", () => {
    expect(serviceCenterUpdateSchema.parse({ name: "New" })).toEqual({ name: "New" });
  });
});

describe("serviceCenterTermsSchema", () => {
  it("accepts an array of strings (including empty)", () => {
    expect(serviceCenterTermsSchema.parse([])).toEqual([]);
    expect(serviceCenterTermsSchema.parse(["a", "b"])).toEqual(["a", "b"]);
  });

  it("rejects non-string entries", () => {
    expect(() => serviceCenterTermsSchema.parse([1, 2])).toThrow();
  });
});

describe("fieldExecutiveCreateSchema", () => {
  it("applies charge + boolean defaults and requires a service center", () => {
    const out = fieldExecutiveCreateSchema.parse({
      code: "AKHIL",
      name: "Akhil",
      service_center_id: UUID,
    });
    expect(out).toMatchObject({
      code: "AKHIL",
      name: "Akhil",
      service_center_id: UUID,
      pickup_charge: 0,
      delivery_charge: 0,
      destination_id: null,
      in_active: false,
    });
  });

  it("keeps supplied charges + optional destination", () => {
    const out = fieldExecutiveCreateSchema.parse({
      code: "RAJU",
      name: "Raju",
      service_center_id: UUID,
      destination_id: UUID,
      pickup_charge: 12,
      delivery_charge: 8,
      in_active: true,
    });
    expect(out).toMatchObject({
      pickup_charge: 12,
      delivery_charge: 8,
      destination_id: UUID,
      in_active: true,
    });
  });

  it("rejects a missing/invalid service center and negative charges", () => {
    expect(() =>
      fieldExecutiveCreateSchema.parse({ code: "X", name: "Y", service_center_id: "" }),
    ).toThrow(/Service Center is required/);
    expect(() =>
      fieldExecutiveCreateSchema.parse({
        code: "X",
        name: "Y",
        service_center_id: UUID,
        pickup_charge: -1,
      }),
    ).toThrow(/non-negative/);
  });

  it("allows partial patches on update", () => {
    expect(fieldExecutiveUpdateSchema.parse({ name: "New" })).toEqual({ name: "New" });
  });
});
