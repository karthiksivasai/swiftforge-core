/**
 * Map CourierWala Scan report ids → dedicated filter components.
 */
import type { ComponentType, ReactNode } from "react";

import { BagWiseDetailPrintFilters } from "@/components/reports/scan/filters/bag-wise-detail-print-filters";
import { BaggingFilters } from "@/components/reports/scan/filters/bagging-filters";
import { DeliveryStatusFilters } from "@/components/reports/scan/filters/delivery-status-filters";
import { EdiCsbFilesFilters } from "@/components/reports/scan/filters/edi-csb-files-filters";
import { ForwardingFilters } from "@/components/reports/scan/filters/forwarding-filters";
import { VolumetricWeightFilters } from "@/components/reports/scan/filters/volumetric-weight-filters";
import type { ScanFilterProps } from "@/components/reports/scan/types";

export type ScanFilterComponent = ComponentType<ScanFilterProps & { reportTypeControl: ReactNode }>;

export const SCAN_FILTER_COMPONENTS: Record<string, ScanFilterComponent> = {
  "bag-wise-detail-print": BagWiseDetailPrintFilters,
  bagging: BaggingFilters,
  "delivery-status": DeliveryStatusFilters,
  "edi-csb-files": EdiCsbFilesFilters,
  forwarding: ForwardingFilters,
  "volumetric-weight": VolumetricWeightFilters,
};
