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
  duplicate: z.boolean(),
  message: z.string(),
  manifest_id: z.string().uuid().optional(),
  manifest_no: z.string().optional(),
  shipment_id: z.string().uuid().optional(),
  awb_no: z.string().optional(),
  status: z.string().optional(),
  from_status: z.string().optional(),
  to_status: z.string().optional(),
  scanned_count: z.number().int().nonnegative().optional(),
  pending_count: z.number().int().nonnegative().optional(),
});

export type ManifestInscanScanInput = z.infer<typeof manifestInscanScanSchema>;
export type ManifestInscanResult = z.infer<typeof manifestInscanResultSchema>;
