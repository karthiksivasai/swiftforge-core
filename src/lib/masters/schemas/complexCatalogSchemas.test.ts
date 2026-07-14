import { describe, it, expect } from "vitest";

import { chargeCreateSchema, chargeUpdateSchema, chargeDependencyIdsSchema } from "./charges";
import { airlineCreateSchema, airlineUpdateSchema } from "./airlines";

const UUID = "33333333-3333-4333-8333-333333333333";
const UUID2 = "44444444-4444-4444-8444-444444444444";

describe("chargeCreateSchema", () => {
  it("applies base_on / charge_type / boolean / numeric defaults", () => {
    expect(chargeCreateSchema.parse({ code: "FRT", name: "Freight" })).toEqual({
      code: "FRT",
      name: "Freight",
      base_on: "Actual Weight",
      charge_type: "AIRWAYBILL",
      charge_rate: 0,
      apply_fuel: false,
      apply_tax_on_fuel: false,
      apply_tax: false,
      hsn_code: null,
      sequence: 0,
    });
  });

  it("keeps supplied values and trims text", () => {
    const out = chargeCreateSchema.parse({
      code: " HAN ",
      name: " Handling ",
      base_on: "FLAT",
      charge_type: "INCOME",
      charge_rate: 12.5,
      apply_fuel: true,
      sequence: 3,
      hsn_code: "9967",
    });
    expect(out).toMatchObject({
      code: "HAN",
      name: "Handling",
      base_on: "FLAT",
      charge_type: "INCOME",
      charge_rate: 12.5,
      apply_fuel: true,
      sequence: 3,
      hsn_code: "9967",
    });
  });

  it("rejects blank code, invalid charge_type, and negative rate", () => {
    expect(() => chargeCreateSchema.parse({ code: "  ", name: "X" })).toThrow(
      /Description Code is required/,
    );
    expect(() => chargeCreateSchema.parse({ code: "C", name: "X", charge_type: "MISC" })).toThrow();
    expect(() => chargeCreateSchema.parse({ code: "C", name: "X", charge_rate: -5 })).toThrow(
      /non-negative/,
    );
  });

  it("allows partial patches on update", () => {
    expect(chargeUpdateSchema.parse({ name: "New" })).toEqual({ name: "New" });
  });
});

describe("chargeDependencyIdsSchema", () => {
  it("accepts an array of uuids (including empty)", () => {
    expect(chargeDependencyIdsSchema.parse([])).toEqual([]);
    expect(chargeDependencyIdsSchema.parse([UUID, UUID2])).toEqual([UUID, UUID2]);
  });

  it("rejects non-uuid entries", () => {
    expect(() => chargeDependencyIdsSchema.parse(["not-a-uuid"])).toThrow();
  });
});

describe("airlineCreateSchema", () => {
  it("requires a name and a product_id uuid", () => {
    expect(airlineCreateSchema.parse({ name: "Air Asia", product_id: UUID })).toEqual({
      name: "Air Asia",
      product_id: UUID,
    });
  });

  it("rejects a blank name and a non-uuid product", () => {
    expect(() => airlineCreateSchema.parse({ name: "  ", product_id: UUID })).toThrow(
      /Airline Name is required/,
    );
    expect(() => airlineCreateSchema.parse({ name: "X", product_id: "" })).toThrow(
      /Product is required/,
    );
  });

  it("allows partial patches on update", () => {
    expect(airlineUpdateSchema.parse({ name: "X" })).toEqual({ name: "X" });
  });
});
