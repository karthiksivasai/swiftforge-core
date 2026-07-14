import { z } from "zod";

import { reqText } from "./_shared";

export const productTypeCreateSchema = z.object({
  code: reqText("Code", 20),
  name: reqText("Name", 150),
});

export const productTypeUpdateSchema = productTypeCreateSchema.partial();

export type ProductTypeCreate = z.infer<typeof productTypeCreateSchema>;
export type ProductTypeUpdate = z.infer<typeof productTypeUpdateSchema>;

export const productTypeDefaults: Partial<z.input<typeof productTypeCreateSchema>> = {
  code: "",
  name: "",
};
