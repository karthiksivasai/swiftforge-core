import { describe, it, expect } from "vitest";

import { shipmentChargeSchema, shipmentFieldsSchema, shipmentPieceSchema } from "./shipments";

describe("shipmentFieldsSchema", () => {
  it("accepts customer/product codes and defaults units", () => {
    expect(
      shipmentFieldsSchema.parse({
        customer_code: " CUST1 ",
        product_code: " SPX ",
        book_date: "2026-07-14",
      }),
    ).toMatchObject({
      customer_code: "CUST1",
      product_code: "SPX",
      book_date: "2026-07-14",
      pieces_unit: "DOX",
      is_commercial: false,
      shipper: {},
      consignee: {},
    });
  });

  it("requires book_date", () => {
    expect(() =>
      shipmentFieldsSchema.parse({
        customer_code: "C1",
        product_code: "P1",
        book_date: " ",
      }),
    ).toThrow(/Book date is required/);
  });
});

describe("shipmentPieceSchema", () => {
  it("normalizes empty optional numerics to null", () => {
    expect(shipmentPieceSchema.parse({ pieces: "2", child_awb: " " })).toEqual({
      child_awb: null,
      actual_weight_per_pc: null,
      pieces: "2",
      length: null,
      breadth: null,
      height: null,
      divisor: null,
      vol_weight: null,
      charge_weight: null,
    });
  });
});

describe("shipmentChargeSchema", () => {
  it("requires description and defaults side/type", () => {
    expect(shipmentChargeSchema.parse({ description: " Freight " })).toMatchObject({
      description: "Freight",
      side: "CUSTOMER",
      charges_type: "MANUAL",
      fuel_applies: false,
    });
  });

  it("rejects blank description", () => {
    expect(() => shipmentChargeSchema.parse({ description: "  " })).toThrow();
  });
});

describe("formatBookingValidationError", () => {
  it("parses CMS04 JSON field messages", async () => {
    const { formatBookingValidationError } = await import("@/lib/transactions/resources/shipments");
    const msg = formatBookingValidationError(
      new Error(
        'Booking validation failed: [{"field":"customer_id","message":"Customer is required"},{"field":"pieces","message":"At least one shipment piece is required"}]',
      ),
    );
    expect(msg).toContain("Customer is required");
    expect(msg).toContain("At least one shipment piece is required");
  });

  it("falls back to raw message", async () => {
    const { formatBookingValidationError } = await import("@/lib/transactions/resources/shipments");
    expect(formatBookingValidationError(new Error("Permission denied"))).toBe("Permission denied");
  });
});
