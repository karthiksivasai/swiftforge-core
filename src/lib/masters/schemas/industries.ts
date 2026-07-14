import { z } from "zod";

import { reqText } from "./_shared";

export const industryCreateSchema = z.object({
  code: reqText("Industry Code", 20),
  name: reqText("Industry Name", 150),
});

export const industryUpdateSchema = industryCreateSchema.partial();

export type IndustryCreate = z.infer<typeof industryCreateSchema>;
export type IndustryUpdate = z.infer<typeof industryUpdateSchema>;

export const industryDefaults: Partial<z.input<typeof industryCreateSchema>> = {
  code: "",
  name: "",
};
