import { describe, expect, it } from "vitest";

import { AR_HUB_KEY_MAP, AR_REPORT_KEYS, isArReportKey } from "@/lib/reports/arKeys";
import { defaultFiltersFromDefinition } from "@/lib/reports/resources";
import type { ReportDefinition } from "@/lib/reports/types";

describe("AR report keys", () => {
  it("registers the 5D AR set", () => {
    expect(AR_REPORT_KEYS).toContain("ageing-summary");
    expect(AR_REPORT_KEYS).toContain("as-on-date-outstanding");
    expect(AR_REPORT_KEYS).toHaveLength(8);
  });

  it("maps legacy AR hub demos", () => {
    expect(AR_HUB_KEY_MAP["ledger-ageing"]).toBe("ageing-summary");
    expect(AR_HUB_KEY_MAP["ledger-outstanding"]).toBe("customer-outstanding-report");
  });

  it("type-guards keys", () => {
    expect(isArReportKey("customer-statement")).toBe(true);
    expect(isArReportKey("receipt-register")).toBe(false);
  });
});

describe("defaultFiltersFromDefinition as_on_date", () => {
  it("defaults as_on_date for AR definitions", () => {
    const def: ReportDefinition = {
      report_key: "ageing-summary",
      hub: "AR",
      title: "Ageing",
      permission_slug: "rpt.ar-report",
      filters: [{ key: "as_on_date", label: "As On", type: "DATE", required: true }],
      columns: [],
    };
    const filters = defaultFiltersFromDefinition(def);
    expect(filters.as_on_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
