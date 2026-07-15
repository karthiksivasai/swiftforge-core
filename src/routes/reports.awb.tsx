/**
 * AWB hub — CourierWala Report Type dropdown → per-report filters.
 */
import { createFileRoute } from "@tanstack/react-router";

import { AwbReportPage } from "@/components/reports/awb/awb-report-page";

export const Route = createFileRoute("/reports/awb")({
  head: () => ({
    meta: [
      { title: "AWB — Reports — Courier ERP" },
      {
        name: "description",
        content: "Generate AWB reports with billing, invoice, COD, void, and zero report filters.",
      },
    ],
  }),
  component: AwbReportsRoutePage,
});

function AwbReportsRoutePage() {
  return <AwbReportPage />;
}
