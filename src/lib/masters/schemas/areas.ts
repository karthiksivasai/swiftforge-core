import { z } from "zod";

import { reqText, reqUuid, uuidRef } from "./_shared";

export const areaCreateSchema = z.object({
  branch_id: reqUuid("Branch"),
  service_center_id: reqUuid("Service Center"),
  // Uppercased to match the import path (0016 stores areas.name in UPPER).
  name: reqText("Name", 150).transform((v) => v.toUpperCase()),
  destination_id: uuidRef(),
});

export const areaUpdateSchema = areaCreateSchema.partial();

export type AreaCreate = z.infer<typeof areaCreateSchema>;
export type AreaUpdate = z.infer<typeof areaUpdateSchema>;

export const areaDefaults: Partial<z.input<typeof areaCreateSchema>> = {
  branch_id: "",
  service_center_id: "",
  name: "",
  destination_id: null,
};
