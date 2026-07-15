/**
 * Scan hub report ids → Phase 5 engine report_key.
 */
export const SCAN_HUB_KEY_MAP: Record<string, string | null> = {
  "bag-wise-detail-print": "bag-wise-detail-print",
  bagging: "bagging-report",
  "delivery-status": "delivery-status-report",
  "edi-csb-files": "edi-csb-files-report",
  forwarding: "forwarding-report",
  "volumetric-weight": "volumetric-weight-report",
};
