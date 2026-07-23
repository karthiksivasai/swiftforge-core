import { describe, expect, it } from "vitest";

import { AWB_NAV } from "@/lib/forms/awb-entry-nav-order";
import { isAwbLookupSelected, validateAwbNavField } from "@/lib/forms/awb-entry-required-fields";

const emptyForm = () => ({
  shipper: {
    origin: { code: "", name: "" },
    companyName: { code: "", name: "" },
  },
  consignee: {
    origin: { code: "", name: "" },
    companyName: { code: "", name: "" },
  },
  product: { code: "", name: "" },
  service: { code: "", name: "" },
});

describe("AWB lookup navigation validation", () => {
  it("treats a typed name-only value as selected for keyboard advance", () => {
    expect(isAwbLookupSelected({ code: "", name: "New Company" })).toBe(true);
  });

  it("allows advancing from shipper company with manual name entry", () => {
    const form = emptyForm();
    form.shipper.companyName = { code: "", name: "Manual Shipper Co" };
    expect(validateAwbNavField(AWB_NAV.SHIPPER_COMPANY, form)).toBe(true);
  });

  it("allows advancing from product with manual name entry", () => {
    const form = emptyForm();
    form.product = { code: "", name: "Documents" };
    expect(validateAwbNavField(AWB_NAV.PRODUCT, form)).toBe(true);
  });
});
