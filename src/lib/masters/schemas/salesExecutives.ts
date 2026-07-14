import { z } from "zod";

import { optNonNegNumber, reqText } from "./_shared";

export const salesExecutiveCreateSchema = z.object({
  code: reqText("Code", 20),
  name: reqText("Name", 150),
  // Commission % — optional, non-negative; null coerced to 0 for the DB default.
  commission: optNonNegNumber().transform((v) => v ?? 0),
});

export const salesExecutiveUpdateSchema = salesExecutiveCreateSchema.partial();

export type SalesExecutiveCreate = z.infer<typeof salesExecutiveCreateSchema>;
export type SalesExecutiveUpdate = z.infer<typeof salesExecutiveUpdateSchema>;

export const salesExecutiveDefaults: Partial<z.input<typeof salesExecutiveCreateSchema>> = {
  code: "",
  name: "",
  commission: 0,
};
