/**
 * Manifest schemas — Phase 4 Milestone 4A.
 */
import { z } from "zod";
import { boolWithDefault, optText, uuidRef } from "@/lib/masters/schemas/_shared";

export const MANIFEST_STATUSES = ["DRAFT", "CLOSED", "CANCELLED"] as const;

export const manifestLineSchema = z.object({
  shipment_id: uuidRef(),
  awb_no: optText(64),
  forwarding_no: optText(64),
  bag_no: optText(64),
  crn_mhbs_no: optText(64),
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
  instruction: optText(200),
  reference_no: optText(64),
});

export const manifestCommentSchema = z.object({
  comment: z.string().trim().min(1, "Comment is required"),
  file_id: uuidRef(),
  commented_at: optText(40),
});

export const manifestAttachmentSchema = z.object({
  file_id: z.string().uuid("file_id is required"),
  label: optText(200),
});

export const manifestFieldsSchema = z.object({
  manifest_date: z.string().trim().min(1, "Manifest date is required"),
  manifest_time: optText(16),
  manifest_kind: z.enum(["OUTBOUND", "BAGGING", "OBC"]).optional().default("OUTBOUND"),
  to_type: z.enum(["SERVICE_CENTER", "THIRD_PARTY"]).optional().default("SERVICE_CENTER"),
  to_service_center_id: uuidRef(),
  to_service_center_code: optText(64),
  vendor_id: uuidRef(),
  vendor_code: optText(64),
  origin_branch_id: uuidRef(),
  branch_code: optText(64),
  location_code: optText(64),
  connect_station: optText(200),
  master_awb_no: optText(64),
  cd_no: optText(64),
  obc_name: optText(200),
  total_bags: optText(16),
  vendor_weight: optText(32),
  reference_no: optText(64),
  flight1: optText(64),
  flight2: optText(64),
  departure: optText(64),
  arrival: optText(64),
  remark: optText(500),
  flight: optText(64),
  is_locked: boolWithDefault(false),
  wizard_extras: z.record(z.string(), z.unknown()).optional().default({}),
});

export type ManifestFields = z.infer<typeof manifestFieldsSchema>;
export type ManifestLineInput = z.infer<typeof manifestLineSchema>;
export type ManifestCommentInput = z.infer<typeof manifestCommentSchema>;
export type ManifestAttachmentInput = z.infer<typeof manifestAttachmentSchema>;
