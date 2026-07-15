import { describe, expect, it } from "vitest";

import { defaultFiltersFromDefinition } from "@/lib/reports/resources";
import type { ReportDefinition } from "@/lib/reports/types";

describe("defaultFiltersFromDefinition", () => {
  it("seeds required date filters and boolean defaults", () => {
    const def: ReportDefinition = {
      report_key: "awb-register",
      hub: "OPERATIONS",
      title: "AWB Register",
      permission_slug: "rpt.awb-report",
      filters: [
        { key: "from_date", label: "From", type: "DATE", required: true },
        { key: "to_date", label: "To", type: "DATE", required: true },
        { key: "summary", label: "Summary", type: "BOOLEAN", default: false },
        { key: "status", label: "Status", type: "ENUM", options: ["BOOKED"] },
      ],
      columns: [],
    };

    const filters = defaultFiltersFromDefinition(def);
    expect(filters.from_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(filters.to_date).toBe(filters.from_date);
    expect(filters.summary).toBe(false);
    expect(filters.status).toBe("");
  });
});
