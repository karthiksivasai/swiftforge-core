import { z } from "zod";

import { optEmail, optText, reqText, uuidRef } from "./_shared";

export const VENDOR_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export const VENDOR_MODES = ["AIR", "SURFACE", "TRAIN", "COURIER", "EXPRESS"] as const;
export const VENDOR_CLASSES = ["OBC", "DELIVERY", "VENDOR", "AIRLINE"] as const;

const optNum = () =>
  z.union([z.string(), z.number(), z.null(), z.undefined()]).transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  });

const optBool = (defaultVal: boolean) =>
  z.union([z.boolean(), z.string(), z.null(), z.undefined()]).transform((v) => {
    if (v === null || v === undefined || v === "") return defaultVal;
    if (typeof v === "boolean") return v;
    const s = String(v).trim().toLowerCase();
    if (["true", "yes", "1", "y"].includes(s)) return true;
    if (["false", "no", "0", "n"].includes(s)) return false;
    return defaultVal;
  });

const normMode = () =>
  z.union([z.enum(VENDOR_MODES), z.string(), z.null(), z.undefined()]).transform((v) => {
    if (!v) return "COURIER" as const;
    const u = String(v).trim().toUpperCase().replace(/\s+/g, "_");
    return (VENDOR_MODES as readonly string[]).includes(u)
      ? (u as (typeof VENDOR_MODES)[number])
      : "COURIER";
  });

const normClass = () =>
  z.union([z.enum(VENDOR_CLASSES), z.string(), z.null(), z.undefined()]).transform((v) => {
    if (!v) return "VENDOR" as const;
    const u = String(v).trim().toUpperCase().replace(/\s+/g, "_");
    return (VENDOR_CLASSES as readonly string[]).includes(u)
      ? (u as (typeof VENDOR_CLASSES)[number])
      : "VENDOR";
  });

/** Vendor aggregate ROOT. */
export const vendorCreateSchema = z.object({
  code: reqText("Code", 50),
  name: reqText("Name", 200),
  contact_person: optText(200),
  address1: optText(300),
  address2: optText(300),
  pin_code: optText(20),
  city: optText(100),
  state_id: uuidRef(),
  phone1: optText(60),
  phone2: optText(60),
  fax: optText(60),
  mobile: reqText("Mobile", 30),
  email: optEmail(),
  website: optText(200),
  gst_no: optText(30),
  mode: normMode(),
  vendor_class: normClass(),
  fuel_head: optText(200),
  currency: optText(10).transform((v) => v ?? "INR"),
  origin_destination_id: uuidRef(),
  vendor_zip: optText(30),
  is_global: optBool(false),
  gst_applies: optBool(true),
  vol_weight_round_off: optBool(false),
  status: z.enum(VENDOR_STATUSES).default("ACTIVE"),
});

export const vendorUpdateSchema = vendorCreateSchema.partial();

export type VendorCreate = z.infer<typeof vendorCreateSchema>;
export type VendorUpdate = z.infer<typeof vendorUpdateSchema>;

export const vendorAddressSchema = z.object({
  address_type: optText(50),
  name: optText(200),
  address1: optText(300),
  address2: optText(300),
  address3: optText(300),
  pin_code: optText(20),
  city: optText(100),
  state_id: uuidRef(),
  country_id: uuidRef(),
  phone: optText(60),
  mobile: optText(30),
  email: optEmail(),
  is_default: optBool(false),
  remark: optText(500),
});

export const vendorContactSchema = z.object({
  contact_type: optText(100),
  name: optText(200),
  designation: optText(100),
  email: optEmail(),
  mobile: optText(30),
  landline: optText(30),
  extension: optText(20),
  is_primary: optBool(false),
  remark: optText(500),
});

export const vendorBankAccountSchema = z.object({
  bank_id: uuidRef(),
  account_name: optText(200),
  account_no: optText(50),
  ifsc: optText(20),
  branch: optText(200),
  is_default: optBool(false),
  remark: optText(500),
});

export const vendorDocumentSchema = z.object({
  doc_type: reqText("Document type", 100),
  file_name: optText(300),
  file_id: uuidRef(),
  remark: optText(500),
});

export const vendorServiceSchema = z.object({
  service: reqText("Service", 100),
  billing_vendor_id: uuidRef(),
  min_weight: optNum(),
  max_weight: optNum(),
  vendor_link: optText(200),
  is_single_piece: optBool(false),
  status: z.enum(VENDOR_STATUSES).default("ACTIVE"),
});

export const vendorApiCredentialSchema = z.object({
  carrier_code: reqText("Carrier code", 100),
  api_key: optText(500),
  api_secret: optText(500),
  endpoint_url: optText(500),
  username: optText(200),
  is_active: optBool(true),
  remark: optText(500),
});

export type VendorAddressInput = z.infer<typeof vendorAddressSchema>;
export type VendorContactInput = z.infer<typeof vendorContactSchema>;
export type VendorBankAccountInput = z.infer<typeof vendorBankAccountSchema>;
export type VendorDocumentInput = z.infer<typeof vendorDocumentSchema>;
export type VendorServiceInput = z.infer<typeof vendorServiceSchema>;
export type VendorApiCredentialInput = z.infer<typeof vendorApiCredentialSchema>;
