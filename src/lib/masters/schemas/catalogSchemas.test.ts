import { describe, it, expect } from "vitest";

import { productTypeCreateSchema } from "./productTypes";
import { productCreateSchema } from "./products";
import { bankCreateSchema } from "./banks";
import { salesExecutiveCreateSchema } from "./salesExecutives";
import { deliveryExceptionCreateSchema } from "./deliveryExceptions";
import { flightCreateSchema } from "./flights";
import { industryCreateSchema } from "./industries";

const UUID = "22222222-2222-2222-2222-222222222222";

describe("productTypeCreateSchema", () => {
  it("trims required text", () => {
    expect(productTypeCreateSchema.parse({ code: "  D ", name: "  Domestic " })).toEqual({
      code: "D",
      name: "Domestic",
    });
  });

  it("rejects blank required fields", () => {
    expect(() => productTypeCreateSchema.parse({ code: "  ", name: "X" })).toThrow(
      /Code is required/,
    );
  });
});

describe("productCreateSchema", () => {
  it("applies enum/boolean defaults and nulls the optional product type fk", () => {
    const out = productCreateSchema.parse({ code: "DOX", name: "Documents" });
    expect(out).toMatchObject({
      code: "DOX",
      name: "Documents",
      product_type_id: null,
      service: null,
      fuel_charge: false,
      gst_reverse: false,
      shipment_type: "DOX",
      status: "ACTIVE",
      group_type: null,
    });
  });

  it("passes through a valid product type uuid and normalizes empty to null", () => {
    expect(productCreateSchema.parse({ code: "P", product_type_id: UUID }).product_type_id).toBe(
      UUID,
    );
    expect(
      productCreateSchema.parse({ code: "P", product_type_id: "" }).product_type_id,
    ).toBeNull();
  });

  it("rejects invalid enums", () => {
    expect(() => productCreateSchema.parse({ code: "P", shipment_type: "GAS" })).toThrow();
    expect(() => productCreateSchema.parse({ code: "P", status: "ARCHIVED" })).toThrow();
    expect(() => productCreateSchema.parse({ code: "P", group_type: "ROAD" })).toThrow();
  });

  it("requires a product code", () => {
    expect(() => productCreateSchema.parse({ code: "   " })).toThrow(/Product Code is required/);
  });
});

describe("bankCreateSchema", () => {
  it("defaults status to ACTIVE", () => {
    expect(bankCreateSchema.parse({ code: "AXI", name: "Axis" })).toEqual({
      code: "AXI",
      name: "Axis",
      status: "ACTIVE",
    });
  });

  it("rejects an invalid status", () => {
    expect(() => bankCreateSchema.parse({ code: "A", name: "B", status: "CLOSED" })).toThrow();
  });
});

describe("salesExecutiveCreateSchema", () => {
  it("coerces a missing commission to 0", () => {
    expect(salesExecutiveCreateSchema.parse({ code: "SE", name: "Rep" }).commission).toBe(0);
  });

  it("accepts a non-negative commission and rejects a negative one", () => {
    expect(
      salesExecutiveCreateSchema.parse({ code: "SE", name: "Rep", commission: 5 }).commission,
    ).toBe(5);
    expect(() =>
      salesExecutiveCreateSchema.parse({ code: "SE", name: "Rep", commission: -1 }),
    ).toThrow(/non-negative/);
  });
});

describe("deliveryExceptionCreateSchema", () => {
  it("applies exc_type + boolean defaults", () => {
    expect(deliveryExceptionCreateSchema.parse({ code: "UN", name: "Undelivered" })).toEqual({
      code: "UN",
      name: "Undelivered",
      exc_type: "UNDELIVERED",
      inscan: false,
      show_on_mobile: false,
    });
  });

  it("rejects an invalid exc_type", () => {
    expect(() =>
      deliveryExceptionCreateSchema.parse({ code: "X", name: "Y", exc_type: "RETURNED" }),
    ).toThrow();
  });
});

describe("flightCreateSchema", () => {
  it("defaults flight_type to PRIME", () => {
    expect(flightCreateSchema.parse({ code: "AI101", name: "Air India" }).flight_type).toBe(
      "PRIME",
    );
  });

  it("accepts GCR and rejects unknown flight types", () => {
    expect(
      flightCreateSchema.parse({ code: "C", name: "Cargo", flight_type: "GCR" }).flight_type,
    ).toBe("GCR");
    expect(() =>
      flightCreateSchema.parse({ code: "C", name: "Cargo", flight_type: "JET" }),
    ).toThrow();
  });
});

describe("industryCreateSchema", () => {
  it("trims a simple code/name master", () => {
    expect(industryCreateSchema.parse({ code: "  IT ", name: " Software " })).toEqual({
      code: "IT",
      name: "Software",
    });
  });
});
