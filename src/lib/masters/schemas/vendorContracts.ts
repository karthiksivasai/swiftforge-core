import { z } from "zod";

import { optText, reqText, uuidRef } from "./_shared";

const unitEnum = z.enum(["KG", "LB", "CBM", "PIECE"]);
const statusEnum = z.enum(["ACTIVE", "INACTIVE"]);
const rateTypeEnum = z.enum(["FLAT", "PER_KG", "PER_SLAB", "MINIMUM"]);

export const vendorContractCreateSchema = z.object({
  contract_no: reqText("Contract no", 50),
  from_date: reqText("From date", 10),
  vendor_id: z.string().uuid("Vendor is required"),
  origin_destination_id: uuidRef(),
  zone_id: uuidRef(),
  country_id: uuidRef(),
  destination_id: uuidRef(),
  product_id: z.string().uuid("Product is required"),
  service: optText(100),
  unit: unitEnum.default("KG"),
  transit_days: z
    .union([z.number().int().nonnegative(), z.literal(""), z.null(), z.undefined()])
    .transform((v) => (v === "" || v == null ? null : Number(v))),
  status: statusEnum.default("ACTIVE"),
});

export const vendorContractUpdateSchema = vendorContractCreateSchema.partial();

export const vendorContractSlabSchema = z.object({
  rate_type: rateTypeEnum,
  weight: z.coerce.number().nonnegative(),
  rate: z.coerce.number().nonnegative(),
});

export const vendorContractSlabsSchema = z.array(vendorContractSlabSchema).min(1).max(50);

export type VendorContractCreate = z.infer<typeof vendorContractCreateSchema>;
export type VendorContractUpdate = z.infer<typeof vendorContractUpdateSchema>;
export type VendorContractSlabInput = z.infer<typeof vendorContractSlabSchema>;
