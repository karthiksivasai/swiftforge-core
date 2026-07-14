import { z } from "zod";

import { optEnum, optText, reqText } from "./_shared";

export const WEIGHT_UNITS = ["KGS", "LBS"] as const;

export const countryCreateSchema = z.object({
  code: reqText("Code", 20),
  name: reqText("Name", 150),
  weight_unit: optEnum(WEIGHT_UNITS),
  currency: optText(10),
  isd_code: optText(10),
});

export const countryUpdateSchema = countryCreateSchema.partial();

export type CountryCreate = z.infer<typeof countryCreateSchema>;
export type CountryUpdate = z.infer<typeof countryUpdateSchema>;

export const countryDefaults: Partial<z.input<typeof countryCreateSchema>> = {
  code: "",
  name: "",
  weight_unit: null,
  currency: "",
  isd_code: "",
};
