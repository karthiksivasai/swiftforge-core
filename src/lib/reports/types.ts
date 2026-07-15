/**
 * Reporting framework types — Phase 5 Milestone 5A.
 * Metadata-driven; no report-specific shapes beyond the engine contract.
 */

export type ReportFilterType = "DATE" | "DATE_RANGE" | "LOOKUP" | "ENUM" | "BOOLEAN" | "TEXT";

export type ReportFilterMeta = {
  key: string;
  label: string;
  type: ReportFilterType | string;
  required?: boolean;
  lookup?: string | null;
  options?: string[] | null;
  default?: unknown;
  sort?: number;
};

export type ReportColumnMeta = {
  key: string;
  label: string;
};

export type ReportDefinition = {
  report_key: string;
  hub: string;
  title: string;
  description?: string | null;
  permission_slug: string;
  source_entity?: string;
  filters: ReportFilterMeta[];
  columns: ReportColumnMeta[];
  allowed_formats?: string[];
  default_sort?: { column?: string; dir?: string } | null;
  max_date_span_days?: number;
  export_options?: {
    formats?: string[];
    note?: string;
  };
};

export type ReportCatalogItem = {
  report_key: string;
  hub: string;
  title: string;
  description?: string | null;
  permission_slug: string;
  source_entity?: string;
  sort_order?: number;
};

export type ReportFilterValues = Record<string, string | boolean | null | undefined>;

export type ReportValidationResult = {
  ok: boolean;
  errors: Array<{ field?: string; message?: string }>;
  from_date?: string | null;
  to_date?: string | null;
};

export type ReportExecuteResult = {
  report_key: string;
  title: string;
  columns: ReportColumnMeta[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  page_size: number;
  sort_by?: string | null;
  sort_dir?: string | null;
  filters?: ReportFilterValues;
};

export type ExecuteReportParams = {
  reportKey: string;
  filters: ReportFilterValues;
  page?: number;
  pageSize?: number;
  sortBy?: string | null;
  sortDir?: "asc" | "desc";
};
