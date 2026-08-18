/**
 * Quick edit + search helpers for the AWB Client Name field.
 * Uses the existing Customer master (Supabase), not a separate REST resource.
 */
import { supabase } from "@/integrations/supabase/client";
import { lookup } from "@/lib/masters/core/lookup";
import {
  customersResource,
  fetchCustomerChildren,
  saveCustomer,
  type CustomerRow,
} from "@/lib/masters/resources/customers";
import { customerCreateSchema, type CustomerCreate } from "@/lib/masters/schemas/customers";

export const CUSTOMER_QUICK_DOCUMENT_TYPES = [
  "Aadhaar",
  "Driving License",
  "GSTIN",
  "IEC Certificate",
  "PAN",
  "Passport",
  "TAN",
  "Voter Id",
] as const;

export type CustomerQuickDocumentType = (typeof CUSTOMER_QUICK_DOCUMENT_TYPES)[number];

export type CustomerQuickEdit = {
  id: string;
  rowVersion: number;
  code: string;
  name: string;
  contactPerson: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  pincode: string;
  telephone: string;
  faxNo: string;
  mobileNo: string;
  email: string;
  documentType: string;
  documentNo: string;
  salesExecutive: string;
};

export type CustomerQuickEditErrors = Partial<Record<keyof CustomerQuickEdit, string>>;

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function documentFromRow(row: CustomerRow): { type: string; no: string } {
  if (str(row.gst_no)) return { type: "GSTIN", no: str(row.gst_no) };
  if (str(row.pan_no)) return { type: "PAN", no: str(row.pan_no) };
  if (str(row.aadhar_no)) return { type: "Aadhaar", no: str(row.aadhar_no) };
  if (str(row.iec_no)) return { type: "IEC Certificate", no: str(row.iec_no) };
  if (str(row.passport_no)) return { type: "Passport", no: str(row.passport_no) };
  if (str(row.tan_no)) return { type: "TAN", no: str(row.tan_no) };
  const extras = asRecord(row.wizard_extras);
  const other = asRecord(extras.other);
  return { type: str(other.documentType), no: str(other.documentNo) };
}

function applyDocumentFields(
  fields: CustomerCreate,
  documentType: string,
  documentNo: string,
): CustomerCreate {
  const type = documentType.trim().toUpperCase();
  const no = documentNo.trim();
  const next = { ...fields };
  if (!no || !type) return next;
  if (type.includes("GSTIN") || type === "GST") next.gst_no = no;
  else if (type.includes("PAN")) next.pan_no = no;
  else if (type.includes("AADHAAR") || type.includes("ADHAAR")) next.aadhar_no = no;
  else if (type.includes("IEC")) next.iec_no = no;
  else if (type.includes("PASSPORT")) next.passport_no = no;
  else if (type.includes("TAN")) next.tan_no = no;
  return next;
}

function rowToCreateFields(row: CustomerRow): CustomerCreate {
  const parsed = customerCreateSchema.safeParse({
    code: row.code,
    name: row.name,
    branch: row.branch,
    contact_person: row.contact_person,
    phone: row.phone,
    email: row.email && row.email.includes("@") ? row.email : null,
    mobile: row.mobile || "0",
    contract_head: row.contract_head,
    address1: row.address1,
    address2: row.address2,
    pin_code: row.pin_code,
    city: row.city,
    state_id: row.state_id,
    billing_state_id: row.billing_state_id,
    tel1: row.tel1,
    tel2: row.tel2,
    fax: row.fax,
    service_center_id: row.service_center_id,
    start_date: row.start_date,
    origin: row.origin,
    gst_no: row.gst_no,
    aadhar_no: row.aadhar_no,
    dob_on_aadhar: row.dob_on_aadhar,
    passport_no: row.passport_no,
    pan_no: row.pan_no,
    tan_no: row.tan_no,
    invoice_format: row.invoice_format,
    customer_type: row.customer_type,
    register_type: row.register_type,
    payment_type: row.payment_type,
    billing_cycle: row.billing_cycle,
    credit_limit: row.credit_limit,
    credit_days: row.credit_days,
    registration_no: row.registration_no,
    instructions: row.instructions,
    credit_alert_pct: row.credit_alert_pct,
    closing_balance: row.closing_balance,
    unbilled_amount: row.unbilled_amount,
    ledger_head: row.ledger_head,
    contract_origin: row.contract_origin,
    business_channel: row.business_channel,
    iec_no: row.iec_no,
    bank_ad_code: row.bank_ad_code,
    bank_account: row.bank_account,
    bank_ifsc: row.bank_ifsc,
    firm: row.firm,
    lut_number: row.lut_number,
    lut_issue_date: row.lut_issue_date,
    lut_till_date: row.lut_till_date,
    shipper_type: row.shipper_type,
    nfei: row.nfei,
    fuel_surcharge: row.fuel_surcharge,
    tax: row.tax,
    no_tariff: row.no_tariff,
    inclusive_tax: row.inclusive_tax,
    allow_login_with_otp: row.allow_login_with_otp,
    status: row.status,
  });
  if (parsed.success) return parsed.data;
  return customerCreateSchema.parse({
    code: row.code || "NEW",
    name: row.name || "Customer",
    mobile: row.mobile || "0",
    customer_type: row.customer_type ?? "CUSTOMER",
    register_type: row.register_type ?? "B2B",
    status: row.status ?? "ACTIVE",
  });
}

async function resolveStateId(stateName: string, fallback: string | null): Promise<string | null> {
  const q = stateName.trim();
  if (!q) return fallback;
  const { data } = await supabase
    .from("states")
    .select("id, name")
    .ilike("name", q)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  return data?.id ?? fallback;
}

export function emptyCustomerQuickEdit(): CustomerQuickEdit {
  return {
    id: "",
    rowVersion: 0,
    code: "",
    name: "",
    contactPerson: "",
    address1: "",
    address2: "",
    city: "",
    state: "",
    pincode: "",
    telephone: "",
    faxNo: "",
    mobileNo: "",
    email: "",
    documentType: "",
    documentNo: "",
    salesExecutive: "",
  };
}

export function validateCustomerQuickEdit(
  edit: CustomerQuickEdit,
  opts?: { requireCode?: boolean },
): CustomerQuickEditErrors {
  const errors: CustomerQuickEditErrors = {};
  if (opts?.requireCode && !edit.code.trim()) errors.code = "Code is required";
  if (!edit.name.trim()) errors.name = "Name is required";
  if (!edit.address1.trim()) errors.address1 = "Address is required";
  if (!edit.city.trim()) errors.city = "City is required";
  if (!edit.state.trim()) errors.state = "State is required";
  if (!edit.pincode.trim()) errors.pincode = "Pincode is required";
  if (!edit.mobileNo.trim()) errors.mobileNo = "Mobile No is required";
  return errors;
}

export async function searchCustomersForHelp(term: string): Promise<Array<{ id: string; code: string; name: string }>> {
  const q = term.trim();
  const rows = await lookup("customer", q, 20);
  return rows.map((r) => ({ id: r.id, code: r.code, name: r.name }));
}

export async function loadCustomerQuickEditByPair(pair: {
  id?: string;
  code: string;
  name: string;
}): Promise<CustomerQuickEdit | null> {
  if (pair.id) {
    const byId = await loadCustomerQuickEdit(pair.id);
    if (byId) return byId;
  }
  const code = pair.code.trim();
  if (code) {
    const { data, error } = await supabase
      .from(customersResource.table)
      .select("id")
      .eq("code", code)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.id) return loadCustomerQuickEdit(data.id);
  }
  return null;
}

export async function loadCustomerQuickEdit(id: string): Promise<CustomerQuickEdit | null> {
  const { data, error } = await supabase
    .from(customersResource.table)
    .select(customersResource.columns)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as CustomerRow;
  const extras = asRecord(row.wizard_extras);
  const other = asRecord(extras.other);
  const doc = documentFromRow(row);
  let stateName = str(other.stateName);
  if (!stateName && row.state_id) {
    const { data: state } = await supabase.from("states").select("name").eq("id", row.state_id).maybeSingle();
    stateName = str(state?.name);
  }
  const sales =
    other.salesExecutive && typeof other.salesExecutive === "object"
      ? str((other.salesExecutive as { name?: string }).name) || str((other.salesExecutive as { code?: string }).code)
      : str(other.salesExecutive);

  return {
    id: row.id,
    rowVersion: row.row_version,
    code: row.code,
    name: row.name,
    contactPerson: str(row.contact_person),
    address1: str(row.address1),
    address2: str(row.address2),
    city: str(row.city),
    state: stateName,
    pincode: str(row.pin_code),
    telephone: str(row.tel1) || str(row.phone),
    faxNo: str(row.fax),
    mobileNo: str(row.mobile),
    email: str(row.email),
    documentType: doc.type,
    documentNo: doc.no,
    salesExecutive: sales,
  };
}

function wizardExtrasFromEdit(
  extras: Record<string, unknown>,
  edit: CustomerQuickEdit,
): Record<string, unknown> {
  const other = asRecord(extras.other);
  return {
    ...extras,
    other: {
      ...other,
      stateName: edit.state.trim(),
      documentType: edit.documentType,
      documentNo: edit.documentNo,
      salesExecutive: edit.salesExecutive.trim(),
    },
  };
}

function overlayQuickEditFields(
  base: CustomerCreate,
  edit: CustomerQuickEdit,
  stateId: string | null,
): CustomerCreate {
  return applyDocumentFields(
    {
      ...base,
      name: edit.name.trim(),
      contact_person: edit.contactPerson.trim() || null,
      address1: edit.address1.trim(),
      address2: edit.address2.trim() || null,
      city: edit.city.trim(),
      pin_code: edit.pincode.trim(),
      tel1: edit.telephone.trim() || null,
      fax: edit.faxNo.trim() || null,
      mobile: edit.mobileNo.trim(),
      email: edit.email.trim() && edit.email.includes("@") ? edit.email.trim() : null,
      state_id: stateId,
    },
    edit.documentType,
    edit.documentNo,
  );
}

export async function saveCustomerQuickEdit(edit: CustomerQuickEdit): Promise<CustomerRow> {
  const creating = !edit.id;
  const errors = validateCustomerQuickEdit(edit, { requireCode: creating });
  if (Object.keys(errors).length) {
    throw new Error(Object.values(errors)[0] ?? "Please fill required fields");
  }

  if (creating) {
    const stateId = await resolveStateId(edit.state, null);
    const fields = overlayQuickEditFields(
      customerCreateSchema.parse({
        code: edit.code.trim().toUpperCase(),
        name: edit.name.trim(),
        mobile: edit.mobileNo.trim(),
      }),
      edit,
      stateId,
    );
    return saveCustomer({
      id: null,
      rowVersion: null,
      fields: { ...fields, code: edit.code.trim().toUpperCase() },
      addresses: [],
      wizardExtras: wizardExtrasFromEdit({}, edit),
    });
  }

  const { data, error } = await supabase
    .from(customersResource.table)
    .select(customersResource.columns)
    .eq("id", edit.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Customer not found");
  const row = data as CustomerRow;
  const stateId = await resolveStateId(edit.state, row.state_id);
  const children = await fetchCustomerChildren(row.id);

  return saveCustomer({
    id: row.id,
    rowVersion: edit.rowVersion || row.row_version,
    fields: overlayQuickEditFields(rowToCreateFields(row), edit, stateId),
    addresses: children.addresses,
    wizardExtras: wizardExtrasFromEdit(asRecord(row.wizard_extras), edit),
    fuelSurcharges: children.fuelSurcharges,
    otherCharges: children.otherCharges,
    volumetrics: children.volumetrics,
    kycDocuments: children.kycDocuments,
  });
}
