import { describe, expect, it } from "vitest";

import {
  isOperationalReportKey,
  OPERATIONS_HUB_KEY_MAP,
  OPERATIONAL_REPORT_KEYS,
} from "@/lib/reports/operationalKeys";

describe("operational report keys", () => {
  it("registers the 5B operational set", () => {
    expect(OPERATIONAL_REPORT_KEYS).toContain("drs-register");
    expect(OPERATIONAL_REPORT_KEYS).toContain("mis-operational-summary");
    expect(OPERATIONAL_REPORT_KEYS).toHaveLength(12);
  });

  it("maps known operations-hub demos to engine keys", () => {
    expect(OPERATIONS_HUB_KEY_MAP["drs-report"]).toBe("drs-register");
    expect(OPERATIONS_HUB_KEY_MAP["ok-delivery"]).toBe("delivery-report");
    expect(OPERATIONS_HUB_KEY_MAP["login-log"]).toBeNull();
  });

  it("type-guards report keys", () => {
    expect(isOperationalReportKey("awb-register")).toBe(true);
    expect(isOperationalReportKey("customer-ledger")).toBe(false);
  });
});
