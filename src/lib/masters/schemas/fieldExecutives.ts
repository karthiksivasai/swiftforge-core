import { z } from "zod";

import { optText, optNonNegNumber, reqText, reqUuid, uuidRef } from "./_shared";

/**
 * Field Executive — pickup/delivery field-staff master (Milestone 9B).
 *
 * Two FKs: `service_center_id` (required) and `destination_id` (optional). Charge
 * amounts default to 0. Describes the DB column shape (snake_case) consumed by
 * the generic CRUD.
 */
export const fieldExecutiveCreateSchema = z.object({
  code: reqText("Code", 50),
  name: reqText("Name", 200),
  mobile: optText(30),
  pickup_charge: optNonNegNumber().transform((v) => v ?? 0),
  delivery_charge: optNonNegNumber().transform((v) => v ?? 0),
  service_center_id: reqUuid("Service Center"),
  destination_id: uuidRef(),
  tld_batch_no: optText(50),
  in_active: z.boolean().default(false),
});

export const fieldExecutiveUpdateSchema = fieldExecutiveCreateSchema.partial();

export type FieldExecutiveCreate = z.infer<typeof fieldExecutiveCreateSchema>;
export type FieldExecutiveUpdate = z.infer<typeof fieldExecutiveUpdateSchema>;

export const fieldExecutiveDefaults: Partial<z.input<typeof fieldExecutiveCreateSchema>> = {
  code: "",
  name: "",
  mobile: "",
  pickup_charge: 0,
  delivery_charge: 0,
  service_center_id: "",
  destination_id: "",
  tld_batch_no: "",
  in_active: false,
};
