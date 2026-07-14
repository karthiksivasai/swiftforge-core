import { z } from "zod";

import { optText, reqText } from "./_shared";

/**
 * Service Center — an AGGREGATE master (Milestone 9B).
 *
 * The root is a wide record (details + bank + invoice/voucher sequences); Terms
 * are a separate 1:N child collection persisted together with the root by the
 * `public.save_service_center` RPC (the Aggregate Save Pattern — see
 * docs/phase-3-setup). These schemas describe the ROOT column shape only; the
 * Terms collection is validated by `serviceCenterTermsSchema` below.
 */
export const serviceCenterCreateSchema = z.object({
  code: reqText("Code", 50),
  name: reqText("Name", 200),
  sub_name: optText(200),
  // address + location
  address1: optText(200),
  address2: optText(200),
  address3: optText(200),
  address4: optText(200),
  destination: optText(200),
  branch: optText(100),
  state: optText(100),
  state_code: optText(20),
  pin_code: optText(20),
  // contact + statutory
  telephone: optText(60),
  email: optText(200),
  gst_no: optText(30),
  gst_telephone: optText(60),
  pan_no: optText(20),
  icn_no: optText(30),
  st_no: optText(30),
  // bank details
  bank_name: optText(200),
  account_no: optText(50),
  account_name: optText(200),
  bank_address: optText(300),
  rtgs_ifsc: optText(30),
  micr: optText(30),
  // last invoice / voucher sequences
  last_invoice_prefix: optText(20),
  last_invoice_no: optText(30),
  last_invoice_suffix: optText(20),
  free_form_prefix: optText(20),
  last_free_form_invoice_no: optText(30),
  free_form_suffix: optText(20),
  debit_note_prefix: optText(20),
  debit_note_last_invoice_no: optText(30),
  debit_note_suffix: optText(20),
  credit_note_prefix: optText(20),
  credit_note_last_invoice_no: optText(30),
  credit_note_suffix: optText(20),
  rcp_last_no: optText(30),
});

export const serviceCenterUpdateSchema = serviceCenterCreateSchema.partial();

/** Terms child collection: ordered printable lines (blanks dropped by the RPC). */
export const serviceCenterTermsSchema = z.array(z.string().max(500)).max(50);

export type ServiceCenterCreate = z.infer<typeof serviceCenterCreateSchema>;
export type ServiceCenterUpdate = z.infer<typeof serviceCenterUpdateSchema>;

export const serviceCenterDefaults: Partial<z.input<typeof serviceCenterCreateSchema>> = {
  code: "",
  name: "",
};
