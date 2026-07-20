import type { BaseRow } from "@/lib/masters/core/baseCrud";
import {
  IMPORT_MAX_ROWS,
  type ImportMaster,
  type ImportMode,
  type ImportResult,
  type ImportRow,
} from "@/lib/masters/core/import";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { supabase } from "@/integrations/supabase/client";
import { SIMPLE_PARTY_MASTER_PERMISSIONS } from "@/lib/permissions";
import {
  shipperCreateSchema,
  shipperUpdateSchema,
  type ShipperCreate,
  type ShipperUpdate,
} from "@/lib/masters/schemas/shippers";

export type ShipperRow = BaseRow & {
  code: string;
  name: string;
  origin_id: string | null;
  origin_code: string | null;
  contact_person: string | null;
  address1: string | null;
  address2: string | null;
  telephone1: string | null;
  telephone2: string | null;
  fax: string | null;
  industry_id: string | null;
  iec_no: string | null;
  gst_no: string | null;
  aadhar_no: string | null;
  pan_no: string | null;
  service_center_id: string | null;
  service_center_code: string | null;
  bank_ad_code: string | null;
  bank_account: string | null;
  bank_ifsc: string | null;
  firm: string | null;
  nfei: boolean;
  lut_number: string | null;
  lut_issue_date: string | null;
  lut_till_date: string | null;
  customer_id: string | null;
  customer_name: string | null;
  mobile: string;
  email: string | null;
  address: string | null;
  pin_code: string | null;
  city: string | null;
  state_id: string | null;
  state_name: string | null;
  country_id: string | null;
  status: "ACTIVE" | "INACTIVE";
};

const SHIPPER_COLUMNS =
  "id, tenant_id, code, name, origin_id, origin_code, contact_person, address1, address2, telephone1, telephone2, fax, industry_id, iec_no, gst_no, aadhar_no, pan_no, service_center_id, service_center_code, bank_ad_code, bank_account, bank_ifsc, firm, nfei, lut_number, lut_issue_date, lut_till_date, customer_id, customer_name, mobile, email, address, pin_code, city, state_id, state_name, country_id, status, created_at, created_by, updated_at, updated_by, deleted_at, row_version";

export const shippersResource: MasterResource<ShipperRow, ShipperCreate, ShipperUpdate> = {
  key: "shippers",
  table: "shippers",
  master: "shippers",
  permission: SIMPLE_PARTY_MASTER_PERMISSIONS.shippers,
  label: { singular: "Shipper", plural: "Shippers" },
  columns: SHIPPER_COLUMNS,
  searchColumns: ["code", "name", "origin_code", "address1", "mobile", "gst_no", "aadhar_no", "contact_person"],
  orderBy: "name",
  ascending: true,
  importColumns: [
    "code",
    "name",
    "origin_code",
    "contact_person",
    "address1",
    "address2",
    "telephone1",
    "telephone2",
    "fax",
    "mobile",
    "email",
    "iec_no",
    "gst_no",
    "aadhar_no",
    "pan_no",
    "service_center_code",
    "bank_ad_code",
    "bank_account",
    "bank_ifsc",
    "firm",
    "lut_number",
    "pin_code",
    "city",
    "state_code",
    "customer_code",
    "customer",
    "address",
    "country_code",
    "status",
  ],
  lookupKey: "shipper",
  createSchema: shipperCreateSchema,
  updateSchema: shipperUpdateSchema,
};

/** CourierWala / UI export headers → import column keys. */
export const SHIPPER_IMPORT_HEADER_ALIASES: Readonly<Record<string, readonly string[]>> = {
  code: ["Shipper Code", "ShipperCode", "Party Code"],
  name: ["Shipper Name", "ShipperName", "Party Name"],
  origin_code: ["Origin Code", "Origin", "Destination Code", "Dest Code"],
  contact_person: ["Contact Person", "Contact"],
  address1: ["Address1", "Address 1", "Address"],
  address2: ["Address2", "Address 2"],
  telephone1: ["Telephone1", "Telephone 1", "Tel. 1", "Tel 1"],
  telephone2: ["Telephone2", "Telephone 2", "Tel. 2", "Tel 2"],
  fax: ["Fax", "Fax No"],
  mobile: ["Mobile No", "Mobile Number", "Phone", "Tel"],
  gst_no: ["GST No", "GST Number", "GSTIN", "GST", "GST No."],
  aadhar_no: ["Aadhar No", "Aadhaar No", "Aadhar Number", "Aadhaar Number", "Aadhar No."],
  pan_no: ["PAN No", "PAN Number", "PAN No."],
  iec_no: ["IEC No", "IEC Number", "IEC No."],
  service_center_code: ["Service Center", "Service Centre", "Service Center Code"],
  bank_ad_code: ["Bank AD Code", "AD Code"],
  bank_account: ["Bank Account", "Account No"],
  bank_ifsc: ["Bank IFSC", "IFSC"],
  firm: ["Firm"],
  lut_number: ["LUT Number", "LUT No"],
  customer_code: ["Customer Code", "Cust Code"],
  customer: ["Customer Name", "Customer"],
  email: ["E-Mail", "Email Id", "Email ID"],
  address: ["Full Address"],
  pin_code: ["Pin Code", "Pincode", "ZIP", "Zip Code"],
  city: ["City Name"],
  state_code: ["State", "State Code", "State Name"],
  country_code: ["Country", "Country Code"],
  status: ["Shipper Status", "Active"],
};

const IMPORT_DEFAULT_MOBILE = "0000000000";

function rawValue(raw: Record<string, string> | undefined, ...keys: string[]): string {
  if (!raw) return "";
  const norm = (s: string) => s.toLowerCase().replace(/[\s_./-]+/g, "");
  const byNorm = new Map(Object.entries(raw).map(([k, v]) => [norm(k), String(v ?? "").trim()]));
  for (const key of keys) {
    const v = byNorm.get(norm(key));
    if (v) return v;
  }
  return "";
}

function cleanPartyText(value: string): string {
  return value.replace(/^\?+/, "").trim();
}

/** Normalize CourierWala shipper rows into origin / address / identity fields. */
export function normalizeShipperImportRow(
  row: Record<string, string>,
  raw?: Record<string, string>,
): Record<string, string> {
  const address1 =
    (row.address1 ?? "").trim() ||
    rawValue(raw, "Address1", "Address 1", "address1") ||
    (row.address ?? "").trim();
  const address2 =
    (row.address2 ?? "").trim() || rawValue(raw, "Address2", "Address 2", "address2");
  const originCode = (
    (row.origin_code ?? "").trim() ||
    rawValue(raw, "Origin Code", "Origin", "Destination Code", "Dest Code")
  ).toUpperCase();
  const contact = rawValue(raw, "Contact Person", "Contact");
  const mobile =
    (row.mobile ?? "").trim() ||
    rawValue(raw, "Mobile No", "Mobile Number", "Telephone1", "Phone") ||
    IMPORT_DEFAULT_MOBILE;

  return {
    ...row,
    code: cleanPartyText(row.code ?? ""),
    name: cleanPartyText(row.name ?? "") || cleanPartyText(contact),
    origin_code: originCode,
    contact_person: (row.contact_person ?? "").trim() || cleanPartyText(contact),
    address1,
    address2,
    address: (row.address ?? "").trim() || [address1, address2].filter(Boolean).join(", "),
    mobile,
    telephone1: (row.telephone1 ?? "").trim() || rawValue(raw, "Telephone1", "Telephone 1"),
    telephone2: (row.telephone2 ?? "").trim() || rawValue(raw, "Telephone2", "Telephone 2"),
    gst_no: (row.gst_no ?? "").trim() || rawValue(raw, "GST No", "GST Number", "GSTIN"),
    aadhar_no:
      (row.aadhar_no ?? "").trim() ||
      rawValue(raw, "Aadhar No", "Aadhaar No", "Aadhar Number", "Aadhaar"),
    pan_no: (row.pan_no ?? "").trim() || rawValue(raw, "PAN No", "PAN Number"),
    iec_no: (row.iec_no ?? "").trim() || rawValue(raw, "IEC No", "IEC Number"),
    customer: cleanPartyText(row.customer ?? "") || cleanPartyText(contact),
    status: (row.status ?? "").trim()
      ? (row.status ?? "")
          .trim()
          .toUpperCase()
          .replace(/IN-ACTIVE/gi, "INACTIVE")
          .replace(/-/g, "")
      : "ACTIVE",
  };
}

export type ShipperKycDocument = {
  kyc_type: string;
  file_name: string;
  entry_date: string;
};

export async function fetchShipperKyc(shipperId: string): Promise<ShipperKycDocument[]> {
  const { data, error } = await supabase
    .from("shipper_kyc_documents")
    .select("kyc_type, file_name, entry_date")
    .eq("shipper_id", shipperId)
    .order("seq", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((d) => ({
    kyc_type: d.kyc_type,
    file_name: d.file_name ?? "",
    entry_date: d.entry_date,
  }));
}

export async function replaceShipperKyc(
  shipperId: string,
  docs: ReadonlyArray<ShipperKycDocument>,
): Promise<void> {
  const { error } = await supabase.rpc("replace_shipper_kyc", {
    p_shipper_id: shipperId,
    p_docs: docs.map((d) => ({
      kyc_type: d.kyc_type,
      file_name: d.file_name,
      entry_date: d.entry_date,
    })),
  });
  if (error) throw new Error(error.message);
}

async function importShippersOnce(
  mode: ImportMode,
  rows: ReadonlyArray<ImportRow>,
): Promise<ImportResult> {
  if (rows.length > IMPORT_MAX_ROWS) {
    throw new Error(
      `Import batch of ${rows.length} exceeds the ${IMPORT_MAX_ROWS}-row limit.`,
    );
  }
  const { data, error } = await supabase.rpc("import_shippers", {
    p_mode: mode,
    p_rows: rows,
  });
  if (error) throw new Error(error.message);
  return data as ImportResult;
}

/** Soft-origin shipper import (origin_code always stored). */
export async function importShippersChunked(
  mode: ImportMode,
  rows: ReadonlyArray<ImportRow>,
  opts?: { chunkSize?: number },
): Promise<ImportResult & { job_ids: string[] }> {
  const chunkSize = Math.min(Math.max(1, opts?.chunkSize ?? 2000), IMPORT_MAX_ROWS);
  const aggregate: ImportResult & { job_ids: string[] } = {
    master: "shippers" satisfies ImportMaster,
    mode,
    job_id: null,
    total: 0,
    ok: 0,
    skipped: 0,
    error_count: 0,
    errors: [],
    job_ids: [],
  };

  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const res = await importShippersOnce(mode, chunk);
    aggregate.total += res.total;
    aggregate.ok += res.ok;
    aggregate.skipped += res.skipped;
    aggregate.error_count += res.error_count;
    if (res.job_id) aggregate.job_ids.push(res.job_id);
    for (const e of res.errors) {
      aggregate.errors.push({ ...e, row_no: e.row_no + offset });
    }
  }
  aggregate.job_id = aggregate.job_ids[0] ?? null;
  return aggregate;
}
