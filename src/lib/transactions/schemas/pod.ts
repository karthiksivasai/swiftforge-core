/**
 * POD schemas — Phase 4 Milestone 4E.
 */
import { z } from "zod";
import { optText, uuidRef } from "@/lib/masters/schemas/_shared";

export const POD_RECORD_STATUSES = ["DELIVERED", "IN_TRANSIT", "PENDING"] as const;
export const POD_SOURCES = ["DRS", "IMPORT", "MOBILE", "MANUAL"] as const;

export const podFieldsSchema = z.object({
  receiver_name: z.string().trim().min(1, "Receiver name is required").max(200),
  pod_date: z.string().trim().min(1, "POD date is required"),
  remark: optText(500),
  source: z.enum(POD_SOURCES).optional().default("MANUAL"),
  signature_file_id: uuidRef(),
  photo_file_id: uuidRef(),
});

export type PodFields = z.infer<typeof podFieldsSchema>;

export const podRecordSchema = z.object({
  id: z.string().uuid(),
  row_version: z.number().int().positive(),
  awb_no: z.string(),
  shipment_id: z.string().uuid(),
  pod_date: z.string(),
  receiver_name: z.string(),
  remark: z.string().nullable().optional(),
  status: z.enum(POD_RECORD_STATUSES),
  signature_file_id: z.string().uuid().nullable().optional(),
  photo_file_id: z.string().uuid().nullable().optional(),
  source: z.enum(POD_SOURCES).optional(),
});

export type PodRecord = z.infer<typeof podRecordSchema>;

export function canSavePod(shipmentStatus: string | null | undefined): boolean {
  return shipmentStatus === "DELIVERED_PENDING_POD";
}

export function canUpdatePod(
  shipmentStatus: string | null | undefined,
  podStatus: string | null | undefined,
): boolean {
  return shipmentStatus === "DELIVERED" && podStatus === "DELIVERED";
}

export function canCancelPod(
  shipmentStatus: string | null | undefined,
  podStatus: string | null | undefined,
): boolean {
  return canUpdatePod(shipmentStatus, podStatus);
}

export function podStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "DELIVERED":
      return "Delivered";
    case "IN_TRANSIT":
      return "In Transit";
    case "PENDING":
      return "Pending";
    case "DELIVERED_PENDING_POD":
      return "Delivered (pending POD)";
    default:
      return status?.replaceAll("_", " ") || "—";
  }
}
