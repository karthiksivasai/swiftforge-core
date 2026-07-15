/**
 * Statements hub — CourierWala Report Type dropdown → per-report filters.
 */
import { createFileRoute } from "@tanstack/react-router";

import { StatementsReportPage } from "@/components/reports/statements/statements-report-page";

export const Route = createFileRoute("/reports/statements")({
  head: () => ({
    meta: [
      { title: "Statements — Reports — Courier ERP" },
      {
        name: "description",
        content: "Financial statement reports with CourierWala-style Report Type selection.",
      },
    ],
  }),
  component: StatementsReportsPage,
});

function StatementsReportsPage() {
  return <StatementsReportPage />;
}
