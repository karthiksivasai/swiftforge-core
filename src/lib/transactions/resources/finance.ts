/**
 * Finance foundation resources — receipt / expense / payment RPCs (0040).
 */
import { supabase } from "@/integrations/supabase/client";
import type { BaseRow } from "@/lib/masters/core/baseCrud";
import { ConflictError, translateDbError } from "@/lib/masters/core/baseCrud";
import { FINANCE_PERMISSIONS } from "@/lib/permissions";
import type {
  CustomerPaymentFields,
  ExpenseFields,
  ReceiptFields,
} from "@/lib/transactions/schemas/finance";

type NamedRef = { code: string; name: string } | null;

export type ReceiptRow = BaseRow & {
  receipt_no: string;
  receipt_date: string;
  customer_id: string;
  branch_id: string | null;
  bank_id: string | null;
  mode: "CASH" | "BANK";
  amount: number;
  narration: string | null;
  status: string;
  posted_at: string | null;
  customers: NamedRef;
  branches: NamedRef;
  banks: NamedRef;
};

export type ExpenseEntryRow = BaseRow & {
  entry_no: string;
  kind: "EXPENSE" | "INCOME";
  entry_date: string;
  expense_head_id: string | null;
  expense_head_code: string | null;
  expense_head_name: string | null;
  mode: "CASH" | "BANK";
  bank_id: string | null;
  branch_id: string | null;
  shipment_id: string | null;
  awb_no: string | null;
  description: string | null;
  amount: number;
  document_file_id: string | null;
  authorization_status: string;
  authorized_by: string | null;
  authorized_at: string | null;
  rejection_reason: string | null;
  branches: NamedRef;
  banks: NamedRef;
};

export type CustomerPaymentRow = BaseRow & {
  customer_id: string;
  declared_date: string;
  paid_date: string | null;
  amount: number;
  remark: string | null;
  file_id: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  customers: NamedRef;
};

const RECEIPT_COLUMNS = `
  id, tenant_id, receipt_no, receipt_date, customer_id, branch_id, bank_id,
  mode, amount, narration, status, posted_at, posted_by,
  created_at, created_by, updated_at, updated_by, deleted_at, row_version,
  customers(code,name), branches(code,name), banks(code,name)
`
  .replace(/\s+/g, " ")
  .trim();

const EXPENSE_COLUMNS = `
  id, tenant_id, entry_no, kind, entry_date, expense_head_id, expense_head_code,
  expense_head_name, mode, bank_id, branch_id, shipment_id, awb_no, description,
  amount, document_file_id, authorization_status, authorized_by, authorized_at,
  rejection_reason,
  created_at, created_by, updated_at, updated_by, deleted_at, row_version,
  branches(code,name), banks(code,name)
`
  .replace(/\s+/g, " ")
  .trim();

const PAYMENT_COLUMNS = `
  id, tenant_id, customer_id, declared_date, paid_date, amount, remark, file_id,
  status, reviewed_by, reviewed_at, rejection_reason,
  created_at, created_by, updated_at, updated_by, deleted_at, row_version,
  customers(code,name)
`
  .replace(/\s+/g, " ")
  .trim();

export const receiptsResource = {
  key: "receipts",
  table: "receipts",
  permission: FINANCE_PERMISSIONS.receiptEntry,
  label: { singular: "Receipt", plural: "Receipts" },
};

export const expenseEntriesResource = {
  key: "expense_entries",
  table: "expense_entries",
  permission: FINANCE_PERMISSIONS.expenseEntry,
  label: { singular: "Expense", plural: "Expenses" },
};

export const customerPaymentsResource = {
  key: "customer_payments",
  table: "customer_payments",
  permission: FINANCE_PERMISSIONS.customerPay,
  label: { singular: "Customer Payment", plural: "Customer Payments" },
};

function mapReceipt(raw: Record<string, unknown>): ReceiptRow {
  return raw as unknown as ReceiptRow;
}
function mapExpense(raw: Record<string, unknown>): ExpenseEntryRow {
  return raw as unknown as ExpenseEntryRow;
}
function mapPayment(raw: Record<string, unknown>): CustomerPaymentRow {
  return raw as unknown as CustomerPaymentRow;
}

export async function listReceipts(opts?: { pageSize?: number }): Promise<{ rows: ReceiptRow[] }> {
  const { data, error } = await supabase
    .from("receipts")
    .select(RECEIPT_COLUMNS)
    .is("deleted_at", null)
    .order("receipt_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(opts?.pageSize ?? 500);
  if (error) throw translateDbError(error);
  return { rows: (data ?? []).map((r) => mapReceipt(r as unknown as Record<string, unknown>)) };
}

export async function saveReceipt(input: {
  id?: string | null;
  row_version?: number | null;
  fields: ReceiptFields;
}): Promise<ReceiptRow> {
  const { data, error } = await supabase.rpc("save_receipt", {
    p_id: input.id ?? null,
    p_row_version: input.row_version ?? null,
    p_fields: input.fields,
  });
  if (error) throw translateDbError(error);
  return mapReceipt(data as Record<string, unknown>);
}

export async function postReceipt(input: { id: string; row_version: number }): Promise<ReceiptRow> {
  const { data, error } = await supabase.rpc("post_receipt", {
    p_id: input.id,
    p_row_version: input.row_version,
  });
  if (error) throw translateDbError(error);
  if (!data) throw new ConflictError();
  return mapReceipt(data as Record<string, unknown>);
}

export async function listExpenseEntries(opts?: {
  pageSize?: number;
  unauthorizedOnly?: boolean;
}): Promise<{ rows: ExpenseEntryRow[] }> {
  let q = supabase
    .from("expense_entries")
    .select(EXPENSE_COLUMNS)
    .is("deleted_at", null)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(opts?.pageSize ?? 500);
  if (opts?.unauthorizedOnly) {
    q = q.eq("authorization_status", "UNAUTHORIZED");
  }
  const { data, error } = await q;
  if (error) throw translateDbError(error);
  return { rows: (data ?? []).map((r) => mapExpense(r as unknown as Record<string, unknown>)) };
}

export async function saveExpense(input: {
  id?: string | null;
  row_version?: number | null;
  fields: ExpenseFields;
}): Promise<ExpenseEntryRow> {
  const { data, error } = await supabase.rpc("save_expense", {
    p_id: input.id ?? null,
    p_row_version: input.row_version ?? null,
    p_fields: input.fields,
  });
  if (error) throw translateDbError(error);
  return mapExpense(data as Record<string, unknown>);
}

export async function authorizeExpense(input: {
  id: string;
  row_version: number;
}): Promise<ExpenseEntryRow> {
  const { data, error } = await supabase.rpc("authorize_expense", {
    p_id: input.id,
    p_row_version: input.row_version,
  });
  if (error) throw translateDbError(error);
  if (!data) throw new ConflictError();
  return mapExpense(data as Record<string, unknown>);
}

export async function rejectExpense(input: {
  id: string;
  row_version: number;
  reason?: string | null;
}): Promise<ExpenseEntryRow> {
  const { data, error } = await supabase.rpc("reject_expense", {
    p_id: input.id,
    p_row_version: input.row_version,
    p_reason: input.reason ?? null,
  });
  if (error) throw translateDbError(error);
  if (!data) throw new ConflictError();
  return mapExpense(data as Record<string, unknown>);
}

export async function listCustomerPayments(opts?: {
  pageSize?: number;
}): Promise<{ rows: CustomerPaymentRow[] }> {
  const { data, error } = await supabase
    .from("customer_payments")
    .select(PAYMENT_COLUMNS)
    .is("deleted_at", null)
    .order("declared_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(opts?.pageSize ?? 500);
  if (error) throw translateDbError(error);
  return { rows: (data ?? []).map((r) => mapPayment(r as unknown as Record<string, unknown>)) };
}

export async function saveCustomerPayment(input: {
  id?: string | null;
  row_version?: number | null;
  fields: CustomerPaymentFields;
}): Promise<CustomerPaymentRow> {
  const { data, error } = await supabase.rpc("save_customer_payment", {
    p_id: input.id ?? null,
    p_row_version: input.row_version ?? null,
    p_fields: input.fields,
  });
  if (error) throw translateDbError(error);
  return mapPayment(data as Record<string, unknown>);
}

export async function approveCustomerPayment(input: {
  id: string;
  row_version: number;
}): Promise<CustomerPaymentRow> {
  const { data, error } = await supabase.rpc("approve_customer_payment", {
    p_id: input.id,
    p_row_version: input.row_version,
  });
  if (error) throw translateDbError(error);
  if (!data) throw new ConflictError();
  return mapPayment(data as Record<string, unknown>);
}

export async function rejectCustomerPayment(input: {
  id: string;
  row_version: number;
  reason?: string | null;
}): Promise<CustomerPaymentRow> {
  const { data, error } = await supabase.rpc("reject_customer_payment", {
    p_id: input.id,
    p_row_version: input.row_version,
    p_reason: input.reason ?? null,
  });
  if (error) throw translateDbError(error);
  if (!data) throw new ConflictError();
  return mapPayment(data as Record<string, unknown>);
}
