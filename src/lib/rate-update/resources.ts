/**
 * Rate update job RPCs — Milestone 6B.
 */
import { supabase } from "@/integrations/supabase/client";
import { translateDbError } from "@/lib/masters/core/baseCrud";
import type {
  RateUpdateFilters,
  RateUpdateJob,
  RateUpdateJobListResult,
  RateUpdateJobStatus,
  RateUpdateType,
} from "@/lib/rate-update/types";

function asObject(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return {};
}

function asArray<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

function mapJob(row: Record<string, unknown>): RateUpdateJob {
  return {
    id: String(row.id ?? ""),
    update_type: String(row.update_type ?? "AWB_RATE") as RateUpdateType,
    filters: (row.filters as RateUpdateFilters) ?? {},
    status: String(row.status ?? "QUEUED") as RateUpdateJobStatus,
    progress: Number(row.progress ?? 0),
    total_shipments: Number(row.total_shipments ?? 0),
    processed_shipments: Number(row.processed_shipments ?? 0),
    updated_shipments: Number(row.updated_shipments ?? 0),
    skipped_shipments: Number(row.skipped_shipments ?? 0),
    failed_shipments: Number(row.failed_shipments ?? 0),
    error_message: (row.error_message as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    started_at: (row.started_at as string | null) ?? null,
    completed_at: (row.completed_at as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export async function createRateUpdateJob(params: {
  updateType: RateUpdateType;
  filters: RateUpdateFilters;
}): Promise<RateUpdateJob> {
  const { data, error } = await supabase.rpc("create_rate_update_job", {
    p_update_type: params.updateType,
    p_filters: params.filters,
  });
  if (error) throw translateDbError(error);
  return mapJob(asObject(data));
}

export async function listRateUpdateJobs(params?: {
  status?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<RateUpdateJobListResult> {
  const { data, error } = await supabase.rpc("list_rate_update_jobs", {
    p_status: params?.status ?? null,
    p_page: params?.page ?? 1,
    p_page_size: params?.pageSize ?? 20,
  });
  if (error) throw translateDbError(error);
  const row = asObject(data);
  return {
    rows: asArray<Record<string, unknown>>(row.rows).map(mapJob),
    total: Number(row.total ?? 0),
    page: Number(row.page ?? 1),
    page_size: Number(row.page_size ?? 20),
  };
}

export async function getRateUpdateJob(jobId: string): Promise<RateUpdateJob> {
  const { data, error } = await supabase.rpc("get_rate_update_job", {
    p_job_id: jobId,
  });
  if (error) throw translateDbError(error);
  return mapJob(asObject(data));
}

export async function cancelRateUpdateJob(jobId: string): Promise<RateUpdateJob> {
  const { data, error } = await supabase.rpc("cancel_rate_update_job", {
    p_job_id: jobId,
  });
  if (error) throw translateDbError(error);
  return mapJob(asObject(data));
}

export async function executeRateUpdateJob(jobId: string): Promise<RateUpdateJob> {
  const { data, error } = await supabase.rpc("execute_rate_update_job", {
    p_job_id: jobId,
  });
  if (error) throw translateDbError(error);
  return mapJob(asObject(data));
}

export function mapUiUpdateType(label: string): RateUpdateType {
  switch (label) {
    case "Vendor Rate":
      return "VENDOR_RATE";
    case "Tax & Fuel":
      return "TAX_FUEL";
    case "Vendor OBC Rate":
      return "OBC_RATE";
    default:
      return "AWB_RATE";
  }
}
