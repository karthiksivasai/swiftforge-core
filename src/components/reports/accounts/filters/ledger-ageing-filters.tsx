/**
 * Ledger Ageing Report — CourierWala Accounts filter form.
 */
import type { ReactNode } from "react";

import { ArFilterLayout } from "@/components/reports/accounts/filters/filter-layout";
import type { ArFilterProps } from "@/components/reports/accounts/types";
import { AR_REPORT_DEFINITIONS } from "@/lib/ar-report-config";

const DEF = AR_REPORT_DEFINITIONS.find((r) => r.id === "ledger-ageing")!;

export type LedgerAgeingFiltersProps = ArFilterProps & {
  reportTypeControl: ReactNode;
};

export function LedgerAgeingFilters({ reportTypeControl, ...props }: LedgerAgeingFiltersProps) {
  return <ArFilterLayout def={DEF} props={props} reportTypeControl={reportTypeControl} />;
}
