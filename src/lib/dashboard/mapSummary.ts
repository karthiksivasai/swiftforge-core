/**
 * Map `get_dashboard_summary` JSON into reusable KPI card models.
 */
import type { DashboardKpiCardModel, DashboardSummary } from "@/lib/dashboard/types";

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function fmtCount(n: number): string {
  return String(Math.trunc(n));
}

function fmtAmount(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/** Flatten summary RPC payload into ordered KPI cards for the dashboard shell. */
export function summaryToKpiCards(summary: DashboardSummary): DashboardKpiCardModel[] {
  const ops = summary.operations;
  const fin = summary.finance;
  const cust = summary.customers;

  return [
    {
      key: "shipments_today",
      label: "Today's Shipments",
      value: fmtCount(ops.shipments_today),
      hint: "Booked today",
      group: "operations",
    },
    {
      key: "pickups_today",
      label: "Today's Pickups",
      value: fmtCount(ops.pickups_today),
      hint: "Pickup requests today",
      group: "operations",
    },
    {
      key: "deliveries_today",
      label: "Today's Deliveries",
      value: fmtCount(ops.deliveries_today),
      hint: "Delivered today",
      group: "operations",
    },
    {
      key: "pods_today",
      label: "Today's PODs",
      value: fmtCount(ops.pods_today),
      hint: "POD records today",
      group: "operations",
    },
    {
      key: "pending_drs",
      label: "Pending DRS",
      value: fmtCount(ops.pending_drs),
      hint: "Draft DRS",
      group: "operations",
    },
    {
      key: "pending_manifest",
      label: "Pending Manifest",
      value: fmtCount(ops.pending_manifest),
      hint: "Draft manifests",
      group: "operations",
    },
    {
      key: "pending_pickup",
      label: "Pending Pickup",
      value: fmtCount(ops.pending_pickup),
      hint: "Open / assigned",
      group: "operations",
    },
    {
      key: "active_shipments",
      label: "Active Shipments",
      value: fmtCount(ops.active_shipments),
      hint: "Not terminal",
      group: "operations",
    },
    {
      key: "receipts_today",
      label: "Today's Receipts",
      value: fmtCount(fin.receipts_today),
      hint: `Amount ${fmtAmount(fin.receipts_amount_today)}`,
      group: "finance",
    },
    {
      key: "expenses_today",
      label: "Today's Expenses",
      value: fmtCount(fin.expenses_today),
      hint: `Amount ${fmtAmount(fin.expenses_amount_today)}`,
      group: "finance",
    },
    {
      key: "pending_customer_payments",
      label: "Pending Customer Payments",
      value: fmtCount(fin.pending_customer_payments),
      hint: "Awaiting review",
      group: "finance",
    },
    {
      key: "active_customers",
      label: "Active Customers",
      value: fmtCount(cust.active_customers),
      group: "customers",
    },
    {
      key: "active_vendors",
      label: "Active Vendors",
      value: fmtCount(cust.active_vendors),
      group: "customers",
    },
  ];
}

export function parseDashboardSummary(data: unknown): DashboardSummary {
  const row =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  const ops =
    row.operations && typeof row.operations === "object"
      ? (row.operations as Record<string, unknown>)
      : {};
  const fin =
    row.finance && typeof row.finance === "object" ? (row.finance as Record<string, unknown>) : {};
  const cust =
    row.customers && typeof row.customers === "object"
      ? (row.customers as Record<string, unknown>)
      : {};

  return {
    date: String(row.date ?? ""),
    branch_id: (row.branch_id as string | null) ?? null,
    operations: {
      shipments_today: num(ops.shipments_today),
      pickups_today: num(ops.pickups_today),
      deliveries_today: num(ops.deliveries_today),
      pods_today: num(ops.pods_today),
      pending_drs: num(ops.pending_drs),
      pending_manifest: num(ops.pending_manifest),
      pending_pickup: num(ops.pending_pickup),
      active_shipments: num(ops.active_shipments),
    },
    finance: {
      receipts_today: num(fin.receipts_today),
      receipts_amount_today: num(fin.receipts_amount_today),
      expenses_today: num(fin.expenses_today),
      expenses_amount_today: num(fin.expenses_amount_today),
      pending_customer_payments: num(fin.pending_customer_payments),
    },
    customers: {
      active_customers: num(cust.active_customers),
      active_vendors: num(cust.active_vendors),
    },
    generated_at: String(row.generated_at ?? ""),
  };
}
