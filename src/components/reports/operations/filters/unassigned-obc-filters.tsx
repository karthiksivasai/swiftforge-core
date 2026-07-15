/**
 * Unassigned OBC Report — CourierWala Operations filter form.
 */
import type { ReactNode } from "react";

import { OpsFilterLayout } from "@/components/reports/operations/filters/filter-layout";
import type { OpsFilterProps } from "@/components/reports/operations/types";
import { REPORT_DEFINITIONS } from "@/lib/operations-report-config";

const DEF = REPORT_DEFINITIONS.find((r) => r.id === "unassigned-obc")!;

export type UnassignedObcFiltersProps = OpsFilterProps & {
  reportTypeControl: ReactNode;
};

export function UnassignedObcFilters({ reportTypeControl, ...props }: UnassignedObcFiltersProps) {
  return <OpsFilterLayout def={DEF} props={props} reportTypeControl={reportTypeControl} />;
}
