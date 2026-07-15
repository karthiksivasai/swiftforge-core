import { z } from "zod";

const pct = z.coerce.number().min(0).max(100);

export const fuelRateSchema = z.object({
  entry_code: z.string().optional().nullable(),
  customer_code: z.string().optional().nullable(),
  vendor_code: z.string().optional().nullable(),
  product_code: z.string().optional().nullable(),
  zone_code: z.string().optional().nullable(),
  destination_code: z.string().optional().nullable(),
  from_date: z.string().min(1, "From date is required"),
  to_date: z.string().optional().nullable(),
  percentage: pct,
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

export const taxRateSchema = z.object({
  customer_code: z.string().optional().nullable(),
  product_code: z.string().optional().nullable(),
  from_date: z.string().min(1, "From date is required"),
  to_date: z.string().optional().nullable(),
  igst_pct: pct.default(0),
  cgst_pct: pct.default(0),
  sgst_pct: pct.default(0),
  tax_type: z.string().default("GST"),
  tax_on_fuel: z.boolean().default(true),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

export type FuelRateInput = z.infer<typeof fuelRateSchema>;
export type TaxRateInput = z.infer<typeof taxRateSchema>;
