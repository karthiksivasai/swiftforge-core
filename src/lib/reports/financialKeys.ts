/**
 * Financial report keys registered in Milestone 5C (metadata-driven).
 */
export const FINANCIAL_REPORT_KEYS = [
  "receipt-register",
  "cash-collection-report",
  "expense-register",
  "expense-authorization-report",
  "customer-payment-register",
  "customer-payment-approval-report",
  "ledger-register",
  "customer-ledger",
] as const;

export type FinancialReportKey = (typeof FINANCIAL_REPORT_KEYS)[number];

export function isFinancialReportKey(key: string): key is FinancialReportKey {
  return (FINANCIAL_REPORT_KEYS as readonly string[]).includes(key);
}

/** Map legacy statements-hub demo ids → engine report_key (when 1:1). */
export const STATEMENTS_HUB_KEY_MAP: Record<string, FinancialReportKey | null> = {
  "cash-collection": "cash-collection-report",
  "customer-register-profit": null, // deferred — insufficient profit model
  "customer-summary": null,
  "daily-report": null,
  "vendor-profit": null, // deferred
};
