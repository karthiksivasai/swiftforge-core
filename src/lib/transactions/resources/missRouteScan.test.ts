import { describe, expect, it } from "vitest";
import {
  findShipmentByAwb,
  isAlreadyMisrouted,
  recordMissRoute,
} from "./missRouteScan";

describe("Miss Route Scan Backend Resource & Validation Logic", () => {
  it("returns null for non-existent AWB lookup", async () => {
    const shipment = await findShipmentByAwb("NON_EXISTENT_AWB_9999");
    expect(shipment).toBeNull();
  });

  it("returns false for misroute status on non-existent AWB", async () => {
    const isMisrouted = await isAlreadyMisrouted("NON_EXISTENT_AWB_9999");
    expect(isMisrouted).toBe(false);
  });

  it("rejects recordMissRoute when the service center is empty", async () => {
    const res = await recordMissRoute({
      awbNo: "AWB1001",
      scanDate: "2026-08-20",
      scanTime: "2100",
      serviceCenter: "",
      event: "Shipment Mis routed",
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Service Center is required");
  });

  it("rejects recordMissRoute when AWB is empty", async () => {
    const res = await recordMissRoute({
      awbNo: "",
      scanDate: "2026-08-20",
      scanTime: "2100",
      serviceCenter: "HYD",
      event: "Shipment Mis routed",
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe("AWB No is required");
  });

  it("rejects recordMissRoute when AWB is not found", async () => {
    const res = await recordMissRoute({
      awbNo: "NON_EXISTENT_AWB_9999",
      scanDate: "2026-08-20",
      scanTime: "2100",
      serviceCenter: "HYD",
      event: "Shipment Mis routed",
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe("AWB not found");
  });
});
