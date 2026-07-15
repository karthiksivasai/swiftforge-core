/**
 * Dashboard KPI types — Milestone 5F (`get_dashboard_summary` / series RPCs).
 */

export type DashboardOperationsKpis = {
  shipments_today: number;
  pickups_today: number;
  deliveries_today: number;
  pods_today: number;
  pending_drs: number;
  pending_manifest: number;
  pending_pickup: number;
  active_shipments: number;
};

export type DashboardFinanceKpis = {
  receipts_today: number;
  receipts_amount_today: number;
  expenses_today: number;
  expenses_amount_today: number;
  pending_customer_payments: number;
};

export type DashboardCustomersKpis = {
  active_customers: number;
  active_vendors: number;
};

export type DashboardSummary = {
  date: string;
  branch_id: string | null;
  operations: DashboardOperationsKpis;
  finance: DashboardFinanceKpis;
  customers: DashboardCustomersKpis;
  generated_at: string;
};

export type DashboardSeriesPoint = {
  stat_date: string;
  bookings: number;
  pickups: number;
  delivered: number;
  pods: number;
  revenue: number;
  in_transit: number;
};

export type DashboardOperationsSeries = {
  from_date: string;
  to_date: string;
  branch_id: string | null;
  series: DashboardSeriesPoint[];
};

export type DashboardRefreshResult = {
  from_date: string;
  to_date: string;
  branch_rows_touched: number;
  customer_rows_touched: number;
  refreshed_at: string;
};

export type DashboardKpiCardModel = {
  key: string;
  label: string;
  value: string;
  hint?: string;
  group: "operations" | "finance" | "customers";
};
