/**
 * Operational report keys registered in Milestone 5B (metadata-driven).
 * Hub screens link into ReportRunner — no per-report UI.
 */
export const OPERATIONAL_REPORT_KEYS = [
  "pickup-register",
  "awb-register",
  "manifest-register",
  "manifest-inscan-report",
  "drs-register",
  "pod-report",
  "tracking-history",
  "shipment-status-report",
  "undelivered-report",
  "delivery-report",
  "scan-reconciliation-report",
  "mis-operational-summary",
] as const;

export type OperationalReportKey = (typeof OPERATIONAL_REPORT_KEYS)[number];

export function isOperationalReportKey(key: string): key is OperationalReportKey {
  return (OPERATIONAL_REPORT_KEYS as readonly string[]).includes(key);
}

/** Map CourierWala Operations hub ids → Phase 5 engine report_key. */
export const OPERATIONS_HUB_KEY_MAP: Record<string, string | null> = {
  "drs-report": "drs-register",
  "manifest-report": "manifest-register",
  "manifest-pod": "pod-report",
  "mis-report": "mis-operational-summary",
  "ok-delivery": "delivery-report",
  "scan-report": "scan-reconciliation-report",
  undelivery: "undelivered-report",
  "login-log": null, // resolved via AUDIT_HUB_KEY_MAP
  "action-log": null, // resolved via AUDIT_HUB_KEY_MAP
  "awb-printing": "awb-printing-report",
  "comment-view": "comment-view-report",
  "forwarding-no-missing": "forwarding-no-missing-report",
  "unassigned-drs": "unassigned-drs-report",
  "unassigned-manifest": "unassigned-manifest-report",
  "unassigned-obc": "unassigned-obc-report",
  "user-analysis": null, // resolved via AUDIT_HUB_KEY_MAP
  "user-entry-log": null, // resolved via AUDIT_HUB_KEY_MAP
};
