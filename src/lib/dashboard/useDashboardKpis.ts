/**
 * Loads dashboard summary KPIs and exposes mapped card models.
 */
import { useQuery } from "@tanstack/react-query";

import { summaryToKpiCards } from "@/lib/dashboard/mapSummary";
import { getDashboardSummary } from "@/lib/dashboard/resources";
import type { DashboardKpiCardModel, DashboardSummary } from "@/lib/dashboard/types";

export type DashboardKpiLoaderState = {
  summary: DashboardSummary | null;
  cards: DashboardKpiCardModel[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
};

export function useDashboardKpis(params?: {
  date?: string | null;
  branchId?: string | null;
  enabled?: boolean;
}): DashboardKpiLoaderState {
  const query = useQuery({
    queryKey: ["dashboard", "summary", params?.date ?? null, params?.branchId ?? null],
    queryFn: () =>
      getDashboardSummary({
        date: params?.date,
        branchId: params?.branchId,
      }),
    enabled: params?.enabled !== false,
  });

  const summary = query.data ?? null;
  const cards = summary ? summaryToKpiCards(summary) : [];

  return {
    summary,
    cards,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error instanceof Error ? query.error : null,
    refetch: () => {
      void query.refetch();
    },
  };
}
