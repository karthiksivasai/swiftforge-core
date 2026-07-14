import { describe, it, expect } from "vitest";

import { manifestFieldsSchema, manifestLineSchema } from "./manifests";

describe("manifestFieldsSchema", () => {
  it("requires manifest_date and defaults to_type", () => {
    expect(
      manifestFieldsSchema.parse({
        manifest_date: "2026-07-14",
        to_service_center_code: "BLR",
      }),
    ).toMatchObject({
      manifest_date: "2026-07-14",
      to_type: "SERVICE_CENTER",
      manifest_kind: "OUTBOUND",
      is_locked: false,
    });
  });

  it("rejects blank manifest_date", () => {
    expect(() => manifestFieldsSchema.parse({ manifest_date: " " })).toThrow(
      /Manifest date is required/,
    );
  });
});

describe("manifestLineSchema", () => {
  it("accepts awb_no without shipment_id", () => {
    expect(manifestLineSchema.parse({ awb_no: "000001", bag_no: "B1" })).toMatchObject({
      awb_no: "000001",
      bag_no: "B1",
    });
  });
});
