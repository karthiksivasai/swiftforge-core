/**
 * AWB Printing — CourierWala Operations filter form.
 */
import type { ReactNode } from "react";

import { OpsFilterLayout } from "@/components/reports/operations/filters/filter-layout";
import type { OpsFilterProps } from "@/components/reports/operations/types";
import { REPORT_DEFINITIONS } from "@/lib/operations-report-config";

const DEF = REPORT_DEFINITIONS.find((r) => r.id === "awb-printing")!;

export type AwbPrintingFiltersProps = OpsFilterProps & {
  reportTypeControl: ReactNode;
};

export function AwbPrintingFilters({ reportTypeControl, ...props }: AwbPrintingFiltersProps) {
  return <OpsFilterLayout def={DEF} props={props} reportTypeControl={reportTypeControl} />;
}
