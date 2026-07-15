import { describe, expect, it } from "vitest";

import {
  getAccountsReport,
  listAccountsReports,
  validateAccountsForm,
} from "@/lib/reports/accounts/api";
import { emptyAccountsForm } from "@/components/reports/accounts/types";
import { ACCOUNTS_FILTER_COMPONENTS } from "@/components/reports/accounts/filters/registry";
import { AR_REPORT_DEFINITIONS } from "@/lib/ar-report-config";

describe("accounts reports API", () => {
  it("lists all 3 CourierWala Accounts reports", () => {
    const list = listAccountsReports();
    expect(list).toHaveLength(3);
    expect(list.map((r) => r.label)).toEqual([
      "Ledger Ageing Report",
      "Ledger Details Report",
      "Ledger Outstanding Report",
    ]);
  });

  it("has a filter component for every definition", () => {
    for (const def of AR_REPORT_DEFINITIONS) {
      expect(ACCOUNTS_FILTER_COMPONENTS[def.id]).toBeTypeOf("function");
    }
  });

  it("maps engine keys for all three ledger reports", () => {
    expect(getAccountsReport("ledger-ageing")?.engineKey).toBe("ageing-summary");
    expect(getAccountsReport("ledger-details")?.engineKey).toBe("outstanding-detail");
    expect(getAccountsReport("ledger-outstanding")?.engineKey).toBe("customer-outstanding-report");
  });

  it("enforces 31-day period", () => {
    const def = getAccountsReport("ledger-ageing")!;
    const form = emptyAccountsForm("ledger-ageing");
    form.fromDate = "2026-01-01";
    form.toDate = "2026-03-01";
    expect(validateAccountsForm(def, form).ok).toBe(false);
  });
});
