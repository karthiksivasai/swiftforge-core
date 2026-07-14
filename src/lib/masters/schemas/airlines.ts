import { z } from "zod";

import { reqText, reqUuid } from "./_shared";

export const airlineCreateSchema = z.object({
  name: reqText("Airline Name", 200),
  product_id: reqUuid("Product"),
});

export const airlineUpdateSchema = airlineCreateSchema.partial();

export type AirlineCreate = z.infer<typeof airlineCreateSchema>;
export type AirlineUpdate = z.infer<typeof airlineUpdateSchema>;

export const airlineDefaults: Partial<z.input<typeof airlineCreateSchema>> = {
  name: "",
  product_id: "",
};
