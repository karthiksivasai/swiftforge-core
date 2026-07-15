/**
 * Accounts (AR) hub — CourierWala Report Type dropdown → per-report filters.
 */
import { createFileRoute } from "@tanstack/react-router";

import { AccountsReportPage } from "@/components/reports/accounts/accounts-report-page";

export const Route = createFileRoute("/reports/ar-report")({
  head: () => ({
    meta: [
      { title: "Accounts — Reports — Courier ERP" },
      {
        name: "description",
        content: "Accounts receivable ledger reports with CourierWala-style Report Type selection.",
      },
    ],
  }),
  component: AccountsReportsRoutePage,
});

function AccountsReportsRoutePage() {
  return <AccountsReportPage />;
}
