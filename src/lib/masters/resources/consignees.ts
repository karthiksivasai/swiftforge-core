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
  consigneeCreateSchema,
  consigneeUpdateSchema,
  type ConsigneeCreate,
  type ConsigneeUpdate,
} from "@/lib/masters/schemas/consignees";

export type ConsigneeRow = BaseRow & {
  code: string;
  name: string;
  destination_id: string | null;
  destination_code: string | null;
  contact_person: string | null;
  address1: string | null;
  address2: string | null;
  telephone1: string | null;
  telephone2: string | null;
  fax: string | null;
  industry_id: string | null;
  service_center_id: string | null;
  service_center_code: string | null;
  eori: string | null;
  vat: string | null;
  kyc_type: string | null;
  kyc_doc_no: string | null;
  kyc_file_name: string | null;
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

export const consigneesResource: MasterResource<ConsigneeRow, ConsigneeCreate, ConsigneeUpdate> =
  {
    key: "consignees",
    table: "consignees",
    master: "consignees",
    permission: SIMPLE_PARTY_MASTER_PERMISSIONS.consignees,
    label: { singular: "Consignee", plural: "Consignees" },
    columns:
      "id, tenant_id, code, name, destination_id, destination_code, contact_person, address1, address2, telephone1, telephone2, fax, industry_id, service_center_id, service_center_code, eori, vat, kyc_type, kyc_doc_no, kyc_file_name, customer_id, customer_name, mobile, email, address, pin_code, city, state_id, state_name, country_id, status, created_at, created_by, updated_at, updated_by, deleted_at, row_version",
    searchColumns: ["code", "name", "destination_code", "address1", "telephone1", "telephone2", "contact_person", "mobile"],
    orderBy: "name",
    ascending: true,
    importColumns: [
      "code",
      "name",
      "destination_code",
      "contact_person",
      "address1",
      "address2",
      "telephone1",
      "telephone2",
      "fax",
      "mobile",
      "email",
      "pin_code",
      "city",
      "state_code",
      "service_center_code",
      "eori",
      "vat",
      "customer_code",
      "customer",
      "address",
      "country_code",
      "status",
    ],
    lookupKey: "consignee",
    createSchema: consigneeCreateSchema,
    updateSchema: consigneeUpdateSchema,
  };

/** CourierWala / UI export headers → import column keys. */
export const CONSIGNEE_IMPORT_HEADER_ALIASES: Readonly<Record<string, readonly string[]>> = {
  code: ["Consignee Code", "ConsigneeCode", "Party Code"],
  name: ["Consignee Name", "ConsigneeName", "Party Name"],
  destination_code: ["Destination Code", "Dest Code", "Destination"],
  address1: ["Address1", "Address 1", "Address"],
  address2: ["Address2", "Address 2"],
  telephone1: ["Telephone1", "Telephone 1", "Tel1", "Tel 1", "Phone1", "Phone 1", "Mobile", "Mobile No"],
  telephone2: ["Telephone2", "Telephone 2", "Tel2", "Tel 2", "Phone2", "Phone 2"],
  customer_code: ["Customer Code", "Cust Code"],
  customer: ["Customer Name", "Customer", "Contact Person"],
  mobile: ["Mobile Number", "Phone", "Phone No", "Tel", "Telephone", "Contact No"],
  email: ["E-Mail", "Email Id", "Email ID"],
  address: ["Full Address"],
  pin_code: ["Pin Code", "Pincode", "ZIP", "Zip Code"],
  city: ["City Name"],
  state_code: ["State", "State Code", "State Name"],
  country_code: ["Country", "Country Code"],
  status: ["Consignee Status", "Active"],
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

/**
 * Normalize CourierWala consignee rows into destination / address / telephone fields.
 */
export function normalizeConsigneeImportRow(
  row: Record<string, string>,
  raw?: Record<string, string>,
): Record<string, string> {
  const address1 =
    (row.address1 ?? "").trim() ||
    rawValue(raw, "Address1", "Address 1", "address1") ||
    (row.address ?? "").trim();
  const address2 =
    (row.address2 ?? "").trim() || rawValue(raw, "Address2", "Address 2", "address2");
  const destinationCode = (
    (row.destination_code ?? "").trim() ||
    rawValue(raw, "Destination Code", "Dest Code", "destination_code")
  ).toUpperCase();
  const contact = rawValue(raw, "Contact Person", "Contact");
  const telephone1 =
    (row.telephone1 ?? "").trim() ||
    (row.mobile ?? "").trim() ||
    rawValue(raw, "Telephone1", "Telephone 1", "Mobile", "Mobile No") ||
    (/^\+?[\d\s()-]{8,}$/.test(contact) ? contact.replace(/\s+/g, "") : "");
  const telephone2 =
    (row.telephone2 ?? "").trim() ||
    rawValue(raw, "Telephone2", "Telephone 2");

  const combinedAddress = [address1, address2].filter(Boolean).join(", ");

  return {
    ...row,
    code: cleanPartyText(row.code ?? ""),
    name: cleanPartyText(row.name ?? "") || cleanPartyText(contact),
    destination_code: destinationCode,
    address1,
    address2,
    telephone1,
    telephone2,
    address: (row.address ?? "").trim() || combinedAddress,
    mobile: telephone1 || IMPORT_DEFAULT_MOBILE,
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

export type ConsigneeKycDocument = {
  kyc_type: string;
  file_name: string;
  entry_date: string;
};

export async function fetchConsigneeKyc(consigneeId: string): Promise<ConsigneeKycDocument[]> {
  const { data, error } = await supabase
    .from("consignee_kyc_documents")
    .select("kyc_type, file_name, entry_date")
    .eq("consignee_id", consigneeId)
    .order("seq", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((d) => ({
    kyc_type: d.kyc_type,
    file_name: d.file_name ?? "",
    entry_date: d.entry_date,
  }));
}

export async function replaceConsigneeKyc(
  consigneeId: string,
  docs: ReadonlyArray<ConsigneeKycDocument>,
): Promise<void> {
  const { error } = await supabase.rpc("replace_consignee_kyc", {
    p_consignee_id: consigneeId,
    p_docs: docs.map((d) => ({
      kyc_type: d.kyc_type,
      file_name: d.file_name,
      entry_date: d.entry_date,
    })),
  });
  if (error) throw new Error(error.message);
}

async function importConsigneesOnce(
  mode: ImportMode,
  rows: ReadonlyArray<ImportRow>,
): Promise<ImportResult> {
  if (rows.length > IMPORT_MAX_ROWS) {
    throw new Error(
      `Import batch of ${rows.length} exceeds the ${IMPORT_MAX_ROWS}-row limit.`,
    );
  }
  const { data, error } = await supabase.rpc("import_consignees", {
    p_mode: mode,
    p_rows: rows,
  });
  if (error) throw new Error(error.message);
  return data as ImportResult;
}

/** Soft-destination consignee import (destination_code always stored). */
export async function importConsigneesChunked(
  mode: ImportMode,
  rows: ReadonlyArray<ImportRow>,
  opts?: { chunkSize?: number },
): Promise<ImportResult & { job_ids: string[] }> {
  const chunkSize = Math.min(Math.max(1, opts?.chunkSize ?? 2000), IMPORT_MAX_ROWS);
  const aggregate: ImportResult & { job_ids: string[] } = {
    master: "consignees" satisfies ImportMaster,
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
    const res = await importConsigneesOnce(mode, chunk);
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
