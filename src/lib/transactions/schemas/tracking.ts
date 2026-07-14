/**
 * Tracking schemas — Phase 4 Milestone 4F.
 */
import { z } from "zod";
import { optText, uuidRef } from "@/lib/masters/schemas/_shared";

export const trackingProgressSchema = z.object({
  event_date: z.string().trim().min(1, "Progress date is required"),
  event_time: optText(16),
  exception_id: uuidRef(),
  exception_code: optText(64),
  branch_id: uuidRef(),
  branch_code: optText(64),
  service_center_code: optText(64),
  remark: optText(500),
  status_text: optText(200),
  to_status: optText(64),
  allow_if_delivered: z.boolean().optional().default(false),
});

export type TrackingProgressFields = z.infer<typeof trackingProgressSchema>;

export const trackingCommentSchema = z.object({
  comment: z.string().trim().min(1, "Comment is required").max(2000),
  file_id: uuidRef(),
  commented_at: optText(40),
});

export type TrackingCommentFields = z.infer<typeof trackingCommentSchema>;

export const trackingHoldSchema = z.object({
  remark: optText(500),
  shipper_email: optText(200),
  send_mail: z.boolean().optional().default(false),
});

export type TrackingHoldFields = z.infer<typeof trackingHoldSchema>;
