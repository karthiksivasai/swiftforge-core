import { z } from "zod";

import { optNonNegNumber, optText, reqText, reqUuid, uuidRef } from "./_shared";

export const CUSTOMER_RATE_UNITS = ["KG", "LB", "CBM", "PIECE"] as const;
export const CUSTOMER_RATE_TYPES = ["FLAT", "PER_KG", "PER_SLAB", "MINIMUM"] as const;

export const customerRateCreateSchema = z.object({
  customer_id: reqUuid("Customer"),
  product_id: uuidRef(),
  service: optText(80),
  origin_destination_id: uuidRef(),
  destination_id: uuidRef(),
  zone_id: uuidRef(),
  country_id: uuidRef(),
  vendor_id: uuidRef(),
  contract_no: optText(80),
  from_date: reqText("From Date", 20),
  to_date: optText(20),
  unit: z.enum(CUSTOMER_RATE_UNITS).nullable().optional(),
  transit_days: z.number().int().nonnegative().nullable().optional(),
  rate_type: z.enum(CUSTOMER_RATE_TYPES).nullable().optional(),
  min_weight: optNonNegNumber(),
  rate_per_kg: optNonNegNumber(),
  fuel_pct: optNonNegNumber(),
  other_charges: optNonNegNumber(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

export const customerRateUpdateSchema = customerRateCreateSchema.partial();

export type CustomerRateCreate = z.infer<typeof customerRateCreateSchema>;
export type CustomerRateUpdate = z.infer<typeof customerRateUpdateSchema>;
