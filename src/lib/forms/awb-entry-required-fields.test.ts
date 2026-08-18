import { describe, expect, it } from "vitest";

import { AWB_NAV } from "@/lib/forms/awb-entry-nav-order";
import { isAwbLookupSelected, validateAwbNavField } from "@/lib/forms/awb-entry-required-fields";

const emptyForm = () => ({
  clientName: { code: "", name: "" },
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
  it("blocks advancing from client name when it is empty", () => {
    expect(validateAwbNavField(AWB_NAV.CLIENT, emptyForm())).toBe(false);
  });

  it("allows advancing from client name after a value is entered", () => {
    const form = emptyForm();
    form.clientName = { code: "C001", name: "Telangana Textiles" };
    expect(validateAwbNavField(AWB_NAV.CLIENT, form)).toBe(true);
  });

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
