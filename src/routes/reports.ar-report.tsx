/**
 * AR Report hub — CourierWala Report Type dropdown over Phase 5 AR pack.
 */
import { createFileRoute } from "@tanstack/react-router";

import { ReportHubShell } from "@/components/reports/report-hub-shell";
import { AR_REPORT_KEYS } from "@/lib/reports";

export const Route = createFileRoute("/reports/ar-report")({
  head: () => ({
    meta: [
      { title: "AR Report — Reports — Courier ERP" },
      {
        name: "description",
        content: "Accounts receivable reports with CourierWala-style Report Type selection.",
      },
    ],
  }),
  component: ArReportsPage,
});

function ArReportsPage() {
  return <ReportHubShell hubLabel="AR Report" hubs={["AR"]} allowedKeys={AR_REPORT_KEYS} />;
}
