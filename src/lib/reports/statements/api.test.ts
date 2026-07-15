import { describe, expect, it } from "vitest";

import {
  getStatementsReport,
  listStatementsReports,
  validateStatementsForm,
} from "@/lib/reports/statements/api";
import { emptyStatementsForm } from "@/components/reports/statements/types";
import { STATEMENT_FILTER_COMPONENTS } from "@/components/reports/statements/filters/registry";
import { STATEMENT_DEFINITIONS } from "@/lib/statements-report-config";

describe("statements reports API", () => {
  it("lists all 13 CourierWala Statements reports", () => {
    const list = listStatementsReports();
    expect(list).toHaveLength(13);
    expect(list.map((r) => r.label)).toContain("Cash Collection Report");
    expect(list.map((r) => r.label)).toContain("Vendor Profit Report");
  });

  it("has a filter component for every definition", () => {
    for (const def of STATEMENT_DEFINITIONS) {
      expect(STATEMENT_FILTER_COMPONENTS[def.id]).toBeTypeOf("function");
    }
  });

  it("maps all statements reports to engine keys", () => {
    expect(getStatementsReport("cash-collection")?.engineKey).toBe("cash-collection-report");
    expect(getStatementsReport("customer-summary")?.engineKey).toBe("customer-summary-report");
    expect(getStatementsReport("vendor-profit")?.engineKey).toBe("vendor-profit-report");
  });

  it("enforces 31-day period", () => {
    const def = getStatementsReport("daily-report")!;
    const form = emptyStatementsForm("daily-report");
    form.fromDate = "2026-01-01";
    form.toDate = "2026-03-01";
    const v = validateStatementsForm(def, form);
    expect(v.ok).toBe(false);
  });

  it("skips date validation for AWB stock (no date fields)", () => {
    const def = getStatementsReport("customer-awb-stock")!;
    const form = emptyStatementsForm("customer-awb-stock");
    form.fromDate = "";
    form.toDate = "";
    const v = validateStatementsForm(def, form);
    expect(v.ok).toBe(true);
  });
});
