/**
 * Zone update job types — Milestone 6C.
 */

export type ZoneUpdateJobStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type ZoneUpdateFilters = {
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

export type ZoneUpdateJob = {
  id: string;
  filters: ZoneUpdateFilters | Record<string, unknown>;
  rerate_after_update: boolean;
  status: ZoneUpdateJobStatus;
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

export type ZoneUpdateJobListResult = {
  rows: ZoneUpdateJob[];
  total: number;
  page: number;
  page_size: number;
};
