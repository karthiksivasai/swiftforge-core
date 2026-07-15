/**
 * Dashboard resources — Milestone 5F RPCs.
 */
import { supabase } from "@/integrations/supabase/client";
import { translateDbError } from "@/lib/masters/core/baseCrud";
import { parseDashboardSummary } from "@/lib/dashboard/mapSummary";
import type {
  DashboardOperationsSeries,
  DashboardRefreshResult,
  DashboardSeriesPoint,
  DashboardSummary,
} from "@/lib/dashboard/types";

function asObject(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return {};
}

function asArray<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

export async function getDashboardSummary(params?: {
  date?: string | null;
  branchId?: string | null;
}): Promise<DashboardSummary> {
  const { data, error } = await supabase.rpc("get_dashboard_summary", {
    p_date: params?.date ?? null,
    p_branch_id: params?.branchId ?? null,
  });
  if (error) throw translateDbError(error);
  return parseDashboardSummary(data);
}

export async function refreshDashboardRollups(params?: {
  from?: string | null;
  to?: string | null;
}): Promise<DashboardRefreshResult> {
  const { data, error } = await supabase.rpc("refresh_dashboard_rollups", {
    p_from: params?.from ?? null,
    p_to: params?.to ?? null,
  });
  if (error) throw translateDbError(error);
  const row = asObject(data);
  return {
    from_date: String(row.from_date ?? ""),
    to_date: String(row.to_date ?? ""),
    branch_rows_touched: Number(row.branch_rows_touched ?? 0),
    customer_rows_touched: Number(row.customer_rows_touched ?? 0),
    refreshed_at: String(row.refreshed_at ?? ""),
  };
}

export async function getDashboardOperationsSeries(params?: {
  from?: string | null;
  to?: string | null;
  branchId?: string | null;
}): Promise<DashboardOperationsSeries> {
  const { data, error } = await supabase.rpc("get_dashboard_operations_series", {
    p_from: params?.from ?? null,
    p_to: params?.to ?? null,
    p_branch_id: params?.branchId ?? null,
  });
  if (error) throw translateDbError(error);
  const row = asObject(data);
  const series = asArray<Record<string, unknown>>(row.series).map((p): DashboardSeriesPoint => ({
    stat_date: String(p.stat_date ?? ""),
    bookings: Number(p.bookings ?? 0),
    pickups: Number(p.pickups ?? 0),
    delivered: Number(p.delivered ?? 0),
    pods: Number(p.pods ?? 0),
    revenue: Number(p.revenue ?? 0),
    in_transit: Number(p.in_transit ?? 0),
  }));
  return {
    from_date: String(row.from_date ?? ""),
    to_date: String(row.to_date ?? ""),
    branch_id: (row.branch_id as string | null) ?? null,
    series,
  };
}
