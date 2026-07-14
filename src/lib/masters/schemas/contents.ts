import { z } from "zod";

import { reqText } from "./_shared";

export const contentCreateSchema = z.object({
  code: reqText("Content Code", 20),
  name: reqText("Content Name", 150),
});

export const contentUpdateSchema = contentCreateSchema.partial();

export type ContentCreate = z.infer<typeof contentCreateSchema>;
export type ContentUpdate = z.infer<typeof contentUpdateSchema>;

export const contentDefaults: Partial<z.input<typeof contentCreateSchema>> = {
  code: "",
  name: "",
};
