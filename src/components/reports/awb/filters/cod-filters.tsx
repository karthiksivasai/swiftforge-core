/**
 * COD Report — CourierWala AWB Report filter form.
 */
import type { ReactNode } from "react";

import { AwbFilterLayout } from "@/components/reports/awb/filters/filter-layout";
import type { AwbFilterProps } from "@/components/reports/awb/types";
import { AWB_REPORT_DEFINITIONS } from "@/lib/awb-report-config";

const DEF = AWB_REPORT_DEFINITIONS.find((r) => r.id === "cod")!;

export type CodFiltersProps = AwbFilterProps & {
  reportTypeControl: ReactNode;
};

export function CodFilters({ reportTypeControl, ...props }: CodFiltersProps) {
  return <AwbFilterLayout def={DEF} props={props} reportTypeControl={reportTypeControl} />;
}
