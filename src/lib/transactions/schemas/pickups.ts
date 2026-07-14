/**
 * Pickup transaction schemas (Phase 4 — Milestone 2).
 * Payload shape for public.save_pickup(p_fields jsonb).
 */
import { z } from "zod";
import { boolWithDefault, optText, uuidRef } from "@/lib/masters/schemas/_shared";

export const VEHICLE_TYPES = ["BICYCLE", "BIKE", "CAR", "VAN", "TRUCK", "TEMPO"] as const;
export const PICKUP_STATUSES = ["OPEN", "ASSIGNED", "PICKED", "CONFIRMED", "CANCELLED"] as const;

export const pickupFieldsSchema = z.object({
  mobile_no: z.string().trim().min(1, "Mobile No. is required").max(40),
  shipper_name: optText(200),
  shipper_id: uuidRef(),
  shipper_code: optText(64),
  customer_id: uuidRef(),
  customer_code: optText(64),
  origin_destination_id: uuidRef(),
  origin_code: optText(64),
  branch_id: uuidRef(),
  branch_code: optText(64),
  area_id: uuidRef(),
  area_code: optText(64),
  area_name: optText(200),
  field_executive_id: uuidRef(),
  field_executive_code: optText(64),
  sales_executive_id: uuidRef(),
  sales_executive_code: optText(64),
  pickup_date: z.string().trim().min(1, "Pickup date is required"),
  pickup_time: optText(16),
  contact: optText(120),
  address1: optText(200),
  address2: optText(200),
  zip: optText(20),
  city: optText(100),
  state: optText(100),
  pay_option: optText(40),
  consignee_details: boolWithDefault(false),
  vehicle_type: z
    .union([z.enum(VEHICLE_TYPES), z.literal(""), z.null(), z.undefined()])
    .transform((v) => (v && v.length ? v : null)),
  special_instructions: optText(500),
  reason: optText(500),
  pickup_ready: boolWithDefault(true),
});

export type PickupFields = z.infer<typeof pickupFieldsSchema>;
