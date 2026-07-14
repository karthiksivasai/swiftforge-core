import { z } from "zod";

import { boolWithDefault, optNonNegNumber, optText, reqText, uuidRef } from "./_shared";

export const pincodeCreateSchema = z.object({
  pin_code: reqText("Pin code", 20),
  pin_name: optText(150),
  branch_id: uuidRef(),
  destination_id: uuidRef(),
  zone_id: uuidRef(),
  state_id: uuidRef(),
  is_oda: boolWithDefault(false),
  is_serviceable: boolWithDefault(true),
  pickup_available: boolWithDefault(false),
  distance_km: optNonNegNumber(),
});

export const pincodeUpdateSchema = pincodeCreateSchema.partial();

export type PincodeCreate = z.infer<typeof pincodeCreateSchema>;
export type PincodeUpdate = z.infer<typeof pincodeUpdateSchema>;

export const pincodeDefaults: Partial<z.input<typeof pincodeCreateSchema>> = {
  pin_code: "",
  pin_name: "",
  branch_id: null,
  destination_id: null,
  zone_id: null,
  state_id: null,
  is_oda: false,
  is_serviceable: true,
  pickup_available: false,
  distance_km: null,
};
