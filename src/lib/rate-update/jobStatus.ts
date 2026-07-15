/**
 * Rate update job status helpers (reuse report-job action gating pattern).
 */
import type { RateUpdateJobStatus } from "@/lib/rate-update/types";

const LABELS: Record<RateUpdateJobStatus, string> = {
  QUEUED: "Queued",
  RUNNING: "Running",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export function rateUpdateJobStatusLabel(status: string): string {
  return LABELS[status as RateUpdateJobStatus] ?? status;
}

export function canCancelRateUpdateJob(status: string): boolean {
  return status === "QUEUED" || status === "RUNNING";
}

export function canRetryRateUpdateJob(status: string): boolean {
  return status === "FAILED" || status === "QUEUED";
}
