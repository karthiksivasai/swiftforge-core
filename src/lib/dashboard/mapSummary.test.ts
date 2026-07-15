import { describe, expect, it } from "vitest";

import { parseDashboardSummary, summaryToKpiCards } from "@/lib/dashboard/mapSummary";

describe("parseDashboardSummary / summaryToKpiCards", () => {
  it("maps nested KPI payload into ordered cards", () => {
    const summary = parseDashboardSummary({
      date: "2026-07-14",
      branch_id: null,
      operations: {
        shipments_today: 2,
        pickups_today: 1,
        deliveries_today: 1,
        pods_today: 1,
        pending_drs: 3,
        pending_manifest: 0,
        pending_pickup: 4,
        active_shipments: 5,
      },
      finance: {
        receipts_today: 1,
        receipts_amount_today: 250.5,
        expenses_today: 2,
        expenses_amount_today: 40,
        pending_customer_payments: 1,
      },
      customers: {
        active_customers: 10,
        active_vendors: 3,
      },
      generated_at: "2026-07-14T10:00:00Z",
    });

    const cards = summaryToKpiCards(summary);
    expect(cards.find((c) => c.key === "shipments_today")?.value).toBe("2");
    expect(cards.find((c) => c.key === "receipts_today")?.hint).toContain("250.5");
    expect(cards.filter((c) => c.group === "operations")).toHaveLength(8);
    expect(cards.filter((c) => c.group === "finance")).toHaveLength(3);
    expect(cards.filter((c) => c.group === "customers")).toHaveLength(2);
  });

  it("tolerates missing nested objects", () => {
    const summary = parseDashboardSummary({});
    expect(summary.operations.shipments_today).toBe(0);
    expect(summaryToKpiCards(summary)).toHaveLength(13);
  });
});
