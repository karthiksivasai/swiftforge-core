import { describe, expect, it } from "vitest";
import { searchAwbShipments, type FilterForm } from "./awbQuery";

const emptyFilter = (): FilterForm => ({
  bookingFromDate: "",
  bookingToDate: "",
  statusFromDate: "",
  statusToDate: "",
  referenceNo: "",
  customer: { code: "", name: "" },
  vendor: { code: "", name: "" },
  origin: { code: "", name: "" },
  destination: { code: "", name: "" },
  zipCode: "",
  forwardingNo: "",
  product: "",
  deliveryVendor: { code: "", name: "" },
  consignee: "",
  runNoTo: "",
  consigneeCity: "",
  csbType: "",
  onlyPart: false,
  vendorAlt: { code: "", name: "" },
  paymentType: "",
  bagNo: "",
  deliveryService: { code: "", name: "" },
  consigneePhone: "",
  weightFrom: "",
  onlyMasterAndActual: false,
  service: "",
  airline: "",
  status: "",
  shipper: "",
  runNoFrom: "",
  weightTo: "",
  isHold: false,
  productType: "",
  rto: false,
});

describe("AWB Query Bulk Filter Search Backend Resource Logic", () => {
  it("executes searchAwbShipments with empty filter without throwing", async () => {
    const res = await searchAwbShipments(emptyFilter());
    expect(res).toBeDefined();
    expect(Array.isArray(res.rows)).toBe(true);
    expect(typeof res.totalCount).toBe("number");
  });

  it("handles filter query constraints for date and string filters", async () => {
    const filter = {
      ...emptyFilter(),
      bookingFromDate: "2026-01-01",
      bookingToDate: "2026-12-31",
      shipper: "RAJESH",
      paymentType: "Credit",
    };
    const res = await searchAwbShipments(filter);
    expect(res).toBeDefined();
    expect(Array.isArray(res.rows)).toBe(true);
  });
});
