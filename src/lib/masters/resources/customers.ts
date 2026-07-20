import { supabase } from "@/integrations/supabase/client";
import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { CUSTOMER_AGGREGATE_PERMISSIONS } from "@/lib/permissions";
import {
  customerCreateSchema,
  customerUpdateSchema,
  type CustomerCreate,
  type CustomerUpdate,
  type CustomerAddressInput,
  type CustomerFuelSurchargeInput,
  type CustomerOtherChargeInput,
  type CustomerVolumetricInput,
  type CustomerKycDocumentInput,
} from "@/lib/masters/schemas/customers";

export type CustomerRow = BaseRow & {
  code: string;
  name: string;
  branch: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  mobile: string;
  contract_head: string | null;
  address1: string | null;
  address2: string | null;
  pin_code: string | null;
  city: string | null;
  state_id: string | null;
  billing_state_id: string | null;
  tel1: string | null;
  tel2: string | null;
  fax: string | null;
  service_center_id: string | null;
  start_date: string | null;
  origin: string | null;
  gst_no: string | null;
  aadhar_no: string | null;
  dob_on_aadhar: string | null;
  passport_no: string | null;
  pan_no: string | null;
  tan_no: string | null;
  invoice_format: string | null;
  customer_type: "CUSTOMER" | "VENDOR" | "AGENT";
  register_type: "B2B" | "B2C";
  payment_type: string | null;
  billing_cycle: string | null;
  credit_limit: number | null;
  credit_days: number | null;
  registration_no: string | null;
  instructions: string | null;
  credit_alert_pct: number | null;
  closing_balance: number | null;
  unbilled_amount: number | null;
  ledger_head: string | null;
  contract_origin: string | null;
  business_channel: string | null;
  iec_no: string | null;
  bank_ad_code: string | null;
  bank_account: string | null;
  bank_ifsc: string | null;
  firm: string | null;
  lut_number: string | null;
  lut_issue_date: string | null;
  lut_till_date: string | null;
  shipper_type: string | null;
  nfei: boolean;
  fuel_surcharge: boolean;
  tax: boolean;
  no_tariff: boolean;
  inclusive_tax: boolean;
  allow_login_with_otp: boolean;
  wizard_extras: Record<string, unknown>;
  status: "ACTIVE" | "INACTIVE";
};

const CUSTOMER_COLUMNS =
  "id, tenant_id, code, name, branch, contact_person, phone, email, mobile, contract_head, address1, address2, pin_code, city, state_id, billing_state_id, tel1, tel2, fax, service_center_id, start_date, origin, gst_no, aadhar_no, dob_on_aadhar, passport_no, pan_no, tan_no, invoice_format, customer_type, register_type, payment_type, billing_cycle, credit_limit, credit_days, registration_no, instructions, credit_alert_pct, closing_balance, unbilled_amount, ledger_head, contract_origin, business_channel, iec_no, bank_ad_code, bank_account, bank_ifsc, firm, lut_number, lut_issue_date, lut_till_date, shipper_type, nfei, fuel_surcharge, tax, no_tariff, inclusive_tax, allow_login_with_otp, wizard_extras, status, created_at, created_by, updated_at, updated_by, deleted_at, row_version";

export const customersResource: MasterResource<CustomerRow, CustomerCreate, CustomerUpdate> = {
  key: "customers",
  table: "customers",
  master: "customers",
  permission: CUSTOMER_AGGREGATE_PERMISSIONS.customers,
  label: { singular: "Customer", plural: "Customers" },
  columns: CUSTOMER_COLUMNS,
  searchColumns: ["code", "name", "branch", "contact_person", "mobile", "email"],
  orderBy: "name",
  ascending: true,
  importColumns: [
    "code",
    "name",
    "branch",
    "contact_person",
    "phone",
    "email",
    "mobile",
    "contract_head",
    "service_center_code",
    "status",
  ],
  lookupKey: "customer",
  createSchema: customerCreateSchema,
  updateSchema: customerUpdateSchema,
};

/** UI / CourierWala-style headers → import_master column keys. */
export const CUSTOMER_IMPORT_HEADER_ALIASES: Readonly<Record<string, readonly string[]>> = {
  code: ["Customer Code", "Cust Code", "CustCode", "customercode"],
  name: ["Customer Name", "Cust Name", "Company Name", "customername"],
  branch: ["Branch Name", "Branch Code"],
  contact_person: ["Contact", "Contact Person", "Contact Name"],
  phone: [
    "Phone No",
    "Tel",
    "Telephone",
    "Phone Number",
    "Tel1",
    "Tel 1",
    "Landline",
    // CourierWala Customerlist.xlsx
    "customer_tel1",
    "customer_tel2",
    "customer_phone",
    "customer_mobile",
  ],
  email: [
    "E-Mail",
    "Email Id",
    "Email ID",
    "customer_e_mail",
    "customer_email",
    "customeremail",
  ],
  mobile: [
    "Mobile No",
    "Mobile Number",
    "Mobile No.",
    "Cell",
    "Cell No",
    "GSM",
    "Phone",
    "Phone No",
    "Tel",
    "Telephone",
    "Tel1",
    "Tel 1",
    // CourierWala Customerlist.xlsx — tel lives here, not in a Mobile column
    "customer_tel1",
    "customer_tel2",
    "customer_phone",
    "customer_mobile",
  ],
  contract_head: ["Contract", "Contract Head Name"],
  service_center_code: [
    "Service Centre",
    "Service Center",
    "Service Centre Code",
    "Service Center Code",
  ],
  status: ["Active", "Customer Status", "CustomerStatus"],
};

function looksLikePhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

/** Pull a phone-like value from any raw sheet column (tel1, customer_tel1, etc.). */
export function pickPhoneFromRawRow(raw: Record<string, string>): string {
  const entries = Object.entries(raw);
  const preferred = entries.filter(([k]) => {
    const n = k.toLowerCase().replace(/[\s_]+/g, "");
    return /(tel\d*|telephone|phone|mobile|cell|gsm)/.test(n) && !/(person|name|email)/.test(n);
  });
  for (const [, v] of preferred) {
    const t = (v ?? "").trim();
    if (t && looksLikePhone(t)) return t;
    if (t) return t;
  }
  for (const [, v] of entries) {
    const t = (v ?? "").trim();
    if (t && looksLikePhone(t)) return t;
  }
  return "";
}

/**
 * CourierWala sheets often have customer_tel1 / Phone but blank Mobile.
 * Backend requires mobile NOT NULL — fill from any phone-like field before import.
 * Rows with no phone at all get a placeholder so legacy lists still import.
 */
export const CUSTOMER_IMPORT_DEFAULT_MOBILE = "0000000000";

export function normalizeCustomerImportRow(
  row: Record<string, string>,
  raw?: Record<string, string>,
): Record<string, string> {
  const fromRaw = raw ? pickPhoneFromRawRow(raw) : "";
  const phone = (row.phone ?? "").trim() || fromRaw;
  const mobile =
    (row.mobile ?? "").trim() || phone || fromRaw || CUSTOMER_IMPORT_DEFAULT_MOBILE;
  const statusRaw = (row.status ?? "").trim();
  const status = statusRaw
    ? statusRaw.toUpperCase().replace(/IN-ACTIVE/gi, "INACTIVE").replace(/-/g, "")
    : "ACTIVE";
  return {
    ...row,
    phone: phone || mobile,
    mobile,
    status: status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
  };
}

export type DbCustomerAddress = CustomerAddressInput & { seq: number };
export type DbCustomerFuelSurcharge = CustomerFuelSurchargeInput & { seq: number };
export type DbCustomerOtherCharge = CustomerOtherChargeInput & { seq: number };
export type DbCustomerVolumetric = CustomerVolumetricInput & { seq: number };
export type DbCustomerKycDocument = CustomerKycDocumentInput & { seq: number };

export type CustomerChildren = {
  addresses: DbCustomerAddress[];
  fuelSurcharges: DbCustomerFuelSurcharge[];
  otherCharges: DbCustomerOtherCharge[];
  volumetrics: DbCustomerVolumetric[];
  kycDocuments: DbCustomerKycDocument[];
};

export async function fetchCustomerChildren(customerId: string): Promise<CustomerChildren> {
  const [addresses, fuel, other, volumetrics, kyc] = await Promise.all([
    supabase
      .from("customer_addresses")
      .select(
        "seq, contact_type, from_date, name, designation, email, mobile, landline, extension, address1, address2, address3, pin_code, city, state_id, country_id, remark, passport_no, aadhar_no, gst_no, pan_no, iec_no, ad_code, lut_no, is_default_shipper, kyc_file_name",
      )
      .eq("customer_id", customerId)
      .order("seq", { ascending: true }),
    supabase
      .from("customer_fuel_surcharges")
      .select("seq, entry_code, from_date, to_date, vendor, product, destination, percentage")
      .eq("customer_id", customerId)
      .order("seq", { ascending: true }),
    supabase
      .from("customer_other_charges")
      .select(
        "seq, charge_type, from_date, to_date, vendor, service, product, origin, destination, amount, minimum_value",
      )
      .eq("customer_id", customerId)
      .order("seq", { ascending: true }),
    supabase
      .from("customer_volumetrics")
      .select("seq, product, vendor, service, cm_divisor, inch_divisor, cft")
      .eq("customer_id", customerId)
      .order("seq", { ascending: true }),
    supabase
      .from("customer_kyc_documents")
      .select("seq, kyc_type, file_name")
      .eq("customer_id", customerId)
      .order("seq", { ascending: true }),
  ]);

  for (const res of [addresses, fuel, other, volumetrics, kyc]) {
    if (res.error) throw new Error(res.error.message);
  }

  return {
    addresses: (addresses.data ?? []) as DbCustomerAddress[],
    fuelSurcharges: (fuel.data ?? []) as DbCustomerFuelSurcharge[],
    otherCharges: (other.data ?? []) as DbCustomerOtherCharge[],
    volumetrics: (volumetrics.data ?? []) as DbCustomerVolumetric[],
    kycDocuments: (kyc.data ?? []) as DbCustomerKycDocument[],
  };
}

/** @deprecated use fetchCustomerChildren */
export async function fetchCustomerAddresses(customerId: string): Promise<DbCustomerAddress[]> {
  const children = await fetchCustomerChildren(customerId);
  return children.addresses;
}

export async function saveCustomer(args: {
  id: string | null;
  rowVersion: number | null;
  fields: CustomerCreate | CustomerUpdate;
  addresses: CustomerAddressInput[];
  wizardExtras?: Record<string, unknown>;
  fuelSurcharges?: CustomerFuelSurchargeInput[];
  otherCharges?: CustomerOtherChargeInput[];
  volumetrics?: CustomerVolumetricInput[];
  kycDocuments?: CustomerKycDocumentInput[];
}): Promise<CustomerRow> {
  const { data, error } = await supabase.rpc("save_customer", {
    p_id: args.id,
    p_row_version: args.rowVersion,
    p_fields: args.fields,
    p_addresses: args.addresses,
    p_wizard_extras: args.wizardExtras ?? {},
    p_fuel_surcharges: args.fuelSurcharges ?? [],
    p_other_charges: args.otherCharges ?? [],
    p_volumetrics: args.volumetrics ?? [],
    p_kyc_documents: args.kycDocuments ?? [],
  });
  if (error) throw new Error(error.message);
  return data as CustomerRow;
}
