/**
 * Bag wise Detail Print — CourierWala Scan Report filter form.
 */
import type { ReactNode } from "react";

import { ScanFilterLayout } from "@/components/reports/scan/filters/filter-layout";
import type { ScanFilterProps } from "@/components/reports/scan/types";
import { SCAN_REPORT_DEFINITIONS } from "@/lib/scan-report-config";

const DEF = SCAN_REPORT_DEFINITIONS.find((r) => r.id === "bag-wise-detail-print")!;

export type BagWiseDetailPrintFiltersProps = ScanFilterProps & {
  reportTypeControl: ReactNode;
};

export function BagWiseDetailPrintFilters({
  reportTypeControl,
  ...props
}: BagWiseDetailPrintFiltersProps) {
  return <ScanFilterLayout def={DEF} props={props} reportTypeControl={reportTypeControl} />;
}
