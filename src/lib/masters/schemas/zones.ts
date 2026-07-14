import { z } from "zod";

import { reqText } from "./_shared";

export const zoneCreateSchema = z.object({
  code: reqText("Code", 20),
  name: reqText("Name", 150),
});

export const zoneUpdateSchema = zoneCreateSchema.partial();

export type ZoneCreate = z.infer<typeof zoneCreateSchema>;
export type ZoneUpdate = z.infer<typeof zoneUpdateSchema>;

export const zoneDefaults: Partial<z.input<typeof zoneCreateSchema>> = {
  code: "",
  name: "",
};
