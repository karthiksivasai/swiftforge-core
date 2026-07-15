/**
 * Map CourierWala AWB report ids → dedicated filter components.
 */
import type { ComponentType, ReactNode } from "react";

import { BillingFilters } from "@/components/reports/awb/filters/billing-filters";
import { CodFilters } from "@/components/reports/awb/filters/cod-filters";
import { InvoiceFilters } from "@/components/reports/awb/filters/invoice-filters";
import { VoidFilters } from "@/components/reports/awb/filters/void-filters";
import { ZeroFilters } from "@/components/reports/awb/filters/zero-filters";
import type { AwbFilterProps } from "@/components/reports/awb/types";

export type AwbFilterComponent = ComponentType<AwbFilterProps & { reportTypeControl: ReactNode }>;

export const AWB_FILTER_COMPONENTS: Record<string, AwbFilterComponent> = {
  billing: BillingFilters,
  cod: CodFilters,
  invoice: InvoiceFilters,
  void: VoidFilters,
  zero: ZeroFilters,
};
