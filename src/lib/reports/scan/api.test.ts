import { describe, expect, it } from "vitest";

import { getScanReport, listScanReports, validateScanForm } from "@/lib/reports/scan/api";
import { emptyScanForm } from "@/components/reports/scan/types";
import { SCAN_FILTER_COMPONENTS } from "@/components/reports/scan/filters/registry";
import { SCAN_REPORT_DEFINITIONS } from "@/lib/scan-report-config";

describe("scan reports API", () => {
  it("lists all 6 CourierWala Scan reports", () => {
    const list = listScanReports();
    expect(list).toHaveLength(6);
    expect(list.map((r) => r.label)).toContain("Bag wise Detail Print");
    expect(list.map((r) => r.label)).toContain("Volumetric Weight Report");
  });

  it("has a filter component for every definition", () => {
    for (const def of SCAN_REPORT_DEFINITIONS) {
      expect(SCAN_FILTER_COMPONENTS[def.id]).toBeTypeOf("function");
    }
  });

  it("maps all scan reports to engine keys", () => {
    expect(getScanReport("bagging")?.engineKey).toBe("bagging-report");
    expect(getScanReport("bag-wise-detail-print")?.engineKey).toBe("bag-wise-detail-print");
    expect(getScanReport("delivery-status")?.engineKey).toBe("delivery-status-report");
    expect(getScanReport("edi-csb-files")?.engineKey).toBe("edi-csb-files-report");
    expect(getScanReport("forwarding")?.engineKey).toBe("forwarding-report");
    expect(getScanReport("volumetric-weight")?.engineKey).toBe("volumetric-weight-report");
  });

  it("requires manifest for bag-wise print and EDI CSB", () => {
    const def = getScanReport("bag-wise-detail-print")!;
    const form = emptyScanForm("bag-wise-detail-print");
    expect(validateScanForm(def, form).ok).toBe(false);
    form.manifestNo = "M-1";
    expect(validateScanForm(def, form).ok).toBe(true);
  });

  it("enforces 31-day period for dated reports", () => {
    const def = getScanReport("delivery-status")!;
    const form = emptyScanForm("delivery-status");
    form.fromDate = "2026-01-01";
    form.toDate = "2026-03-01";
    expect(validateScanForm(def, form).ok).toBe(false);
  });

  it("marks bag-wise as print action", () => {
    expect(getScanReport("bag-wise-detail-print")?.action).toBe("print");
    expect(getScanReport("bagging")?.action).toBe("search");
  });
});
