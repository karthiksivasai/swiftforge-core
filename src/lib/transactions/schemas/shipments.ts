/**
 * Shipment (AWB) schemas — Phase 4 Milestone 3A.
 */
import { z } from "zod";
import { boolWithDefault, optText, uuidRef } from "@/lib/masters/schemas/_shared";

export const SHIPMENT_STATUSES = ["DRAFT", "BOOKED", "CANCELLED"] as const;

export const shipmentPieceSchema = z.object({
  child_awb: optText(64),
  actual_weight_per_pc: optText(32),
  pieces: optText(16),
  length: optText(32),
  breadth: optText(32),
  height: optText(32),
  divisor: optText(32),
  vol_weight: optText(32),
  charge_weight: optText(32),
});

export const shipmentChargeSchema = z.object({
  side: z.enum(["CUSTOMER", "VENDOR"]).optional().default("CUSTOMER"),
  description: z.string().trim().min(1, "Charge description is required"),
  rate: optText(32),
  amount: optText(32),
  fuel_applies: z.boolean().optional().default(false),
  fuel_amount: optText(32),
  tax_applies: z.boolean().optional().default(false),
  tax_on_fuel: z.boolean().optional().default(false),
  igst: optText(32),
  sgst: optText(32),
  cgst: optText(32),
  total: optText(32),
  charges_type: z.enum(["MANUAL", "SYSTEM"]).optional().default("MANUAL"),
});

export const shipmentCommentSchema = z.object({
  comment: z.string().trim().min(1, "Comment is required"),
  file_id: uuidRef(),
  commented_at: optText(40),
});

export const shipmentAttachmentSchema = z.object({
  file_id: z.string().uuid("file_id is required"),
  label: optText(200),
});

export const shipmentFieldsSchema = z.object({
  customer_id: uuidRef(),
  customer_code: optText(64),
  product_id: uuidRef(),
  product_code: optText(64),
  origin_destination_id: uuidRef(),
  origin_code: optText(64),
  destination_id: uuidRef(),
  destination_code: optText(64),
  vendor_id: uuidRef(),
  vendor_code: optText(64),
  delivery_vendor_id: uuidRef(),
  delivery_vendor_code: optText(64),
  field_executive_id: uuidRef(),
  field_executive_code: optText(64),
  branch_id: uuidRef(),
  branch_code: optText(64),
  pickup_id: uuidRef(),
  book_date: z.string().trim().min(1, "Book date is required"),
  book_time: optText(16),
  reference_no: optText(64),
  airline: optText(64),
  service: optText(64),
  payment_type: optText(40),
  content: optText(200),
  instruction: optText(200),
  pieces: optText(16),
  pieces_unit: z.enum(["DOX", "NDOX", "ENV"]).optional().default("DOX"),
  actual_weight: optText(32),
  weight_unit: optText(16),
  vol_weight: optText(32),
  charge_weight: optText(32),
  shipment_value: optText(32),
  currency: optText(8),
  is_commercial: boolWithDefault(false),
  is_oda: boolWithDefault(false),
  medical_charges: boolWithDefault(false),
  customer_charges_total: optText(32),
  vendor_charges_total: optText(32),
  cash_receipt_no: optText(64),
  amount_received: optText(32),
  balance_amount: optText(32),
  cash_receipt_date: optText(16),
  forwarding_awb: optText(64),
  delivery_awb: optText(64),
  return_awb: optText(64),
  delivery_service: optText(64),
  flight_no: optText(64),
  is_locked: boolWithDefault(false),
  shipper: z.record(z.unknown()).optional().default({}),
  consignee: z.record(z.unknown()).optional().default({}),
  wizard_extras: z.record(z.unknown()).optional().default({}),
});

export type ShipmentFields = z.infer<typeof shipmentFieldsSchema>;
export type ShipmentPieceInput = z.infer<typeof shipmentPieceSchema>;
export type ShipmentChargeInput = z.infer<typeof shipmentChargeSchema>;
export type ShipmentCommentInput = z.infer<typeof shipmentCommentSchema>;
export type ShipmentAttachmentInput = z.infer<typeof shipmentAttachmentSchema>;
