/**
 * Forwarding No Missing Report — CourierWala Operations filter form.
 */
import type { ReactNode } from "react";

import { OpsFilterLayout } from "@/components/reports/operations/filters/filter-layout";
import type { OpsFilterProps } from "@/components/reports/operations/types";
import { REPORT_DEFINITIONS } from "@/lib/operations-report-config";

const DEF = REPORT_DEFINITIONS.find((r) => r.id === "forwarding-no-missing")!;

export type ForwardingNoMissingFiltersProps = OpsFilterProps & {
  reportTypeControl: ReactNode;
};

export function ForwardingNoMissingFilters({
  reportTypeControl,
  ...props
}: ForwardingNoMissingFiltersProps) {
  return <OpsFilterLayout def={DEF} props={props} reportTypeControl={reportTypeControl} />;
}
