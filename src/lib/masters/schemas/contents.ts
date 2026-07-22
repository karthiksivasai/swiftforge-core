import { z } from "zod";

import { optText, reqText, uuidRef } from "./_shared";

export const contentCreateSchema = z.object({
  code: reqText("Content Code", 20),
  name: reqText("Content Name", 150),
  hsn_code: optText(40),
  vendor_id: uuidRef(),
  country_id: uuidRef(),
  clearance_cert_no: optText(80),
  notification_sub_type: optText(200),
  notification_sub_type1: optText(200),
  notification_no: optText(80),
  sr_no: optText(40),
  igst_notification: optText(200),
  igst_sr_no: optText(40),
  igstc_notification: optText(200),
  igstc_sr_no: optText(40),
});

export const contentUpdateSchema = contentCreateSchema.partial();

export type ContentCreate = z.infer<typeof contentCreateSchema>;
export type ContentUpdate = z.infer<typeof contentUpdateSchema>;

export const contentDefaults: Partial<z.input<typeof contentCreateSchema>> = {
  code: "",
  name: "",
  hsn_code: "",
  vendor_id: null,
  country_id: null,
  clearance_cert_no: "",
  notification_sub_type: "",
  notification_sub_type1: "",
  notification_no: "",
  sr_no: "",
  igst_notification: "",
  igst_sr_no: "",
  igstc_notification: "",
  igstc_sr_no: "",
};
