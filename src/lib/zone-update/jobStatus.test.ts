import { describe, expect, it } from "vitest";

import {
  canCancelZoneUpdateJob,
  canRetryZoneUpdateJob,
  zoneUpdateJobStatusLabel,
} from "@/lib/zone-update/jobStatus";

describe("zone update job helpers", () => {
  it("labels and gates actions", () => {
    expect(zoneUpdateJobStatusLabel("QUEUED")).toBe("Queued");
    expect(canCancelZoneUpdateJob("RUNNING")).toBe(true);
    expect(canCancelZoneUpdateJob("COMPLETED")).toBe(false);
    expect(canRetryZoneUpdateJob("FAILED")).toBe(true);
  });
});
