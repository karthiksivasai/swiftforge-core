import { describe, it, expect } from "vitest";

import { manifestInscanScanSchema, manifestInscanResultSchema } from "./manifestInscan";
import {
  countsFromBoard,
  expectedInscanTransition,
  isInscanTransitionAllowed,
  mapInscanScanResult,
  pendingLinesFromBoard,
  uiModeToRpcMode,
  validateInscanAttempt,
} from "@/lib/transactions/manifestInscanUiMap";

describe("manifestInscanScanSchema", () => {
  it("requires manifest_id and awb or shipment", () => {
    expect(() =>
      manifestInscanScanSchema.parse({
        manifest_id: "00000000-0000-4000-8000-000000000001",
      }),
    ).toThrow(/AWB No or shipment is required/);

    expect(
      manifestInscanScanSchema.parse({
        manifest_id: "00000000-0000-4000-8000-000000000001",
        awb_no: " 1001 ",
      }),
    ).toMatchObject({ awb_no: "1001", mode: "AWB" });
  });
});

describe("manifestInscanResultSchema", () => {
  it("parses duplicate response", () => {
    expect(
      manifestInscanResultSchema.parse({
        ok: true,
        duplicate: true,
        message: "AWB 1001 already inscanned",
        scanned_count: 1,
        pending_count: 2,
      }),
    ).toMatchObject({ duplicate: true, scanned_count: 1 });
  });
});

describe("validateInscanAttempt", () => {
  it("flags missing manifest and awb", () => {
    expect(validateInscanAttempt({ awbNo: "", mode: "awb" }, {})).toMatchObject({
      kind: "invalid",
      message: /Manifest No/,
    });
    expect(
      validateInscanAttempt(
        { awbNo: "", mode: "awb" },
        { manifestId: "00000000-0000-4000-8000-000000000001" },
      ),
    ).toMatchObject({ kind: "invalid", message: /AWB No/ });
  });

  it("detects duplicates", () => {
    const scanned = new Set(["AWB1"]);
    expect(
      validateInscanAttempt(
        { awbNo: "awb1", mode: "awb" },
        {
          manifestId: "00000000-0000-4000-8000-000000000001",
          scannedAwbs: scanned,
        },
      ),
    ).toMatchObject({ kind: "duplicate" });
  });

  it("rejects shipment not on manifest", () => {
    expect(
      validateInscanAttempt(
        { awbNo: "X", mode: "bag" },
        {
          manifestId: "00000000-0000-4000-8000-000000000001",
          knownAwbs: new Set(["A1"]),
        },
      ),
    ).toMatchObject({ kind: "invalid", message: /not on this manifest/ });
  });

  it("rejects cancelled / wrong status", () => {
    expect(
      validateInscanAttempt(
        { awbNo: "A1", mode: "awb" },
        {
          manifestId: "00000000-0000-4000-8000-000000000001",
          knownAwbs: new Set(["A1"]),
          shipmentStatusByAwb: new Map([["A1", "CANCELLED"]]),
        },
      ),
    ).toMatchObject({ kind: "invalid" });

    expect(
      validateInscanAttempt(
        { awbNo: "A1", mode: "awb" },
        {
          manifestId: "00000000-0000-4000-8000-000000000001",
          knownAwbs: new Set(["A1"]),
          shipmentStatusByAwb: new Map([["A1", "BOOKED"]]),
        },
      ),
    ).toMatchObject({ kind: "invalid", message: /MANIFESTED/ });
  });
});

describe("scan helpers + transitions", () => {
  it("maps ui mode and expected transition", () => {
    expect(uiModeToRpcMode("bag")).toBe("BAG");
    expect(uiModeToRpcMode("awb")).toBe("AWB");
    expect(expectedInscanTransition()).toEqual({
      from: "MANIFESTED",
      to: "MANIFEST_INSCANNED",
    });
    expect(isInscanTransitionAllowed("MANIFESTED", "MANIFEST_INSCANNED")).toBe(true);
    expect(isInscanTransitionAllowed("MANIFESTED", "IN_TRANSIT")).toBe(false);
  });

  it("maps scan result to toast kind", () => {
    expect(
      mapInscanScanResult({
        ok: true,
        duplicate: true,
        message: "dup",
        scanned_count: 1,
        pending_count: 0,
      }),
    ).toMatchObject({ toast: "warning", counts: { scanned: 1, pending: 0 } });

    expect(
      mapInscanScanResult({
        ok: true,
        duplicate: false,
        message: "ok",
        scanned_count: 2,
        pending_count: 1,
      }),
    ).toMatchObject({ toast: "success" });
  });

  it("derives counts and pending lines", () => {
    expect(countsFromBoard({ scanned_count: 3, pending_count: 1 })).toEqual({
      scanned: 3,
      pending: 1,
    });
    expect(
      pendingLinesFromBoard([
        { scanned: true, awb_no: "1", shipment_id: "a" },
        { scanned: false, awb_no: "2", shipment_id: "b" },
      ]),
    ).toHaveLength(1);
  });
});
