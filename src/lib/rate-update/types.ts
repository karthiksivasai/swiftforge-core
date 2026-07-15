/**
 * Rate update job types — Milestone 6B.
 */

export type RateUpdateJobStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type RateUpdateType = "AWB_RATE" | "VENDOR_RATE" | "TAX_FUEL" | "OBC_RATE";

export type RateUpdateFilters = {
  from_date: string;
  to_date: string;
  customer_id?: string | null;
  customer_code?: string | null;
  product_id?: string | null;
  product_code?: string | null;
  destination_id?: string | null;
  destination_code?: string | null;
  branch_id?: string | null;
  branch_code?: string | null;
  zone_id?: string | null;
  zone_code?: string | null;
};

export type RateUpdateJob = {
  id: string;
  update_type: RateUpdateType;
  filters: RateUpdateFilters | Record<string, unknown>;
  status: RateUpdateJobStatus;
  progress: number;
  total_shipments: number;
  processed_shipments: number;
  updated_shipments: number;
  skipped_shipments: number;
  failed_shipments: number;
  error_message: string | null;
  created_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at?: string;
};

export type RateUpdateJobListResult = {
  rows: RateUpdateJob[];
  total: number;
  page: number;
  page_size: number;
};
