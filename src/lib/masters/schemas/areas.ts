import { z } from "zod";

import { reqText, uuidRef, reqUuid } from "./_shared";

// branch_id and destination_id are derived on the server from the service center.
// A value sent by the form is replaced before the row is stored.
export const areaCreateSchema = z.object({
  service_center_id: reqUuid("Service Center"),
  name: reqText("Area Name", 150).transform((v) => v.toUpperCase()),
  branch_id: uuidRef(),
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
