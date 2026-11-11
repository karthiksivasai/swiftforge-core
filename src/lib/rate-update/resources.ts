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

export type RateUpdatePreviewRow = {
  shipment_id: string;
  awb_no: string;
  customer_code: string | null;
  customer_name: string | null;
  old_zone: string | null;
  new_zone: string | null;
  old_freight: number;
  new_freight: number;
  old_fuel: number;
  new_fuel: number;
  old_tax: number;
  new_tax: number;
  old_total: number;
  new_total: number;
  difference: number;
  skip_reason: string | null;
};

export type RateUpdatePreview = {
  update_type: string;
  rows: RateUpdatePreviewRow[];
  change_count: number;
  skip_count: number;
  unchanged_count: number;
  difference_total: number;
  truncated: boolean;
  omitted_count: number;
};

export type RateUpdateApplyResult = {
  applied: number;
  skipped: number;
  unchanged: number;
  difference_total: number;
};

function mapPreviewRow(row: Record<string, unknown>): RateUpdatePreviewRow {
  return {
    shipment_id: String(row.shipment_id ?? ""),
    awb_no: String(row.awb_no ?? ""),
    customer_code: (row.customer_code as string | null) ?? null,
    customer_name: (row.customer_name as string | null) ?? null,
    old_zone: (row.old_zone as string | null) ?? null,
    new_zone: (row.new_zone as string | null) ?? null,
    old_freight: Number(row.old_freight ?? 0),
    new_freight: Number(row.new_freight ?? 0),
    old_fuel: Number(row.old_fuel ?? 0),
    new_fuel: Number(row.new_fuel ?? 0),
    old_tax: Number(row.old_tax ?? 0),
    new_tax: Number(row.new_tax ?? 0),
    old_total: Number(row.old_total ?? 0),
    new_total: Number(row.new_total ?? 0),
    difference: Number(row.difference ?? 0),
    skip_reason: (row.skip_reason as string | null) ?? null,
  };
}

export async function previewRateUpdate(params: {
  updateType: RateUpdateType;
  filters: RateUpdateFilters & Record<string, unknown>;
}): Promise<RateUpdatePreview> {
  const { data, error } = await supabase.rpc("preview_rate_update", {
    p_update_type: params.updateType,
    p_filters: params.filters,
  });
  if (error) throw translateDbError(error);
  const row = asObject(data);
  return {
    update_type: String(row.update_type ?? params.updateType),
    rows: asArray<Record<string, unknown>>(row.rows).map(mapPreviewRow),
    change_count: Number(row.change_count ?? 0),
    skip_count: Number(row.skip_count ?? 0),
    unchanged_count: Number(row.unchanged_count ?? 0),
    difference_total: Number(row.difference_total ?? 0),
    truncated: Boolean(row.truncated),
    omitted_count: Number(row.omitted_count ?? 0),
  };
}

export async function applyRateUpdate(params: {
  updateType: RateUpdateType;
  filters: RateUpdateFilters & Record<string, unknown>;
}): Promise<RateUpdateApplyResult> {
  const { data, error } = await supabase.rpc("apply_rate_update", {
    p_update_type: params.updateType,
    p_filters: params.filters,
  });
  if (error) throw translateDbError(error);
  const row = asObject(data);
  return {
    applied: Number(row.applied ?? 0),
    skipped: Number(row.skipped ?? 0),
    unchanged: Number(row.unchanged ?? 0),
    difference_total: Number(row.difference_total ?? 0),
  };
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
