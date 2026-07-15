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

/** Map CourierWala Statements hub ids → Phase 5 engine report_key. */
export const STATEMENTS_HUB_KEY_MAP: Record<string, string | null> = {
  "cash-collection": "cash-collection-report",
  "customer-awb-stock": "customer-awb-stock-report",
  "customer-register-profit": "customer-register-profit",
  "customer-summary": "customer-summary-report",
  "daily-report": "daily-report",
  "destination-summary": "destination-summary-report",
  "location-summary": "location-summary-report",
  "obc-report-checklist": "obc-report-checklist",
  "product-summary": "product-summary-report",
  "sales-executive-wise-sales": "sales-executive-sales-report",
  "tariff-rate": "tariff-rate-report",
  "tax-report": "tax-report",
  "vendor-profit": "vendor-profit-report",
};
