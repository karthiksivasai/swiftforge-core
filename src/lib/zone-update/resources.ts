/**
 * Zone update job RPCs — Milestone 6C.
 */
import { supabase } from "@/integrations/supabase/client";
import { translateDbError } from "@/lib/masters/core/baseCrud";
import type {
  ZoneUpdateFilters,
  ZoneUpdateJob,
  ZoneUpdateJobListResult,
  ZoneUpdateJobStatus,
} from "@/lib/zone-update/types";

function asObject(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return {};
}

function asArray<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

function mapJob(row: Record<string, unknown>): ZoneUpdateJob {
  return {
    id: String(row.id ?? ""),
    filters: (row.filters as ZoneUpdateFilters) ?? {},
    rerate_after_update: row.rerate_after_update === true || row.rerate_after_update === "true",
    status: String(row.status ?? "QUEUED") as ZoneUpdateJobStatus,
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

export async function createZoneUpdateJob(params: {
  filters: ZoneUpdateFilters;
  rerateAfterUpdate?: boolean;
}): Promise<ZoneUpdateJob> {
  const { data, error } = await supabase.rpc("create_zone_update_job", {
    p_filters: params.filters,
    p_rerate_after_update: params.rerateAfterUpdate ?? false,
  });
  if (error) throw translateDbError(error);
  return mapJob(asObject(data));
}

export async function listZoneUpdateJobs(params?: {
  status?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<ZoneUpdateJobListResult> {
  const { data, error } = await supabase.rpc("list_zone_update_jobs", {
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

export async function getZoneUpdateJob(jobId: string): Promise<ZoneUpdateJob> {
  const { data, error } = await supabase.rpc("get_zone_update_job", {
    p_job_id: jobId,
  });
  if (error) throw translateDbError(error);
  return mapJob(asObject(data));
}

export async function cancelZoneUpdateJob(jobId: string): Promise<ZoneUpdateJob> {
  const { data, error } = await supabase.rpc("cancel_zone_update_job", {
    p_job_id: jobId,
  });
  if (error) throw translateDbError(error);
  return mapJob(asObject(data));
}

export async function executeZoneUpdateJob(jobId: string): Promise<ZoneUpdateJob> {
  const { data, error } = await supabase.rpc("execute_zone_update_job", {
    p_job_id: jobId,
  });
  if (error) throw translateDbError(error);
  return mapJob(asObject(data));
}
