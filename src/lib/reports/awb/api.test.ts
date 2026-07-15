import { describe, expect, it } from "vitest";

import { getAwbReport, listAwbReports, validateAwbForm } from "@/lib/reports/awb/api";
import { emptyAwbForm } from "@/components/reports/awb/types";
import { AWB_FILTER_COMPONENTS } from "@/components/reports/awb/filters/registry";
import { AWB_REPORT_DEFINITIONS } from "@/lib/awb-report-config";

describe("awb reports API", () => {
  it("lists all 5 CourierWala AWB reports", () => {
    const list = listAwbReports();
    expect(list).toHaveLength(5);
    expect(list.map((r) => r.label)).toEqual([
      "Billing Report",
      "COD Report",
      "Invoice Report",
      "Void Report",
      "Zero Report",
    ]);
  });

  it("has a filter component for every definition", () => {
    for (const def of AWB_REPORT_DEFINITIONS) {
      expect(AWB_FILTER_COMPONENTS[def.id]).toBeTypeOf("function");
    }
  });

  it("maps all AWB reports to engine keys", () => {
    expect(getAwbReport("billing")?.engineKey).toBe("billing-report");
    expect(getAwbReport("cod")?.engineKey).toBe("cod-report");
    expect(getAwbReport("invoice")?.engineKey).toBe("invoice-report");
    expect(getAwbReport("void")?.engineKey).toBe("void-report");
    expect(getAwbReport("zero")?.engineKey).toBe("zero-report");
  });

  it("enforces 31-day period", () => {
    const def = getAwbReport("billing")!;
    const form = emptyAwbForm("billing");
    form.fromDate = "2026-01-01";
    form.toDate = "2026-03-01";
    const v = validateAwbForm(def, form);
    expect(v.ok).toBe(false);
  });
});
