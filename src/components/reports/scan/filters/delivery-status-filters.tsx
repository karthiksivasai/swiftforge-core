/**
 * Delivery Status Report — CourierWala Scan Report filter form.
 */
import type { ReactNode } from "react";

import { ScanFilterLayout } from "@/components/reports/scan/filters/filter-layout";
import type { ScanFilterProps } from "@/components/reports/scan/types";
import { SCAN_REPORT_DEFINITIONS } from "@/lib/scan-report-config";

const DEF = SCAN_REPORT_DEFINITIONS.find((r) => r.id === "delivery-status")!;

export type DeliveryStatusFiltersProps = ScanFilterProps & {
  reportTypeControl: ReactNode;
};

export function DeliveryStatusFilters({ reportTypeControl, ...props }: DeliveryStatusFiltersProps) {
  return <ScanFilterLayout def={DEF} props={props} reportTypeControl={reportTypeControl} />;
}
