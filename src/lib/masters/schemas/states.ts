import { z } from "zod";

import { boolWithDefault, optText, reqText, uuidRef } from "./_shared";

export const stateCreateSchema = z.object({
  code: reqText("Code", 20),
  name: reqText("Name", 150),
  zone_id: uuidRef(),
  gst_alias: optText(20),
  is_union_territory: boolWithDefault(false),
});

export const stateUpdateSchema = stateCreateSchema.partial();

export type StateCreate = z.infer<typeof stateCreateSchema>;
export type StateUpdate = z.infer<typeof stateUpdateSchema>;

export const stateDefaults: Partial<z.input<typeof stateCreateSchema>> = {
  code: "",
  name: "",
  zone_id: null,
  gst_alias: "",
  is_union_territory: false,
};
