import { describe, it, expect } from "vitest";

import {
  canCancelDrs,
  canCompleteDrs,
  canDispatchDrs,
  canEditDrsStatus,
  canRecordDeliveryAttempt,
  canReopenDrs,
  deliveryAttemptSchema,
  drsFieldsSchema,
  drsLineSchema,
  isTerminalLineOutcome,
  isTerminalShipmentStatus,
} from "./drs";
import {
  countersFromBoard,
  deriveDeliveryCounters,
  drsStatusBadgeVariant,
  shipmentStatusLabel,
  uiFormToDrsPayload,
  validateCompletionReady,
} from "@/lib/transactions/drsUiMap";

describe("drsFieldsSchema", () => {
  it("requires drs_date", () => {
    expect(() => drsFieldsSchema.parse({ drs_date: " " })).toThrow(/DRS date is required/);
    expect(
      drsFieldsSchema.parse({
        drs_date: "2026-07-15",
        delivery_executive_code: "FE1",
      }),
    ).toMatchObject({
      drs_date: "2026-07-15",
      delivery_executive_code: "FE1",
    });
  });
});

describe("drsLineSchema", () => {
  it("accepts awb_no without shipment_id", () => {
    expect(drsLineSchema.parse({ awb_no: "1001" })).toMatchObject({ awb_no: "1001" });
  });
});

describe("deliveryAttemptSchema", () => {
  it("defaults outcome to DELIVERY_ATTEMPTED", () => {
    expect(
      deliveryAttemptSchema.parse({
        drs_id: "00000000-0000-4000-8000-000000000001",
        awb_no: "A1",
      }),
    ).toMatchObject({ outcome: "DELIVERY_ATTEMPTED", awb_no: "A1" });
  });
});

describe("DRS status helpers", () => {
  it("maps edit/dispatch/cancel rules", () => {
    expect(canEditDrsStatus("DRAFT")).toBe(true);
    expect(canEditDrsStatus("DISPATCHED")).toBe(false);
    expect(canDispatchDrs("DRAFT", 0)).toBe(false);
    expect(canDispatchDrs("DRAFT", 2)).toBe(true);
    expect(canDispatchDrs("DISPATCHED", 2)).toBe(false);
    expect(canCancelDrs("DRAFT")).toBe(true);
    expect(canCancelDrs("DISPATCHED")).toBe(false);
  });

  it("maps completion / reopen / attempt rules", () => {
    expect(canCompleteDrs("DISPATCHED", 0)).toBe(true);
    expect(canCompleteDrs("DISPATCHED", 2)).toBe(false);
    expect(canCompleteDrs("COMPLETED", 0)).toBe(false);
    expect(canReopenDrs("COMPLETED")).toBe(true);
    expect(canReopenDrs("DISPATCHED")).toBe(false);
    expect(canRecordDeliveryAttempt("DISPATCHED")).toBe(true);
    expect(canRecordDeliveryAttempt("COMPLETED")).toBe(false);
    expect(isTerminalShipmentStatus("DELIVERED_PENDING_POD")).toBe(true);
    expect(isTerminalLineOutcome("DELIVERED")).toBe(true);
    expect(isTerminalLineOutcome(null)).toBe(false);
  });

  it("maps badge variants", () => {
    expect(drsStatusBadgeVariant("DRAFT")).toBe("outline");
    expect(drsStatusBadgeVariant("DISPATCHED")).toBe("default");
    expect(drsStatusBadgeVariant("COMPLETED")).toBe("secondary");
    expect(drsStatusBadgeVariant("CANCELLED")).toBe("destructive");
  });
});

describe("DRS delivery counters + completion validation", () => {
  it("derives counters from line outcomes", () => {
    expect(
      deriveDeliveryCounters([
        { outcome: "DELIVERED", shipmentStatus: "DELIVERED_PENDING_POD" },
        { outcome: "UNDELIVERED", shipmentStatus: "UNDELIVERED" },
        { outcome: null, shipmentStatus: "OUT_FOR_DELIVERY" },
        { outcome: null, shipmentStatus: "DELIVERY_ATTEMPTED" },
      ]),
    ).toEqual({
      total: 4,
      delivered: 1,
      undelivered: 1,
      pending: 2,
      attempted: 1,
      outForDelivery: 1,
    });
  });

  it("maps board counters", () => {
    expect(
      countersFromBoard({
        total: 3,
        pending: 1,
        delivered: 1,
        undelivered: 1,
        attempted: 0,
        out_for_delivery: 1,
      }),
    ).toMatchObject({ pending: 1, delivered: 1, outForDelivery: 1 });
  });

  it("validates completion readiness", () => {
    expect(validateCompletionReady(2)).toMatchObject({ ok: false });
    expect(validateCompletionReady(0)).toMatchObject({ ok: true });
  });

  it("labels shipment statuses", () => {
    expect(shipmentStatusLabel("DELIVERED_PENDING_POD")).toMatch(/pending POD/i);
    expect(shipmentStatusLabel("UNDELIVERED")).toBe("Undelivered");
  });
});

describe("uiFormToDrsPayload", () => {
  it("maps field executive and lines", () => {
    const { fields, lines } = uiFormToDrsPayload({
      drsNo: "",
      drsDate: "2026-07-15",
      drsTime: "1430",
      area: { code: "HYD", name: "Hyderabad" },
      areaSeq: "1",
      fieldExecutive: { code: "FE1", name: "Rider" },
      vehicleNo: "TS09",
      remark: "run",
      awbLines: [
        {
          id: "1",
          shipmentId: "00000000-0000-4000-8000-000000000001",
          awbNo: "A1",
          bookDate: "",
          origin: "HYD",
          destination: "BLR",
          customer: "C",
          consignee: "N",
          pcs: "1",
          weight: "2",
          ewayBillNo: "",
          shipmentValue: "",
        },
      ],
    });
    expect(fields).toMatchObject({
      drs_date: "2026-07-15",
      drs_time: "14:30",
      delivery_executive_code: "FE1",
      area_code: "HYD",
      vehicle_no: "TS09",
    });
    expect(lines[0]).toMatchObject({
      awb_no: "A1",
      shipment_id: "00000000-0000-4000-8000-000000000001",
    });
  });
});
