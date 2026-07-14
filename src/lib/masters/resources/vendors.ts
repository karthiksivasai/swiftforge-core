import { supabase } from "@/integrations/supabase/client";
import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { VENDOR_AGGREGATE_PERMISSIONS } from "@/lib/permissions";
import {
  vendorCreateSchema,
  vendorUpdateSchema,
  type VendorCreate,
  type VendorUpdate,
  type VendorAddressInput,
  type VendorContactInput,
  type VendorBankAccountInput,
  type VendorDocumentInput,
  type VendorServiceInput,
  type VendorApiCredentialInput,
} from "@/lib/masters/schemas/vendors";

export type VendorRow = BaseRow & {
  code: string;
  name: string;
  contact_person: string | null;
  address1: string | null;
  address2: string | null;
  pin_code: string | null;
  city: string | null;
  state_id: string | null;
  phone1: string | null;
  phone2: string | null;
  fax: string | null;
  mobile: string;
  email: string | null;
  website: string | null;
  gst_no: string | null;
  mode: "AIR" | "SURFACE" | "TRAIN" | "COURIER" | "EXPRESS";
  vendor_class: "OBC" | "DELIVERY" | "VENDOR" | "AIRLINE";
  fuel_head: string | null;
  currency: string;
  origin_destination_id: string | null;
  vendor_zip: string | null;
  is_global: boolean;
  gst_applies: boolean;
  vol_weight_round_off: boolean;
  wizard_extras: Record<string, unknown>;
  status: "ACTIVE" | "INACTIVE";
};

const VENDOR_COLUMNS =
  "id, tenant_id, code, name, contact_person, address1, address2, pin_code, city, state_id, phone1, phone2, fax, mobile, email, website, gst_no, mode, vendor_class, fuel_head, currency, origin_destination_id, vendor_zip, is_global, gst_applies, vol_weight_round_off, wizard_extras, status, created_at, created_by, updated_at, updated_by, deleted_at, row_version";

export const vendorsResource: MasterResource<VendorRow, VendorCreate, VendorUpdate> = {
  key: "vendors",
  table: "vendors",
  master: "vendors",
  permission: VENDOR_AGGREGATE_PERMISSIONS.vendors,
  label: { singular: "Vendor", plural: "Vendors" },
  columns: VENDOR_COLUMNS,
  searchColumns: ["code", "name", "contact_person", "mobile", "email", "city"],
  orderBy: "name",
  ascending: true,
  importColumns: [
    "code",
    "name",
    "contact_person",
    "address1",
    "address2",
    "pin_code",
    "city",
    "state_code",
    "phone1",
    "phone2",
    "fax",
    "mobile",
    "email",
    "website",
    "gst_no",
    "mode",
    "vendor_class",
    "fuel_head",
    "currency",
    "origin_destination_code",
    "vendor_zip",
    "is_global",
    "gst_applies",
    "vol_weight_round_off",
    "status",
  ],
  lookupKey: "vendor",
  createSchema: vendorCreateSchema,
  updateSchema: vendorUpdateSchema,
};

export type DbVendorAddress = VendorAddressInput & { seq: number };
export type DbVendorContact = VendorContactInput & { seq: number };
export type DbVendorBankAccount = VendorBankAccountInput & { seq: number };
export type DbVendorDocument = VendorDocumentInput & { seq: number };
export type DbVendorService = VendorServiceInput & { seq: number };
export type DbVendorApiCredential = VendorApiCredentialInput & { seq: number };

export type VendorChildren = {
  addresses: DbVendorAddress[];
  contacts: DbVendorContact[];
  bankAccounts: DbVendorBankAccount[];
  documents: DbVendorDocument[];
  services: DbVendorService[];
  apiCredentials: DbVendorApiCredential[];
};

export async function fetchVendorChildren(vendorId: string): Promise<VendorChildren> {
  const [addresses, contacts, bankAccounts, documents, services, apiCredentials] =
    await Promise.all([
      supabase
        .from("vendor_addresses")
        .select(
          "seq, address_type, name, address1, address2, address3, pin_code, city, state_id, country_id, phone, mobile, email, is_default, remark",
        )
        .eq("vendor_id", vendorId)
        .order("seq", { ascending: true }),
      supabase
        .from("vendor_contacts")
        .select(
          "seq, contact_type, name, designation, email, mobile, landline, extension, is_primary, remark",
        )
        .eq("vendor_id", vendorId)
        .order("seq", { ascending: true }),
      supabase
        .from("vendor_bank_accounts")
        .select("seq, bank_id, account_name, account_no, ifsc, branch, is_default, remark")
        .eq("vendor_id", vendorId)
        .order("seq", { ascending: true }),
      supabase
        .from("vendor_documents")
        .select("seq, doc_type, file_name, file_id, remark")
        .eq("vendor_id", vendorId)
        .order("seq", { ascending: true }),
      supabase
        .from("vendor_services")
        .select(
          "seq, service, billing_vendor_id, min_weight, max_weight, vendor_link, is_single_piece, status",
        )
        .eq("vendor_id", vendorId)
        .order("seq", { ascending: true }),
      supabase
        .from("vendor_api_credentials")
        .select("seq, carrier_code, api_key, api_secret, endpoint_url, username, is_active, remark")
        .eq("vendor_id", vendorId)
        .order("seq", { ascending: true }),
    ]);

  for (const res of [addresses, contacts, bankAccounts, documents, services, apiCredentials]) {
    if (res.error) throw new Error(res.error.message);
  }

  return {
    addresses: (addresses.data ?? []) as DbVendorAddress[],
    contacts: (contacts.data ?? []) as DbVendorContact[],
    bankAccounts: (bankAccounts.data ?? []) as DbVendorBankAccount[],
    documents: (documents.data ?? []) as DbVendorDocument[],
    services: (services.data ?? []) as DbVendorService[],
    apiCredentials: (apiCredentials.data ?? []) as DbVendorApiCredential[],
  };
}

export async function saveVendor(args: {
  id: string | null;
  rowVersion: number | null;
  fields: VendorCreate | VendorUpdate;
  wizardExtras?: Record<string, unknown>;
  addresses?: VendorAddressInput[];
  contacts?: VendorContactInput[];
  bankAccounts?: VendorBankAccountInput[];
  documents?: VendorDocumentInput[];
  services?: VendorServiceInput[];
  apiCredentials?: VendorApiCredentialInput[];
}): Promise<VendorRow> {
  const { data, error } = await supabase.rpc("save_vendor", {
    p_id: args.id,
    p_row_version: args.rowVersion,
    p_fields: args.fields,
    p_wizard_extras: args.wizardExtras ?? {},
    p_addresses: args.addresses ?? [],
    p_contacts: args.contacts ?? [],
    p_bank_accounts: args.bankAccounts ?? [],
    p_documents: args.documents ?? [],
    p_services: args.services ?? [],
    p_api_credentials: args.apiCredentials ?? [],
  });
  if (error) throw new Error(error.message);
  return data as VendorRow;
}
