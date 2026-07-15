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

/** Map legacy operations-hub demo ids → engine report_key (when 1:1). */
export const OPERATIONS_HUB_KEY_MAP: Record<string, OperationalReportKey | null> = {
  "drs-report": "drs-register",
  "manifest-report": "manifest-register",
  "manifest-pod": "pod-report",
  "mis-report": "mis-operational-summary",
  "ok-delivery": "delivery-report",
  "scan-report": "scan-reconciliation-report",
  undelivery: "undelivered-report",
  "login-log": null, // audit hub / 5E
  "action-log": null, // audit hub / 5E
  "awb-printing": null,
  "comment-view": null,
  "forwarding-no-missing": null,
  "unassigned-drs": null,
  "unassigned-manifest": null,
  "unassigned-obc": null,
  "user-analysis": null, // audit hub
  "user-entry-log": null,
};
