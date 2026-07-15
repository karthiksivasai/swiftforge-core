/**
 * Scan hub — CourierWala Report Type dropdown → per-report filters.
 */
import { createFileRoute } from "@tanstack/react-router";

import { ScanReportPage } from "@/components/reports/scan/scan-report-page";

export const Route = createFileRoute("/reports/scan")({
  head: () => ({
    meta: [
      { title: "Scan — Reports — Courier ERP" },
      {
        name: "description",
        content: "Print and search scan reports by manifest, product, and format.",
      },
    ],
  }),
  component: ScanReportsRoutePage,
});

function ScanReportsRoutePage() {
  return <ScanReportPage />;
}
