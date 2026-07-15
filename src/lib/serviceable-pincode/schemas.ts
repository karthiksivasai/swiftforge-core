import { z } from "zod";

export const serviceableSearchSchema = z.object({
  query: z.string().min(1, "Search value is required"),
  mode: z.enum(["pincode", "name"]).default("pincode"),
});

export const serviceableCheckSchema = z.object({
  origin_pincode: z.string().min(1, "Origin pincode is required"),
  destination_pincode: z.string().min(1, "Destination pincode is required"),
  product_code: z.string().optional().nullable(),
  shipment_type: z.enum(["DOX", "NDOX"]).optional().nullable(),
  service: z.string().optional().nullable(),
});

export type ServiceableSearchInput = z.infer<typeof serviceableSearchSchema>;
export type ServiceableCheckInput = z.infer<typeof serviceableCheckSchema>;
