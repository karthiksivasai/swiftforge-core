/**
 * Finance foundation schemas — Phase 4 Milestone 4G.
 * Payload shapes for receipt / expense / customer-payment RPCs (0040).
 */
import { z } from "zod";
import { optText, uuidRef } from "@/lib/masters/schemas/_shared";

export const RECEIPT_STATUSES = ["DRAFT", "POSTED", "ADJUSTED", "CANCELLED"] as const;
export const EXPENSE_KINDS = ["EXPENSE", "INCOME"] as const;
export const EXPENSE_AUTH_STATUSES = ["UNAUTHORIZED", "AUTHORIZED", "REJECTED"] as const;
export const PAYMENT_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export const PAY_MODES = ["CASH", "BANK"] as const;

export const receiptFieldsSchema = z.object({
  receipt_date: z.string().trim().min(1, "Receipt date is required"),
  customer_id: uuidRef(),
  customer_code: optText(64).optional(),
  branch_id: uuidRef(),
  branch_code: optText(64).optional(),
  bank_id: uuidRef(),
  bank_code: optText(64).optional(),
  bank_name: optText(200).optional(),
  mode: z.enum(PAY_MODES).optional().default("CASH"),
  amount: z.union([z.string(), z.number()]).transform((v) => String(v)),
  narration: optText(500).optional(),
});

export type ReceiptFields = z.infer<typeof receiptFieldsSchema>;

export const expenseFieldsSchema = z.object({
  kind: z.enum(EXPENSE_KINDS).optional().default("EXPENSE"),
  entry_date: z.string().trim().min(1, "Entry date is required"),
  expense_head_id: uuidRef(),
  expense_head_code: optText(64).optional(),
  expense_head_name: optText(200).optional(),
  mode: z.enum(PAY_MODES).optional().default("CASH"),
  bank_id: uuidRef(),
  bank_code: optText(64).optional(),
  branch_id: uuidRef(),
  shipment_id: uuidRef(),
  awb_no: optText(64).optional(),
  description: optText(500).optional(),
  amount: z.union([z.string(), z.number()]).transform((v) => String(v)),
  document_file_id: uuidRef(),
});

export type ExpenseFields = z.infer<typeof expenseFieldsSchema>;

export const customerPaymentFieldsSchema = z.object({
  declared_date: z.string().trim().min(1, "Declared date is required"),
  paid_date: optText(32).optional(),
  customer_id: uuidRef(),
  customer_code: optText(64).optional(),
  amount: z.union([z.string(), z.number()]).transform((v) => String(v)),
  remark: optText(500).optional(),
  file_id: uuidRef(),
});

export type CustomerPaymentFields = z.infer<typeof customerPaymentFieldsSchema>;

export function canUpdateReceipt(status: string | null | undefined): boolean {
  return status === "DRAFT";
}

export function canPostReceipt(status: string | null | undefined): boolean {
  return status === "DRAFT";
}

export function canUpdateExpense(authStatus: string | null | undefined): boolean {
  return authStatus === "UNAUTHORIZED";
}

export function canAuthorizeExpense(authStatus: string | null | undefined): boolean {
  return authStatus === "UNAUTHORIZED";
}

export function canRejectExpense(authStatus: string | null | undefined): boolean {
  return authStatus === "UNAUTHORIZED";
}

export function canUpdateCustomerPayment(status: string | null | undefined): boolean {
  return status === "PENDING";
}

export function canApproveCustomerPayment(status: string | null | undefined): boolean {
  return status === "PENDING";
}

export function canRejectCustomerPayment(status: string | null | undefined): boolean {
  return status === "PENDING";
}
