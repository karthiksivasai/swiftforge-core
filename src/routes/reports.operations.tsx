/**
 * Operations hub — CourierWala Report Type dropdown + per-report filter forms.
 */
import { createFileRoute } from "@tanstack/react-router";

import { OperationsReportPage } from "@/components/reports/operations/operations-report-page";

export const Route = createFileRoute("/reports/operations")({
  head: () => ({
    meta: [
      { title: "Operations — Reports — Courier ERP" },
      {
        name: "description",
        content: "Operations reports with CourierWala-style Report Type selection and filters.",
      },
    ],
  }),
  component: OperationsReportPage,
});
