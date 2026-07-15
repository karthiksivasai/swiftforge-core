import { describe, expect, it, vi } from "vitest";

import {
  getCarrierAdapter,
  isSupportedCarrier,
  NotImplementedCarrierAdapter,
  RpcCarrierAdapter,
} from "@/lib/integrations/adapter";

vi.mock("@/lib/integrations/carriers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/carriers")>();
  return {
    ...actual,
    bookShipmentCarrier: vi.fn(async () => ({
      shipment_id: "s1",
      row_version: 2,
      provider_code: "FEDEX",
      booking_ref: "FXB-1",
      tracking_no: "FDX1",
      carrier_booking_status: "BOOKED",
    })),
    cancelShipmentCarrier: vi.fn(async () => ({
      shipment_id: "s1",
      row_version: 3,
      provider_code: "FEDEX",
      carrier_booking_status: "CANCELLED",
    })),
    refreshShipmentCarrierTracking: vi.fn(async () => ({
      shipment_id: "s1",
      row_version: 4,
      provider_code: "FEDEX",
      tracking_no: "FDX1",
    })),
    getShipmentCarrierLabel: vi.fn(async () => ({
      shipment_id: "s1",
      row_version: 5,
      provider_code: "FEDEX",
      file_id: "f1",
      original_name: "FEDEX-label.json",
    })),
    checkCarrierServiceability: vi.fn(async () => ({
      provider_code: "FEDEX",
      origin_pincode: "500001",
      destination_pincode: "560001",
      serviceable: true,
    })),
  };
});

describe("carrier adapter framework (7B)", () => {
  it("keeps stub for unsupported providers", async () => {
    const adapter = new NotImplementedCarrierAdapter("UPS");
    const result = await adapter.book({ shipmentId: "x" });
    expect(result.status).toBe("NOT_IMPLEMENTED");
    expect(result.message).toBe("Not Implemented");
  });

  it("registry returns RpcCarrierAdapter for FedEx / DHL / Blue Dart", () => {
    expect(getCarrierAdapter("fedex")).toBeInstanceOf(RpcCarrierAdapter);
    expect(getCarrierAdapter("DHL")).toBeInstanceOf(RpcCarrierAdapter);
    expect(getCarrierAdapter("BLUEDART")).toBeInstanceOf(RpcCarrierAdapter);
    expect(getCarrierAdapter("UPS")).toBeInstanceOf(NotImplementedCarrierAdapter);
    expect(isSupportedCarrier("FEDEX")).toBe(true);
    expect(isSupportedCarrier("UPS")).toBe(false);
  });

  it("RpcCarrierAdapter book/cancel/track/label/serviceability succeed", async () => {
    const adapter = getCarrierAdapter("FEDEX");
    const book = await adapter.book({ shipmentId: "s1", rowVersion: 1 });
    expect(book.status).toBe("SUCCESS");
    expect(book.data?.booking_ref).toBe("FXB-1");

    const cancel = await adapter.cancel({ shipmentId: "s1", rowVersion: 2 });
    expect(cancel.status).toBe("SUCCESS");

    const track = await adapter.track({ shipmentId: "s1", rowVersion: 3 });
    expect(track.status).toBe("SUCCESS");

    const label = await adapter.label({ shipmentId: "s1", rowVersion: 4 });
    expect(label.status).toBe("SUCCESS");
    expect(label.data?.file_id).toBe("f1");

    const svc = await adapter.serviceability({
      originPincode: "500001",
      destinationPincode: "560001",
    });
    expect(svc.status).toBe("SUCCESS");
    expect(svc.message).toBe("Serviceable");
  });

  it("returns ERROR when shipmentId missing", async () => {
    const adapter = getCarrierAdapter("DHL");
    const result = await adapter.book({});
    expect(result.status).toBe("ERROR");
    expect(result.message).toMatch(/shipmentId/i);
  });
});
