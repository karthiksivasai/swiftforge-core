import { describe, it, expect } from "vitest";

import { countryCreateSchema } from "./countries";
import { areaCreateSchema } from "./areas";
import { destinationCreateSchema } from "./destinations";
import { pincodeCreateSchema } from "./pincodes";

const UUID = "11111111-1111-1111-1111-111111111111";

describe("countryCreateSchema", () => {
  it("trims required text and normalizes empty optionals to null", () => {
    const out = countryCreateSchema.parse({
      code: "  IN  ",
      name: "  India  ",
      currency: "",
      isd_code: "",
    });
    expect(out).toEqual({
      code: "IN",
      name: "India",
      weight_unit: null,
      currency: null,
      isd_code: null,
    });
  });

  it("rejects blank required fields", () => {
    expect(() => countryCreateSchema.parse({ code: "   ", name: "India" })).toThrow(
      /Code is required/,
    );
  });

  it("accepts a valid enum and rejects an invalid one", () => {
    expect(
      countryCreateSchema.parse({ code: "IN", name: "India", weight_unit: "KGS" }),
    ).toMatchObject({ weight_unit: "KGS" });
    expect(() =>
      countryCreateSchema.parse({ code: "IN", name: "India", weight_unit: "TONS" }),
    ).toThrow();
  });
});

describe("areaCreateSchema", () => {
  it("uppercases name and passes through the branch uuid", () => {
    const out = areaCreateSchema.parse({ branch_id: UUID, name: "south zone" });
    expect(out).toEqual({ branch_id: UUID, name: "SOUTH ZONE", destination_id: null });
  });

  it("requires a valid branch uuid", () => {
    expect(() => areaCreateSchema.parse({ branch_id: "", name: "X" })).toThrow(/Branch/);
  });

  it("normalizes an empty optional fk to null", () => {
    const out = areaCreateSchema.parse({ branch_id: UUID, name: "x", destination_id: "" });
    expect(out.destination_id).toBeNull();
  });
});

describe("destinationCreateSchema", () => {
  it("applies dest_type/status defaults and nulls optional fks", () => {
    const out = destinationCreateSchema.parse({ code: "D1", name: "Dest" });
    expect(out).toMatchObject({
      dest_type: "DOMESTIC",
      status: "ACTIVE",
      country_id: null,
      state_id: null,
      zone_id: null,
      service_type: null,
      email: null,
    });
  });

  it("rejects an invalid email but accepts empty", () => {
    expect(() => destinationCreateSchema.parse({ code: "D1", name: "D", email: "nope" })).toThrow(
      /valid email/,
    );
    expect(destinationCreateSchema.parse({ code: "D1", name: "D", email: "" }).email).toBeNull();
  });
});

describe("pincodeCreateSchema", () => {
  it("applies boolean defaults and nulls an absent distance", () => {
    const out = pincodeCreateSchema.parse({ pin_code: "500001" });
    expect(out).toMatchObject({
      pin_code: "500001",
      pin_name: null,
      is_oda: false,
      is_serviceable: true,
      pickup_available: false,
      distance_km: null,
    });
  });

  it("rejects a negative distance", () => {
    expect(() => pincodeCreateSchema.parse({ pin_code: "500001", distance_km: -3 })).toThrow(
      /non-negative/,
    );
  });
});
