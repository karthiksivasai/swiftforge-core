/**
 * Audit & security report keys — Milestone 5E.
 */
export const AUDIT_REPORT_KEYS = [
  "action-log",
  "module-action-log",
  "record-history-report",
  "user-activity-report",
  "permission-change-report",
  "login-log",
  "failed-login-attempts",
  "session-activity",
  "forced-logout-history",
  "authentication-activity",
] as const;

export type AuditReportKey = (typeof AUDIT_REPORT_KEYS)[number];

export function isAuditReportKey(key: string): key is AuditReportKey {
  return (AUDIT_REPORT_KEYS as readonly string[]).includes(key);
}

/** Map Operations/Audit hub demo ids → engine report_key. */
export const AUDIT_HUB_KEY_MAP: Record<string, string | null> = {
  "action-log": "action-log",
  "login-log": "login-log",
  "user-analysis": "user-activity-report",
  "user-entry-log": "user-entry-log-report",
};
