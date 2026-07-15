import { describe, expect, it } from "vitest";

import {
  FINANCIAL_REPORT_KEYS,
  isFinancialReportKey,
  STATEMENTS_HUB_KEY_MAP,
} from "@/lib/reports/financialKeys";

describe("financial report keys", () => {
  it("registers the 5C financial set", () => {
    expect(FINANCIAL_REPORT_KEYS).toContain("receipt-register");
    expect(FINANCIAL_REPORT_KEYS).toContain("ledger-register");
    expect(FINANCIAL_REPORT_KEYS).toHaveLength(8);
  });

  it("maps known statements-hub demos and defers profit", () => {
    expect(STATEMENTS_HUB_KEY_MAP["cash-collection"]).toBe("cash-collection-report");
    expect(STATEMENTS_HUB_KEY_MAP["customer-register-profit"]).toBeNull();
  });

  it("type-guards report keys", () => {
    expect(isFinancialReportKey("expense-register")).toBe(true);
    expect(isFinancialReportKey("billing-register")).toBe(false);
  });
});
