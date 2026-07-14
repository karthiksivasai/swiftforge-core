import { z } from "zod";

import { optText, reqText, uuidRef } from "./_shared";

export const SHIPMENT_TYPES = ["DOX", "NDOX"] as const;
export const PRODUCT_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export const GROUP_TYPES = ["AIR", "SURFACE", "TRAIN", "ALL"] as const;

export const productCreateSchema = z.object({
  code: reqText("Product Code", 50),
  name: optText(150),
  product_type_id: uuidRef(),
  service: optText(150),
  fuel_charge: z.boolean().default(false),
  gst_reverse: z.boolean().default(false),
  shipment_type: z.enum(SHIPMENT_TYPES).default("DOX"),
  status: z.enum(PRODUCT_STATUSES).default("ACTIVE"),
  group_type: z
    .union([z.enum(GROUP_TYPES), z.literal(""), z.null(), z.undefined()])
    .transform((v) => (v && v.length ? v : null)),
});

export const productUpdateSchema = productCreateSchema.partial();

export type ProductCreate = z.infer<typeof productCreateSchema>;
export type ProductUpdate = z.infer<typeof productUpdateSchema>;

export const productDefaults: Partial<z.input<typeof productCreateSchema>> = {
  code: "",
  name: "",
  product_type_id: "",
  service: "",
  fuel_charge: false,
  gst_reverse: false,
  shipment_type: "DOX",
  status: "ACTIVE",
  group_type: null,
};
