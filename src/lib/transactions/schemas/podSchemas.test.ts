import { describe, expect, it } from "vitest";
import {
  canCancelPod,
  canSavePod,
  canUpdatePod,
  podFieldsSchema,
  podStatusLabel,
} from "@/lib/transactions/schemas/pod";
import {
  emptyPodEntryForm,
  entryFormToFields,
  podActionsEnabled,
  podBadgeLabel,
} from "@/lib/transactions/podUiMap";

describe("pod schemas", () => {
  it("requires receiver and pod date", () => {
    expect(() => podFieldsSchema.parse({ receiver_name: "", pod_date: "" })).toThrow();
    const ok = podFieldsSchema.parse({
      receiver_name: "JOHN",
      pod_date: "2026-07-14",
      remark: "ok",
    });
    expect(ok.source).toBe("MANUAL");
  });

  it("gates save/update/cancel by shipment + pod status", () => {
    expect(canSavePod("DELIVERED_PENDING_POD")).toBe(true);
    expect(canSavePod("DELIVERED")).toBe(false);
    expect(canUpdatePod("DELIVERED", "DELIVERED")).toBe(true);
    expect(canUpdatePod("DELIVERED_PENDING_POD", "PENDING")).toBe(false);
    expect(canCancelPod("DELIVERED", "DELIVERED")).toBe(true);
  });

  it("labels statuses", () => {
    expect(podStatusLabel("DELIVERED")).toBe("Delivered");
    expect(podStatusLabel("DELIVERED_PENDING_POD")).toMatch(/pending POD/i);
  });
});

describe("podUiMap", () => {
  it("maps form fields and action flags", () => {
    const form = {
      ...emptyPodEntryForm(),
      awbNo: "A1",
      shipmentStatus: "DELIVERED_PENDING_POD",
      receiverName: "Jane",
      podDate: "2026-07-14",
      remark: "ok",
    };
    expect(entryFormToFields(form).receiver_name).toBe("Jane");
    expect(podActionsEnabled(form).save).toBe(true);
    expect(podBadgeLabel(form)).toMatch(/pending POD/i);

    const delivered = {
      ...form,
      shipmentStatus: "DELIVERED",
      podStatus: "DELIVERED",
      podId: "00000000-0000-4000-8000-000000000001",
      rowVersion: 1,
    };
    expect(podActionsEnabled(delivered).update).toBe(true);
    expect(podActionsEnabled(delivered).cancel).toBe(true);
    expect(podBadgeLabel(delivered)).toBe("Delivered");
  });
});
