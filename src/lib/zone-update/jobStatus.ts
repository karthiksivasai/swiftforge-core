/**
 * Zone update job status helpers (reuse report/rate-job action gating).
 */
import type { ZoneUpdateJobStatus } from "@/lib/zone-update/types";

const LABELS: Record<ZoneUpdateJobStatus, string> = {
  QUEUED: "Queued",
  RUNNING: "Running",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export function zoneUpdateJobStatusLabel(status: string): string {
  return LABELS[status as ZoneUpdateJobStatus] ?? status;
}

export function canCancelZoneUpdateJob(status: string): boolean {
  return status === "QUEUED" || status === "RUNNING";
}

export function canRetryZoneUpdateJob(status: string): boolean {
  return status === "FAILED" || status === "QUEUED";
}
