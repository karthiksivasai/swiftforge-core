import { z } from "zod";

import { optEmail, optEnum, optText, reqText, uuidRef } from "./_shared";

export const DESTINATION_TYPES = ["DOMESTIC", "INTERNATIONAL", "LOCAL"] as const;
export const SERVICE_TYPES = ["REGULAR", "METRO", "REMOTE"] as const;
export const DESTINATION_STATUSES = ["ACTIVE", "INACTIVE"] as const;

export const destinationCreateSchema = z.object({
  dest_type: z.enum(DESTINATION_TYPES).default("DOMESTIC"),
  code: reqText("Code", 20),
  name: reqText("Name", 150),
  country_id: uuidRef(),
  state_id: uuidRef(),
  zone_id: uuidRef(),
  service_type: optEnum(SERVICE_TYPES),
  main_branch_id: uuidRef(),
  manifest_branch_id: uuidRef(),
  email: optEmail(),
  mobile: optText(20),
  status: z.enum(DESTINATION_STATUSES).default("ACTIVE"),
});

export const destinationUpdateSchema = destinationCreateSchema.partial();

export type DestinationCreate = z.infer<typeof destinationCreateSchema>;
export type DestinationUpdate = z.infer<typeof destinationUpdateSchema>;

export const destinationDefaults: Partial<z.input<typeof destinationCreateSchema>> = {
  dest_type: "DOMESTIC",
  code: "",
  name: "",
  country_id: null,
  state_id: null,
  zone_id: null,
  service_type: null,
  main_branch_id: null,
  manifest_branch_id: null,
  email: "",
  mobile: "",
  status: "ACTIVE",
};
