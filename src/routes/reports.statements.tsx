/**
 * Statements hub — CourierWala Report Type dropdown over Phase 5 FINANCIAL pack.
 */
import { createFileRoute } from "@tanstack/react-router";

import { ReportHubShell } from "@/components/reports/report-hub-shell";
import { FINANCIAL_REPORT_KEYS } from "@/lib/reports";

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
  return (
    <ReportHubShell
      hubLabel="Statements"
      hubs={["FINANCIAL"]}
      allowedKeys={FINANCIAL_REPORT_KEYS}
    />
  );
}
