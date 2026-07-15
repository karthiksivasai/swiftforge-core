/**
 * Tariff Rate Report — CourierWala Statements filter form.
 */
import type { ReactNode } from "react";

import { StmtFilterLayout } from "@/components/reports/statements/filters/filter-layout";
import type { StmtFilterProps } from "@/components/reports/statements/types";
import { STATEMENT_DEFINITIONS } from "@/lib/statements-report-config";

const DEF = STATEMENT_DEFINITIONS.find((r) => r.id === "tariff-rate")!;

export type TariffRateFiltersProps = StmtFilterProps & {
  reportTypeControl: ReactNode;
};

export function TariffRateFilters({ reportTypeControl, ...props }: TariffRateFiltersProps) {
  return <StmtFilterLayout def={DEF} props={props} reportTypeControl={reportTypeControl} />;
}
