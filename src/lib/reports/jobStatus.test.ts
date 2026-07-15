import { describe, expect, it } from "vitest";

import {
  canCancelReportJob,
  canDownloadReportJob,
  canRetryReportJob,
  reportJobStatusLabel,
} from "@/lib/reports/jobStatus";

describe("report job status helpers", () => {
  it("labels known statuses", () => {
    expect(reportJobStatusLabel("QUEUED")).toBe("Queued");
    expect(reportJobStatusLabel("COMPLETED")).toBe("Completed");
  });

  it("gates actions by status", () => {
    expect(canCancelReportJob("QUEUED")).toBe(true);
    expect(canCancelReportJob("COMPLETED")).toBe(false);
    expect(canRetryReportJob("FAILED")).toBe(true);
    expect(canRetryReportJob("COMPLETED")).toBe(false);
    expect(canDownloadReportJob("COMPLETED")).toBe(true);
    expect(canDownloadReportJob("RUNNING")).toBe(false);
  });
});
