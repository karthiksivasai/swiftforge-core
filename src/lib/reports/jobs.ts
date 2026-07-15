/**
 * Report job RPCs — Milestone 5G.
 */
import { supabase } from "@/integrations/supabase/client";
import { translateDbError } from "@/lib/masters/core/baseCrud";
import type {
  ReportExportFormat,
  ReportJobDetail,
  ReportJobDownload,
  ReportJobListItem,
  ReportJobListResult,
  ReportJobStatus,
} from "@/lib/reports/jobTypes";
import type { ReportFilterValues } from "@/lib/reports/types";

function asObject(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return {};
}

function asArray<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

function mapJob(row: Record<string, unknown>): ReportJobListItem {
  return {
    id: String(row.id ?? ""),
    report_key: String(row.report_key ?? ""),
    report_title: (row.report_title as string | null) ?? null,
    output_format:
      (String(row.output_format ?? "CSV").toUpperCase() as ReportExportFormat) || "CSV",
    status: String(row.status ?? "QUEUED") as ReportJobStatus,
    progress: Number(row.progress ?? 0),
    file_id: (row.file_id as string | null) ?? null,
    row_count: Number(row.row_count ?? 0),
    error_message: (row.error_message as string | null) ?? null,
    requested_by: (row.requested_by as string | null) ?? null,
    started_at: (row.started_at as string | null) ?? null,
    completed_at: (row.completed_at as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export async function createReportJob(params: {
  reportKey: string;
  filters: ReportFilterValues;
  outputFormat: ReportExportFormat;
}): Promise<ReportJobListItem> {
  const { data, error } = await supabase.rpc("create_report_job", {
    p_report_key: params.reportKey,
    p_filters: params.filters,
    p_output_format: params.outputFormat,
  });
  if (error) throw translateDbError(error);
  return mapJob(asObject(data));
}

export async function listReportJobs(params?: {
  status?: string | null;
  reportKey?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<ReportJobListResult> {
  const { data, error } = await supabase.rpc("list_report_jobs", {
    p_status: params?.status ?? null,
    p_report_key: params?.reportKey ?? null,
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

export async function getReportJob(jobId: string): Promise<ReportJobDetail> {
  const { data, error } = await supabase.rpc("get_report_job", {
    p_job_id: jobId,
  });
  if (error) throw translateDbError(error);
  const row = asObject(data);
  const base = mapJob(row);
  const dl = row.download && typeof row.download === "object" ? asObject(row.download) : null;
  const download: ReportJobDownload | null = dl
    ? {
        file_id: String(dl.file_id ?? ""),
        original_name: String(dl.original_name ?? "export"),
        mime: (dl.mime as string | null) ?? null,
        size_bytes: dl.size_bytes == null ? null : Number(dl.size_bytes),
        storage_key: String(dl.storage_key ?? ""),
        content_base64: (dl.content_base64 as string | null) ?? null,
      }
    : null;
  return {
    ...base,
    filters: (row.filters as Record<string, unknown>) ?? {},
    download,
  };
}

export async function cancelReportJob(jobId: string): Promise<ReportJobListItem> {
  const { data, error } = await supabase.rpc("cancel_report_job", {
    p_job_id: jobId,
  });
  if (error) throw translateDbError(error);
  return mapJob(asObject(data));
}

export async function executeReportJob(jobId: string): Promise<ReportJobListItem> {
  const { data, error } = await supabase.rpc("execute_report_job", {
    p_job_id: jobId,
  });
  if (error) throw translateDbError(error);
  return mapJob(asObject(data));
}

/** Trigger browser download from get_report_job download payload. */
export function downloadReportJobArtifact(download: ReportJobDownload): void {
  if (!download.content_base64) {
    throw new Error("No download content available for this job");
  }
  const binary = atob(download.content_base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], {
    type: download.mime || "application/octet-stream",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = download.original_name || "report-export";
  a.click();
  URL.revokeObjectURL(url);
}
