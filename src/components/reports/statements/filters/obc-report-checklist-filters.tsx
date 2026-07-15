/**
 * OBC Report / Checklist — CourierWala Statements filter form.
 */
import type { ReactNode } from "react";

import { StmtFilterLayout } from "@/components/reports/statements/filters/filter-layout";
import type { StmtFilterProps } from "@/components/reports/statements/types";
import { STATEMENT_DEFINITIONS } from "@/lib/statements-report-config";

const DEF = STATEMENT_DEFINITIONS.find((r) => r.id === "obc-report-checklist")!;

export type ObcReportChecklistFiltersProps = StmtFilterProps & {
  reportTypeControl: ReactNode;
};

export function ObcReportChecklistFilters({
  reportTypeControl,
  ...props
}: ObcReportChecklistFiltersProps) {
  return <StmtFilterLayout def={DEF} props={props} reportTypeControl={reportTypeControl} />;
}
