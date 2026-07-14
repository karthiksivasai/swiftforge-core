/**
 * DRS schemas — Phase 4 Milestone 4C.
 */
import { z } from "zod";
import { optText, uuidRef } from "@/lib/masters/schemas/_shared";

export const DRS_STATUSES = ["DRAFT", "DISPATCHED", "COMPLETED", "CANCELLED"] as const;

export const drsLineSchema = z.object({
  shipment_id: uuidRef(),
  awb_no: optText(64),
  remarks: optText(500),
  pieces: optText(16),
  charge_weight: optText(32),
  book_date: optText(40),
  origin_code: optText(64),
  origin_name: optText(200),
  destination_code: optText(64),
  destination_name: optText(200),
  customer_code: optText(64),
  customer_name: optText(200),
  consignee_name: optText(200),
  eway_bill_no: optText(64),
  shipment_value: optText(32),
});

export const drsFieldsSchema = z.object({
  drs_date: z.string().trim().min(1, "DRS date is required"),
  drs_time: optText(16),
  branch_id: uuidRef(),
  branch_code: optText(64),
  destination_id: uuidRef(),
  destination_code: optText(64),
  delivery_executive_id: uuidRef(),
  delivery_executive_code: optText(64),
  vehicle_no: optText(64),
  remarks: optText(500),
  area_code: optText(64),
  area_name: optText(200),
  area_seq: optText(16),
  wizard_extras: z.record(z.string(), z.unknown()).optional().default({}),
});

export type DrsFields = z.infer<typeof drsFieldsSchema>;
export type DrsLineInput = z.infer<typeof drsLineSchema>;

export function canEditDrsStatus(status: string | null | undefined): boolean {
  return !status || status === "DRAFT";
}

export function canDispatchDrs(status: string | null | undefined, lineCount: number): boolean {
  return status === "DRAFT" && lineCount > 0;
}

export function canCancelDrs(status: string | null | undefined): boolean {
  return status === "DRAFT";
}

export const DELIVERY_OUTCOMES = [
  "DELIVERY_ATTEMPTED",
  "UNDELIVERED",
  "DELIVERED_PENDING_POD",
] as const;

export type DeliveryOutcome = (typeof DELIVERY_OUTCOMES)[number];

export const deliveryAttemptSchema = z.object({
  drs_id: z.string().uuid("DRS is required"),
  shipment_id: uuidRef(),
  awb_no: optText(64),
  outcome: z.enum(DELIVERY_OUTCOMES).default("DELIVERY_ATTEMPTED"),
  remark: optText(500),
});

export type DeliveryAttemptInput = z.infer<typeof deliveryAttemptSchema>;

/** Terminal outcomes that allow complete_drs (blueprint CLOSED when all lines have outcome). */
export const TERMINAL_LINE_OUTCOMES = ["DELIVERED", "UNDELIVERED"] as const;

export function canCompleteDrs(status: string | null | undefined, pendingCount: number): boolean {
  return status === "DISPATCHED" && pendingCount === 0;
}

export function canReopenDrs(status: string | null | undefined): boolean {
  return status === "COMPLETED";
}

export function canRecordDeliveryAttempt(status: string | null | undefined): boolean {
  return status === "DISPATCHED";
}

export function isTerminalShipmentStatus(status: string | null | undefined): boolean {
  return status === "DELIVERED_PENDING_POD" || status === "UNDELIVERED" || status === "DELIVERED";
}

export function isTerminalLineOutcome(outcome: string | null | undefined): boolean {
  return outcome === "DELIVERED" || outcome === "UNDELIVERED";
}
