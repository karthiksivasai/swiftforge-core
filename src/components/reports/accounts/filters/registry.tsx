/**
 * Map CourierWala Accounts report ids → dedicated filter components.
 */
import type { ComponentType, ReactNode } from "react";

import { LedgerAgeingFilters } from "@/components/reports/accounts/filters/ledger-ageing-filters";
import { LedgerDetailsFilters } from "@/components/reports/accounts/filters/ledger-details-filters";
import { LedgerOutstandingFilters } from "@/components/reports/accounts/filters/ledger-outstanding-filters";
import type { ArFilterProps } from "@/components/reports/accounts/types";

export type ArFilterComponent = ComponentType<ArFilterProps & { reportTypeControl: ReactNode }>;

export const ACCOUNTS_FILTER_COMPONENTS: Record<string, ArFilterComponent> = {
  "ledger-ageing": LedgerAgeingFilters,
  "ledger-details": LedgerDetailsFilters,
  "ledger-outstanding": LedgerOutstandingFilters,
};
