import { z } from "zod";

import { optText, reqText, reqUuid } from "./_shared";

export const countryPincodeCreateSchema = z.object({
  country_id: reqUuid("Country"),
  pin_code: reqText("Pin code", 20),
  // DB column is NOT NULL DEFAULT ''; treat as optional and coalesce to "".
  city_name: z
    .string()
    .trim()
    .max(150, "City name must be 150 characters or fewer")
    .optional()
    .transform((v) => v ?? ""),
  state_name: optText(150),
});

export const countryPincodeUpdateSchema = countryPincodeCreateSchema.partial();

export type CountryPincodeCreate = z.infer<typeof countryPincodeCreateSchema>;
export type CountryPincodeUpdate = z.infer<typeof countryPincodeUpdateSchema>;

export const countryPincodeDefaults: Partial<z.input<typeof countryPincodeCreateSchema>> = {
  country_id: "",
  pin_code: "",
  city_name: "",
  state_name: "",
};
