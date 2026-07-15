import { describe, expect, it } from "vitest";

import { AUDIT_HUB_KEY_MAP, AUDIT_REPORT_KEYS, isAuditReportKey } from "@/lib/reports/auditKeys";

describe("audit report keys", () => {
  it("registers the 5E audit/security set", () => {
    expect(AUDIT_REPORT_KEYS).toContain("action-log");
    expect(AUDIT_REPORT_KEYS).toContain("session-activity");
    expect(AUDIT_REPORT_KEYS).toHaveLength(10);
  });

  it("maps known hub demos", () => {
    expect(AUDIT_HUB_KEY_MAP["login-log"]).toBe("login-log");
    expect(AUDIT_HUB_KEY_MAP["user-entry-log"]).toBe("user-entry-log-report");
  });

  it("type-guards keys", () => {
    expect(isAuditReportKey("failed-login-attempts")).toBe(true);
    expect(isAuditReportKey("awb-register")).toBe(false);
  });
});
