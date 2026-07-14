import { z } from "zod";

import { optEmail, optText, reqText, uuidRef } from "./_shared";
import { PARTY_STATUSES } from "./consignees";

export const shipperCreateSchema = z.object({
  code: reqText("Code", 50),
  name: reqText("Name", 200),
  customer_id: uuidRef(),
  customer_name: optText(200),
  mobile: reqText("Mobile", 30),
  email: optEmail(),
  address: optText(500),
  pin_code: optText(20),
  city: optText(100),
  state_id: uuidRef(),
  country_id: uuidRef(),
  status: z.enum(PARTY_STATUSES).default("ACTIVE"),
});

export const shipperUpdateSchema = shipperCreateSchema.partial();

export type ShipperCreate = z.infer<typeof shipperCreateSchema>;
export type ShipperUpdate = z.infer<typeof shipperUpdateSchema>;

export const shipperDefaults: Partial<z.input<typeof shipperCreateSchema>> = {
  code: "",
  name: "",
  customer_name: "",
  customer_id: "",
  mobile: "",
  email: "",
  address: "",
  pin_code: "",
  city: "",
  state_id: "",
  country_id: "",
  status: "ACTIVE",
};
