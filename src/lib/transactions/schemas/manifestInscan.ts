/**
 * Manifest Inscan schemas — Phase 4 Milestone 4B.
 */
import { z } from "zod";
import { optText, uuidRef } from "@/lib/masters/schemas/_shared";

export const MANIFEST_INSCAN_MODES = ["AWB", "BAG"] as const;

export const manifestInscanScanSchema = z
  .object({
    manifest_id: z.string().uuid("Manifest is required"),
    awb_no: optText(64),
    shipment_id: uuidRef(),
    bag_no: optText(64),
    mode: z.enum(MANIFEST_INSCAN_MODES).optional().default("AWB"),
    weight: z.number().nonnegative().optional().nullable(),
    length: z.number().nonnegative().optional().nullable(),
    breadth: z.number().nonnegative().optional().nullable(),
    height: z.number().nonnegative().optional().nullable(),
    vol_weight: z.number().nonnegative().optional().nullable(),
    remark: optText(500),
    is_booking_weight: z.boolean().optional().default(false),
  })
  .superRefine((val, ctx) => {
    if (!val.shipment_id && !val.awb_no) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AWB No or shipment is required",
        path: ["awb_no"],
      });
    }
  });

export const manifestInscanResultSchema = z.object({
  ok: z.boolean(),
  duplicate: z.boolean().optional().default(false),
  message: z.string(),
  manifest_id: z.string().uuid().optional(),
  manifest_no: z.string().optional(),
  shipment_id: z.string().uuid().optional(),
  awb_no: z.string().optional(),
  status: z.string().optional(),
  from_status: z.string().optional(),
  to_status: z.string().optional(),
  has_weight_discrepancy: z.boolean().optional(),
  inscan_weight: z.number().optional().nullable(),
  booked_weight: z.number().optional().nullable(),
  scanned_count: z.number().int().nonnegative().optional(),
  pending_count: z.number().int().nonnegative().optional(),
});

export const manifestInscanBagSchema = z.object({
  manifest_id: z.string().uuid("Manifest ID is required"),
  bag_no: z.string().min(1, "Bag No is required"),
});

export const manifestInscanBagResultSchema = z.object({
  ok: z.boolean(),
  manifest_id: z.string().uuid().optional(),
  manifest_no: z.string().optional(),
  bag_no: z.string().optional(),
  total_in_bag: z.number().int().nonnegative().optional(),
  newly_scanned: z.number().int().nonnegative().optional(),
  skipped: z.number().int().nonnegative().optional(),
  message: z.string(),
  scanned_count: z.number().int().nonnegative().optional(),
  pending_count: z.number().int().nonnegative().optional(),
});

export type ManifestInscanScanInput = z.infer<typeof manifestInscanScanSchema>;
export type ManifestInscanResult = z.infer<typeof manifestInscanResultSchema>;
export type ManifestInscanBagInput = z.infer<typeof manifestInscanBagSchema>;
export type ManifestInscanBagResult = z.infer<typeof manifestInscanBagResultSchema>;
