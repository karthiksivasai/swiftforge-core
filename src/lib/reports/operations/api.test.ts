import { describe, expect, it } from "vitest";

import {
  getOperationsReport,
  listOperationsReports,
  validateOperationsForm,
} from "@/lib/reports/operations/api";
import { emptyOperationsForm } from "@/components/reports/operations/types";
import { REPORT_FILTER_COMPONENTS } from "@/components/reports/operations/filters/registry";
import { REPORT_DEFINITIONS } from "@/lib/operations-report-config";

describe("operations reports API", () => {
  it("lists all 17 CourierWala Operations reports", () => {
    const list = listOperationsReports();
    expect(list).toHaveLength(17);
    expect(list.map((r) => r.label)).toContain("Action Log");
    expect(list.map((r) => r.label)).toContain("User Entry Log Report");
  });

  it("has a filter component for every definition", () => {
    for (const def of REPORT_DEFINITIONS) {
      expect(REPORT_FILTER_COMPONENTS[def.id]).toBeTypeOf("function");
    }
  });

  it("maps engine keys for known ops + audit reports", () => {
    expect(getOperationsReport("drs-report")?.engineKey).toBe("drs-register");
    expect(getOperationsReport("action-log")?.engineKey).toBe("action-log");
    expect(getOperationsReport("login-log")?.engineKey).toBe("login-log");
    expect(getOperationsReport("user-analysis")?.engineKey).toBe("user-activity-report");
    expect(getOperationsReport("awb-printing")?.engineKey).toBe("awb-printing-report");
    expect(getOperationsReport("user-entry-log")?.engineKey).toBe("user-entry-log-report");
  });

  it("enforces 31-day period", () => {
    const def = getOperationsReport("drs-report")!;
    const form = emptyOperationsForm("drs-report");
    form.fromDate = "2026-01-01";
    form.toDate = "2026-03-01";
    const v = validateOperationsForm(def, form);
    expect(v.ok).toBe(false);
  });
});
