/**
 * Destination Summary Report — CourierWala Statements filter form.
 */
import type { ReactNode } from "react";

import { StmtFilterLayout } from "@/components/reports/statements/filters/filter-layout";
import type { StmtFilterProps } from "@/components/reports/statements/types";
import { STATEMENT_DEFINITIONS } from "@/lib/statements-report-config";

const DEF = STATEMENT_DEFINITIONS.find((r) => r.id === "destination-summary")!;

export type DestinationSummaryFiltersProps = StmtFilterProps & {
  reportTypeControl: ReactNode;
};

export function DestinationSummaryFilters({
  reportTypeControl,
  ...props
}: DestinationSummaryFiltersProps) {
  return <StmtFilterLayout def={DEF} props={props} reportTypeControl={reportTypeControl} />;
}
