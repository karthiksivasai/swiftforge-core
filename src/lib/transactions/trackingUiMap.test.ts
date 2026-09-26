import { describe, expect, it } from "vitest";
import { mapTrackingToAwbQuery } from "./trackingUiMap";

describe("Tracking UI Map — Category C Shipment Details Fields", () => {
  it("maps null or missing tracking result to null", () => {
    const mapped = mapTrackingToAwbQuery({ found: false, awb_no: "MISSING" });
    expect(mapped).toBeNull();
  });

  it("maps rich shipment record to complete 45 shipmentDetails fields", () => {
    const mockResult = {
      found: true,
      awb_no: "30403927",
      current_status: "IN_TRANSIT",
      is_hold: true,
      shipment: {
        id: "shipment-uuid-1",
        awb_no: "30403927",
        book_date: "2026-08-20",
        dispatch_date: "2026-08-20",
        origin_code: "HYD",
        destination_code: "BOM",
        product_type: "SPX",
        product_code: "EXPRESS",
        product_name: "Domestic Express",
        vendor_code: "DTDC",
        service: "SURFACE",
        shipment_value: 5000,
        pieces: 2,
        actual_weight: 15.5,
        vol_weight: 18.0,
        content: "Electronics",
        instruction: "Handle with care",
        cod_amount: 500,
        manifest_no: "M-101",
        invoice_no: "INV-99",
        payment_type: "Cash",
        airline: "AI-101",
        inscan_weight: 15.5,
        is_clubbed: true,
        inscan_remark: "Weighed at hub",
        reference_no: "REF-88",
        master_awb_no: "MAWB-55",
        eawb_no: "EAWB-77",
        drs_vehicle: "TS09EA1234",
        drs_driver: "RAMESH",
        manifest_vehicle: "TS09TR9999",
        manifest_driver: "SURESH",
        assign_to: "FE_HYD_01",
        is_commercial: true,
        is_oda: false,
        cod_type: "Fixed",
        pincode_type: "Metro",
        customer_invoice: "CUST-INV-1",
        field_executive: "FE_HYD_01",
        csb_type: "CSB 4",
        drs_no: "DRS-2026-01",
        vehicle_no: "TS09EA1234",
        prs_no: "PRS-505",
        pickup_field_executive: "FE_PICKUP_02",
        pickup_no: "PICK-909",
        remark: "Priority handle",
      },
    };

    const mapped = mapTrackingToAwbQuery(mockResult as any);
    expect(mapped).not.toBeNull();
    expect(mapped?.shipmentDetails).toBeDefined();

    const d = mapped!.shipmentDetails;
    expect(d.date).toBe("20/08/2026");
    expect(d.origin).toBe("HYD");
    expect(d.destination).toBe("BOM");
    expect(d.airline).toBe("AI-101");
    expect(d.club).toBe("Yes");
    expect(d.hold).toBe("Yes");
    expect(d.eAwbNo).toBe("EAWB-77");
    expect(d.drsVehicle).toBe("TS09EA1234");
    expect(d.drsDriver).toBe("RAMESH");
    expect(d.manifestVehicle).toBe("TS09TR9999");
    expect(d.manifestDriver).toBe("SURESH");
    expect(d.assignTo).toBe("FE_HYD_01");
    expect(d.codType).toBe("Fixed");
    expect(d.prsNo).toBe("PRS-505");
    expect(d.pickupFieldExecutive).toBe("FE_PICKUP_02");
    expect(d.pickupNo).toBe("PICK-909");
  });
});
