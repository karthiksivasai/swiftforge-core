/**
 * Report job types — Milestone 5G.
 */

export type ReportJobStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type ReportExportFormat = "CSV" | "XLSX";

export type ReportJobListItem = {
  id: string;
  report_key: string;
  report_title?: string | null;
  output_format: ReportExportFormat;
  status: ReportJobStatus;
  progress: number;
  file_id: string | null;
  row_count: number;
  error_message: string | null;
  requested_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ReportJobDownload = {
  file_id: string;
  original_name: string;
  mime: string | null;
  size_bytes: number | null;
  storage_key: string;
  content_base64: string | null;
};

export type ReportJobDetail = ReportJobListItem & {
  filters: Record<string, unknown>;
  download: ReportJobDownload | null;
};

export type ReportJobListResult = {
  rows: ReportJobListItem[];
  total: number;
  page: number;
  page_size: number;
};
