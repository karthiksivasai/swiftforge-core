/**
 * Manifest Inscan UI helpers — Phase 4 Milestone 4B.
 * Pure validation / mapping for scan flow (live + demo).
 */

export type ScanModeUi = "bag" | "awb";

export type InscanCounts = {
  scanned: number;
  pending: number;
};

export type ScanAttempt = {
  awbNo: string;
  shipmentId?: string;
  bagNo?: string;
  mode: ScanModeUi;
};

export type ScanDecision =
  | { kind: "invalid"; message: string }
  | { kind: "duplicate"; message: string }
  | { kind: "ok"; message: string };

const INVALID_STATUS = new Set(["CANCELLED", "VOID", "DRAFT", "BOOKED"]);

/** Map UI bag|awb mode to RPC AWB|BAG. */
export function uiModeToRpcMode(mode: ScanModeUi): "AWB" | "BAG" {
  return mode === "bag" ? "BAG" : "AWB";
}

/** Expected shipment transition for a first-time inscan. */
export function expectedInscanTransition(): { from: string; to: string } {
  return { from: "MANIFESTED", to: "MANIFEST_INSCANNED" };
}

export function isInscanTransitionAllowed(fromStatus: string, toStatus: string): boolean {
  const expected = expectedInscanTransition();
  return fromStatus === expected.from && toStatus === expected.to;
}

/**
 * Client-side validation before calling scan_manifest / demo save.
 * Does not replace server CMS04 checks.
 */
export function validateInscanAttempt(
  attempt: ScanAttempt,
  opts: {
    manifestId?: string | null;
    manifestNo?: string | null;
    knownAwbs?: Set<string>;
    scannedAwbs?: Set<string>;
    shipmentStatusByAwb?: Map<string, string>;
  },
): ScanDecision {
  const awb = attempt.awbNo.trim();
  if (!opts.manifestId && !opts.manifestNo?.trim()) {
    return { kind: "invalid", message: "Manifest No is required" };
  }
  if (!awb && !attempt.shipmentId) {
    return { kind: "invalid", message: "AWB No is required" };
  }

  const key = awb.toUpperCase();
  if (opts.scannedAwbs?.has(key) || (awb && opts.scannedAwbs?.has(awb))) {
    return { kind: "duplicate", message: `AWB ${awb || attempt.shipmentId} already inscanned` };
  }

  if (opts.knownAwbs && awb && !opts.knownAwbs.has(awb) && !opts.knownAwbs.has(key)) {
    const upperSet = new Set([...opts.knownAwbs].map((a) => a.toUpperCase()));
    if (!upperSet.has(key)) {
      return { kind: "invalid", message: "Shipment is not on this manifest" };
    }
  }

  const status = awb
    ? (opts.shipmentStatusByAwb?.get(awb) ?? opts.shipmentStatusByAwb?.get(key))
    : undefined;
  if (status && INVALID_STATUS.has(status)) {
    return { kind: "invalid", message: `Invalid shipment status for inscan (${status})` };
  }
  if (status && status === "MANIFEST_INSCANNED") {
    return { kind: "duplicate", message: `AWB ${awb} already inscanned` };
  }
  if (status && status !== "MANIFESTED" && status !== "MANIFEST_INSCANNED") {
    return { kind: "invalid", message: `Shipment must be MANIFESTED to inscan (is ${status})` };
  }

  return { kind: "ok", message: `AWB ${awb} ready to inscan` };
}

/** Map RPC/demo result to toast + counters. */
export function mapInscanScanResult(result: {
  ok: boolean;
  duplicate: boolean;
  message: string;
  scanned_count?: number;
  pending_count?: number;
}): { toast: "success" | "warning" | "error"; message: string; counts: InscanCounts | null } {
  if (!result.ok) {
    return { toast: "error", message: result.message || "Inscan failed", counts: null };
  }
  const counts =
    result.scanned_count != null && result.pending_count != null
      ? { scanned: result.scanned_count, pending: result.pending_count }
      : null;
  if (result.duplicate) {
    return { toast: "warning", message: result.message || "Already inscanned", counts };
  }
  return { toast: "success", message: result.message || "Inscanned", counts };
}

export function countsFromBoard(board: {
  scanned_count: number;
  pending_count: number;
}): InscanCounts {
  return { scanned: board.scanned_count, pending: board.pending_count };
}

export function pendingLinesFromBoard<
  T extends { scanned: boolean; awb_no: string; shipment_id: string },
>(lines: T[]): T[] {
  return lines.filter((l) => !l.scanned);
}
