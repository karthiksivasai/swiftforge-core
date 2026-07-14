import { z } from "zod";

import { boolWithDefault, optText, reqText, reqUuid, uuidRef } from "./_shared";

export const SERVICE_MAPPING_STATUSES = ["ACTIVE", "INACTIVE"] as const;

export const serviceMappingCreateSchema = z.object({
  vendor_id: reqUuid("Vendor"),
  service: reqText("Service", 100),
  service_type: optText(200),
  billing_vendor_id: uuidRef(),
  min_weight: z.coerce.number().nonnegative().default(0),
  max_weight: z.coerce.number().nonnegative().default(99999),
  vendor_link: optText(100),
  is_single_piece: boolWithDefault(false),
  status: z.enum(SERVICE_MAPPING_STATUSES).default("ACTIVE"),
});

export const serviceMappingUpdateSchema = serviceMappingCreateSchema.partial();

export type ServiceMappingCreate = z.infer<typeof serviceMappingCreateSchema>;
export type ServiceMappingUpdate = z.infer<typeof serviceMappingUpdateSchema>;

export const serviceMappingDefaults: Partial<z.input<typeof serviceMappingCreateSchema>> = {
  vendor_id: "",
  service: "",
  service_type: "",
  billing_vendor_id: "",
  min_weight: 0,
  max_weight: 99999,
  vendor_link: "",
  is_single_piece: false,
  status: "ACTIVE",
};
