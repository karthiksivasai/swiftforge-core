import { z } from "zod";

import { optEmail, optText, reqText, uuidRef } from "./_shared";

export const CUSTOMER_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export const CUSTOMER_TYPES = ["CUSTOMER", "VENDOR", "AGENT"] as const;
export const REGISTER_TYPES = ["B2B", "B2C"] as const;

const optNum = () =>
  z.union([z.string(), z.number(), z.null(), z.undefined()]).transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  });

const optInt = () =>
  z.union([z.string(), z.number(), z.null(), z.undefined()]).transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
    return Number.isFinite(n) ? n : null;
  });

const optDate = () =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v && String(v).trim() ? String(v).trim() : null));

const optBool = (defaultVal: boolean) =>
  z.union([z.boolean(), z.string(), z.null(), z.undefined()]).transform((v) => {
    if (v === null || v === undefined || v === "") return defaultVal;
    if (typeof v === "boolean") return v;
    const s = String(v).trim().toLowerCase();
    if (["true", "yes", "1", "y"].includes(s)) return true;
    if (["false", "no", "0", "n"].includes(s)) return false;
    return defaultVal;
  });

/** Customer aggregate ROOT (personal + billing columns). */
export const customerCreateSchema = z.object({
  code: reqText("Code", 50),
  name: reqText("Name", 200),
  branch: optText(100),
  contact_person: optText(200),
  phone: optText(60),
  email: optEmail(),
  mobile: reqText("Mobile", 30),
  contract_head: optText(200),
  address1: optText(300),
  address2: optText(300),
  pin_code: optText(20),
  city: optText(100),
  state_id: uuidRef(),
  billing_state_id: uuidRef(),
  tel1: optText(60),
  tel2: optText(60),
  fax: optText(60),
  service_center_id: uuidRef(),
  start_date: optDate(),
  origin: optText(200),
  gst_no: optText(30),
  aadhar_no: optText(20),
  dob_on_aadhar: optDate(),
  passport_no: optText(30),
  pan_no: optText(20),
  tan_no: optText(20),
  invoice_format: optText(100),
  customer_type: z.enum(CUSTOMER_TYPES).default("CUSTOMER"),
  register_type: z.enum(REGISTER_TYPES).default("B2B"),
  payment_type: optText(50),
  billing_cycle: optText(50),
  credit_limit: optNum(),
  credit_days: optInt(),
  registration_no: optText(100),
  instructions: optText(500),
  credit_alert_pct: optNum(),
  closing_balance: optNum().default(0),
  unbilled_amount: optNum(),
  ledger_head: optText(200),
  contract_origin: optText(200),
  business_channel: optText(100),
  iec_no: optText(50),
  bank_ad_code: optText(50),
  bank_account: optText(50),
  bank_ifsc: optText(30),
  firm: optText(50),
  lut_number: optText(50),
  lut_issue_date: optDate(),
  lut_till_date: optDate(),
  shipper_type: optText(50),
  nfei: optBool(false),
  fuel_surcharge: optBool(true),
  tax: optBool(true),
  no_tariff: optBool(false),
  inclusive_tax: optBool(false),
  allow_login_with_otp: optBool(false),
  status: z.enum(CUSTOMER_STATUSES).default("ACTIVE"),
});

export const customerUpdateSchema = customerCreateSchema.partial();

export type CustomerCreate = z.infer<typeof customerCreateSchema>;
export type CustomerUpdate = z.infer<typeof customerUpdateSchema>;

export const customerAddressSchema = z.object({
  contact_type: optText(100),
  from_date: optDate(),
  name: optText(200),
  designation: optText(100),
  email: optEmail(),
  mobile: optText(30),
  landline: optText(30),
  extension: optText(20),
  address1: optText(300),
  address2: optText(300),
  address3: optText(300),
  pin_code: optText(20),
  city: optText(100),
  state_id: uuidRef(),
  country_id: uuidRef(),
  remark: optText(500),
  passport_no: optText(30),
  aadhar_no: optText(20),
  gst_no: optText(30),
  pan_no: optText(20),
  iec_no: optText(50),
  ad_code: optText(50),
  lut_no: optText(50),
  is_default_shipper: optBool(false),
  kyc_file_name: optText(200),
});

export type CustomerAddressInput = z.infer<typeof customerAddressSchema>;

export const customerFuelSurchargeSchema = z.object({
  entry_code: optText(50),
  from_date: optDate(),
  to_date: optDate(),
  vendor: optText(200),
  product: optText(200),
  destination: optText(200),
  percentage: optNum(),
});

export const customerOtherChargeSchema = z.object({
  charge_type: optText(100),
  from_date: optDate(),
  to_date: optDate(),
  vendor: optText(200),
  service: optText(100),
  product: optText(200),
  origin: optText(200),
  destination: optText(200),
  amount: optNum(),
  minimum_value: optNum(),
});

export const customerVolumetricSchema = z.object({
  product: optText(200),
  vendor: optText(200),
  service: optText(100),
  cm_divisor: optNum(),
  inch_divisor: optNum(),
  cft: optNum(),
});

export const customerKycDocumentSchema = z.object({
  kyc_type: reqText("KYC type", 100),
  file_name: optText(300),
});

export type CustomerFuelSurchargeInput = z.infer<typeof customerFuelSurchargeSchema>;
export type CustomerOtherChargeInput = z.infer<typeof customerOtherChargeSchema>;
export type CustomerVolumetricInput = z.infer<typeof customerVolumetricSchema>;
export type CustomerKycDocumentInput = z.infer<typeof customerKycDocumentSchema>;
