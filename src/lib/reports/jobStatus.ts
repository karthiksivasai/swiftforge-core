/**
 * Map report job status to UI labels.
 */
import type { ReportJobStatus } from "@/lib/reports/jobTypes";

const STATUS_LABELS: Record<ReportJobStatus, string> = {
  QUEUED: "Queued",
  RUNNING: "Running",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export function reportJobStatusLabel(status: string): string {
  return STATUS_LABELS[status as ReportJobStatus] ?? status;
}

export function canCancelReportJob(status: string): boolean {
  return status === "QUEUED" || status === "RUNNING";
}

export function canRetryReportJob(status: string): boolean {
  return status === "FAILED" || status === "QUEUED";
}

export function canDownloadReportJob(status: string): boolean {
  return status === "COMPLETED";
}
