/**
 * Reporting foundation resources — generic RPCs from 0042.
 */
import { supabase } from "@/integrations/supabase/client";
import { translateDbError } from "@/lib/masters/core/baseCrud";
import type {
  ExecuteReportParams,
  ReportCatalogItem,
  ReportDefinition,
  ReportExecuteResult,
  ReportFilterValues,
  ReportValidationResult,
} from "@/lib/reports/types";

function asObject(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return {};
}

function asArray<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

export async function listReportDefinitions(hub?: string | null): Promise<ReportCatalogItem[]> {
  const { data, error } = await supabase.rpc("list_report_definitions", {
    p_hub: hub ?? null,
  });
  if (error) throw translateDbError(error);
  return asArray<ReportCatalogItem>(data);
}

export async function getReportDefinition(reportKey: string): Promise<ReportDefinition> {
  const { data, error } = await supabase.rpc("get_report_definition", {
    p_report_key: reportKey,
  });
  if (error) throw translateDbError(error);
  const row = asObject(data);
  return {
    report_key: String(row.report_key ?? reportKey),
    hub: String(row.hub ?? ""),
    title: String(row.title ?? reportKey),
    description: (row.description as string | null) ?? null,
    permission_slug: String(row.permission_slug ?? ""),
    source_entity: row.source_entity as string | undefined,
    filters: asArray(row.filters),
    columns: asArray(row.columns),
    allowed_formats: asArray(row.allowed_formats),
    default_sort: (row.default_sort as ReportDefinition["default_sort"]) ?? null,
    max_date_span_days: Number(row.max_date_span_days ?? 31),
    export_options: (row.export_options as ReportDefinition["export_options"]) ?? undefined,
  };
}

export async function validateReportFilters(
  reportKey: string,
  filters: ReportFilterValues,
): Promise<ReportValidationResult> {
  const { data, error } = await supabase.rpc("validate_report_filters", {
    p_report_key: reportKey,
    p_filters: filters,
  });
  if (error) throw translateDbError(error);
  const row = asObject(data);
  return {
    ok: Boolean(row.ok),
    errors: asArray(row.errors),
    from_date: (row.from_date as string | null) ?? null,
    to_date: (row.to_date as string | null) ?? null,
  };
}

export async function executeReport(params: ExecuteReportParams): Promise<ReportExecuteResult> {
  const { data, error } = await supabase.rpc("execute_report", {
    p_report_key: params.reportKey,
    p_filters: params.filters,
    p_page: params.page ?? 1,
    p_page_size: params.pageSize ?? 50,
    p_sort_by: params.sortBy ?? null,
    p_sort_dir: params.sortDir ?? "desc",
  });
  if (error) throw translateDbError(error);
  const row = asObject(data);
  return {
    report_key: String(row.report_key ?? params.reportKey),
    title: String(row.title ?? ""),
    columns: asArray(row.columns),
    rows: asArray(row.rows),
    total: Number(row.total ?? 0),
    page: Number(row.page ?? 1),
    page_size: Number(row.page_size ?? params.pageSize ?? 50),
    sort_by: (row.sort_by as string | null) ?? null,
    sort_dir: (row.sort_dir as string | null) ?? null,
    filters: (row.filters as ReportFilterValues) ?? params.filters,
  };
}

/** Build default filter bag from definition metadata. */
export function defaultFiltersFromDefinition(def: ReportDefinition): ReportFilterValues {
  const today = new Date().toISOString().slice(0, 10);
  const out: ReportFilterValues = {};
  for (const f of def.filters ?? []) {
    if (
      f.type === "DATE" &&
      (f.key === "from_date" || f.key === "to_date" || f.key === "as_on_date")
    ) {
      out[f.key] = today;
      continue;
    }
    if (f.type === "BOOLEAN") {
      out[f.key] = Boolean(f.default ?? false);
      continue;
    }
    if (f.default !== undefined && f.default !== null) {
      out[f.key] = String(f.default);
      continue;
    }
    out[f.key] = "";
  }
  if (out.from_date === undefined && def.filters?.some((f) => f.key === "from_date")) {
    out.from_date = today;
  }
  if (out.to_date === undefined && def.filters?.some((f) => f.key === "to_date")) {
    out.to_date = today;
  }
  if (out.as_on_date === undefined && def.filters?.some((f) => f.key === "as_on_date")) {
    out.as_on_date = today;
  }
  return out;
}
