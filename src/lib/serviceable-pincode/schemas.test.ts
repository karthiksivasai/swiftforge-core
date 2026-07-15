import { describe, expect, it } from "vitest";

import { serviceableCheckSchema, serviceableSearchSchema } from "@/lib/serviceable-pincode/schemas";

describe("serviceable pincode schemas", () => {
  it("accepts pincode search", () => {
    const parsed = serviceableSearchSchema.parse({ query: "560001", mode: "pincode" });
    expect(parsed.mode).toBe("pincode");
  });

  it("requires search query", () => {
    expect(() => serviceableSearchSchema.parse({ query: "", mode: "name" })).toThrow();
  });

  it("accepts serviceability check", () => {
    const parsed = serviceableCheckSchema.parse({
      origin_pincode: "500001",
      destination_pincode: "560001",
      product_code: "SPX",
      shipment_type: "NDOX",
    });
    expect(parsed.destination_pincode).toBe("560001");
  });

  it("rejects missing destination", () => {
    expect(() =>
      serviceableCheckSchema.parse({ origin_pincode: "500001", destination_pincode: "" }),
    ).toThrow();
  });
});
