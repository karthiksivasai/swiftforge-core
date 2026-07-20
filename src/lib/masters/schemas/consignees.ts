import { z } from "zod";

import { optEmail, optText, reqText, uuidRef } from "./_shared";

export const PARTY_STATUSES = ["ACTIVE", "INACTIVE"] as const;

export const consigneeCreateSchema = z.object({
  code: reqText("Code", 50),
  name: reqText("Name", 200),
  destination_id: uuidRef(),
  destination_code: optText(50),
  contact_person: optText(200),
  address1: optText(500),
  address2: optText(500),
  telephone1: optText(30),
  telephone2: optText(30),
  fax: optText(30),
  industry_id: uuidRef(),
  service_center_id: uuidRef(),
  service_center_code: optText(50),
  eori: optText(50),
  vat: optText(50),
  kyc_type: optText(50),
  kyc_doc_no: optText(100),
  kyc_file_name: optText(200),
  customer_id: uuidRef(),
  customer_name: optText(200),
  mobile: reqText("Mobile", 30),
  email: optEmail(),
  address: optText(500),
  pin_code: optText(20),
  city: optText(100),
  state_id: uuidRef(),
  state_name: optText(100),
  country_id: uuidRef(),
  status: z.enum(PARTY_STATUSES).default("ACTIVE"),
});

export const consigneeUpdateSchema = consigneeCreateSchema.partial();

export type ConsigneeCreate = z.infer<typeof consigneeCreateSchema>;
export type ConsigneeUpdate = z.infer<typeof consigneeUpdateSchema>;

export const consigneeDefaults: Partial<z.input<typeof consigneeCreateSchema>> = {
  code: "",
  name: "",
  destination_code: "",
  destination_id: "",
  contact_person: "",
  address1: "",
  address2: "",
  telephone1: "",
  telephone2: "",
  fax: "",
  industry_id: "",
  service_center_id: "",
  service_center_code: "",
  eori: "",
  vat: "",
  kyc_type: "",
  kyc_doc_no: "",
  kyc_file_name: "",
  customer_name: "",
  customer_id: "",
  mobile: "",
  email: "",
  address: "",
  pin_code: "",
  city: "",
  state_id: "",
  state_name: "",
  country_id: "",
  status: "ACTIVE",
};
