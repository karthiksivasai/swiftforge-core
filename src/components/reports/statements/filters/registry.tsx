/**
 * Map CourierWala Statements report ids → dedicated filter components.
 */
import type { ComponentType, ReactNode } from "react";

import { CashCollectionFilters } from "@/components/reports/statements/filters/cash-collection-filters";
import { CustomerAwbStockFilters } from "@/components/reports/statements/filters/customer-awb-stock-filters";
import { CustomerRegisterProfitFilters } from "@/components/reports/statements/filters/customer-register-profit-filters";
import { CustomerSummaryFilters } from "@/components/reports/statements/filters/customer-summary-filters";
import { DailyReportFilters } from "@/components/reports/statements/filters/daily-report-filters";
import { DestinationSummaryFilters } from "@/components/reports/statements/filters/destination-summary-filters";
import { LocationSummaryFilters } from "@/components/reports/statements/filters/location-summary-filters";
import { ObcReportChecklistFilters } from "@/components/reports/statements/filters/obc-report-checklist-filters";
import { ProductSummaryFilters } from "@/components/reports/statements/filters/product-summary-filters";
import { SalesExecutiveWiseSalesFilters } from "@/components/reports/statements/filters/sales-executive-wise-sales-filters";
import { TariffRateFilters } from "@/components/reports/statements/filters/tariff-rate-filters";
import { TaxReportFilters } from "@/components/reports/statements/filters/tax-report-filters";
import { VendorProfitFilters } from "@/components/reports/statements/filters/vendor-profit-filters";
import type { StmtFilterProps } from "@/components/reports/statements/types";

export type StmtFilterComponent = ComponentType<StmtFilterProps & { reportTypeControl: ReactNode }>;

export const STATEMENT_FILTER_COMPONENTS: Record<string, StmtFilterComponent> = {
  "cash-collection": CashCollectionFilters,
  "customer-awb-stock": CustomerAwbStockFilters,
  "customer-register-profit": CustomerRegisterProfitFilters,
  "customer-summary": CustomerSummaryFilters,
  "daily-report": DailyReportFilters,
  "destination-summary": DestinationSummaryFilters,
  "location-summary": LocationSummaryFilters,
  "obc-report-checklist": ObcReportChecklistFilters,
  "product-summary": ProductSummaryFilters,
  "sales-executive-wise-sales": SalesExecutiveWiseSalesFilters,
  "tariff-rate": TariffRateFilters,
  "tax-report": TaxReportFilters,
  "vendor-profit": VendorProfitFilters,
};
