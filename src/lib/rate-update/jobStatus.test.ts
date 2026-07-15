import { describe, expect, it } from "vitest";

import {
  canCancelRateUpdateJob,
  canRetryRateUpdateJob,
  rateUpdateJobStatusLabel,
} from "@/lib/rate-update/jobStatus";
import { mapUiUpdateType } from "@/lib/rate-update/resources";

describe("rate update job helpers", () => {
  it("labels and gates actions", () => {
    expect(rateUpdateJobStatusLabel("QUEUED")).toBe("Queued");
    expect(canCancelRateUpdateJob("RUNNING")).toBe(true);
    expect(canCancelRateUpdateJob("COMPLETED")).toBe(false);
    expect(canRetryRateUpdateJob("FAILED")).toBe(true);
  });

  it("maps UI update types", () => {
    expect(mapUiUpdateType("AWB Entry Rate")).toBe("AWB_RATE");
    expect(mapUiUpdateType("Tax & Fuel")).toBe("TAX_FUEL");
  });
});
