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

  it("maps all statements hub ids to engine keys", () => {
    expect(STATEMENTS_HUB_KEY_MAP["cash-collection"]).toBe("cash-collection-report");
    expect(STATEMENTS_HUB_KEY_MAP["customer-register-profit"]).toBe("customer-register-profit");
    expect(STATEMENTS_HUB_KEY_MAP["daily-report"]).toBe("daily-report");
    expect(STATEMENTS_HUB_KEY_MAP["vendor-profit"]).toBe("vendor-profit-report");
    expect(Object.values(STATEMENTS_HUB_KEY_MAP).every((v) => v != null)).toBe(true);
  });

  it("type-guards report keys", () => {
    expect(isFinancialReportKey("expense-register")).toBe(true);
    expect(isFinancialReportKey("billing-register")).toBe(false);
  });
});
