/**
 * Accounts receivable report keys — Milestone 5D.
 */
export const AR_REPORT_KEYS = [
  "customer-outstanding-report",
  "outstanding-summary",
  "outstanding-detail",
  "customer-statement",
  "ageing-summary",
  "ageing-detail",
  "as-on-date-outstanding",
  "customer-balance-report",
] as const;

export type ArEngineReportKey = (typeof AR_REPORT_KEYS)[number];

export function isArReportKey(key: string): key is ArEngineReportKey {
  return (AR_REPORT_KEYS as readonly string[]).includes(key);
}

/** Map legacy AR hub demo ids → engine report_key. */
export const AR_HUB_KEY_MAP: Record<string, ArEngineReportKey | null> = {
  "ledger-ageing": "ageing-summary",
  "ledger-details": "outstanding-detail",
  "ledger-outstanding": "customer-outstanding-report",
};
