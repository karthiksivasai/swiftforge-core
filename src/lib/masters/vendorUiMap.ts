/**
 * Maps between the Vendor master UI wizard shape and DB / RPC payloads.
 */
import type {
  VendorAddressInput,
  VendorBankAccountInput,
  VendorContactInput,
  VendorDocumentInput,
  VendorServiceInput,
  VendorApiCredentialInput,
} from "@/lib/masters/schemas/vendors";
import type { VendorRow as VendorDbRow, VendorChildren } from "@/lib/masters/resources/vendors";

type Status = "Active" | "In-Active";

export type UiVendorAddressRow = {
  id: string;
  addressType: string;
  name: string;
  address1: string;
  address2: string;
  address3: string;
  pinCode: string;
  city: string;
  state: string;
  stateId: string;
  country: string;
  countryId: string;
  phone: string;
  mobile: string;
  email: string;
  isDefault: boolean;
  remark: string;
};

export type UiVendorContactRow = {
  id: string;
  contactType: string;
  name: string;
  designation: string;
  email: string;
  mobile: string;
  landline: string;
  extension: string;
  isPrimary: boolean;
  remark: string;
};

export type UiVendorBankRow = {
  id: string;
  bank: string;
  bankId: string;
  accountName: string;
  accountNo: string;
  ifsc: string;
  branch: string;
  isDefault: boolean;
  remark: string;
};

export type UiVendorDocumentRow = {
  id: string;
  docType: string;
  fileName: string;
  fileId: string;
  remark: string;
};

export type UiVendorServiceRow = {
  id: string;
  service: string;
  billingVendor: string;
  billingVendorId: string;
  minWeight: string;
  maxWeight: string;
  vendorLink: string;
  isSinglePiece: boolean;
  status: Status;
};

export type UiVendorApiCredentialRow = {
  id: string;
  carrierCode: string;
  apiKey: string;
  apiSecret: string;
  endpointUrl: string;
  username: string;
  isActive: boolean;
  remark: string;
};

export type UiVendorRow = {
  id: string;
  code: string;
  name: string;
  contactPerson: string;
  address1: string;
  address2: string;
  pinCode: string;
  city: string;
  state: string;
  stateId: string;
  phone1: string;
  phone2: string;
  fax: string;
  mobile: string;
  email: string;
  website: string;
  gstNo: string;
  fuelHead: string;
  currency: string;
  origin: string;
  originDestinationId: string;
  mode: string;
  vendorClass: string;
  vendorZip: string;
  status: Status;
  global: boolean;
  gst: boolean;
  volumetricWeightRoundOff: boolean;
  ratesFileName: string;
  addresses: UiVendorAddressRow[];
  contacts: UiVendorContactRow[];
  bankAccounts: UiVendorBankRow[];
  documents: UiVendorDocumentRow[];
  services: UiVendorServiceRow[];
  apiCredentials: UiVendorApiCredentialRow[];
  row_version?: number;
};

const toUiStatus = (s: string): Status => (s === "INACTIVE" ? "In-Active" : "Active");
const toDbStatus = (s: Status): "ACTIVE" | "INACTIVE" =>
  s === "In-Active" ? "INACTIVE" : "ACTIVE";

const titleMode = (m: string) => {
  const map: Record<string, string> = {
    AIR: "Air",
    SURFACE: "Surface",
    TRAIN: "Train",
    COURIER: "Courier",
    EXPRESS: "Express",
  };
  return map[m?.toUpperCase()] ?? m ?? "";
};

export function dbVendorToUi(
  r: VendorDbRow & Record<string, unknown>,
  children: VendorChildren = {
    addresses: [],
    contacts: [],
    bankAccounts: [],
    documents: [],
    services: [],
    apiCredentials: [],
  },
): UiVendorRow {
  const extras = (r.wizard_extras ?? {}) as Record<string, unknown>;
  const rates = (extras.rates as Record<string, unknown>) ?? {};

  return {
    id: r.id,
    code: r.code,
    name: r.name,
    contactPerson: r.contact_person ?? "",
    address1: r.address1 ?? "",
    address2: r.address2 ?? "",
    pinCode: r.pin_code ?? "",
    city: r.city ?? "",
    state: (r.state_name as string) ?? "",
    stateId: r.state_id ?? "",
    phone1: r.phone1 ?? "",
    phone2: r.phone2 ?? "",
    fax: r.fax ?? "",
    mobile: r.mobile,
    email: r.email ?? "",
    website: r.website ?? "",
    gstNo: r.gst_no ?? "",
    fuelHead: r.fuel_head ?? "",
    currency: r.currency ?? "INR",
    origin: (r.origin_name as string) ?? "",
    originDestinationId: r.origin_destination_id ?? "",
    mode: titleMode(r.mode),
    vendorClass: r.vendor_class ?? "VENDOR",
    vendorZip: r.vendor_zip ?? "",
    status: toUiStatus(r.status),
    global: r.is_global,
    gst: r.gst_applies,
    volumetricWeightRoundOff: r.vol_weight_round_off,
    ratesFileName: (rates.fileName as string) ?? "",
    addresses: children.addresses.map((a, i) => ({
      id: `addr-${i}`,
      addressType: a.address_type ?? "",
      name: a.name ?? "",
      address1: a.address1 ?? "",
      address2: a.address2 ?? "",
      address3: a.address3 ?? "",
      pinCode: a.pin_code ?? "",
      city: a.city ?? "",
      state: "",
      stateId: a.state_id ?? "",
      country: "",
      countryId: a.country_id ?? "",
      phone: a.phone ?? "",
      mobile: a.mobile ?? "",
      email: a.email ?? "",
      isDefault: a.is_default ?? false,
      remark: a.remark ?? "",
    })),
    contacts: children.contacts.map((c, i) => ({
      id: `con-${i}`,
      contactType: c.contact_type ?? "",
      name: c.name ?? "",
      designation: c.designation ?? "",
      email: c.email ?? "",
      mobile: c.mobile ?? "",
      landline: c.landline ?? "",
      extension: c.extension ?? "",
      isPrimary: c.is_primary ?? false,
      remark: c.remark ?? "",
    })),
    bankAccounts: children.bankAccounts.map((b, i) => ({
      id: `bank-${i}`,
      bank: "",
      bankId: b.bank_id ?? "",
      accountName: b.account_name ?? "",
      accountNo: b.account_no ?? "",
      ifsc: b.ifsc ?? "",
      branch: b.branch ?? "",
      isDefault: b.is_default ?? false,
      remark: b.remark ?? "",
    })),
    documents: children.documents.map((d, i) => ({
      id: `doc-${i}`,
      docType: d.doc_type ?? "",
      fileName: d.file_name ?? "",
      fileId: d.file_id ?? "",
      remark: d.remark ?? "",
    })),
    services: children.services.map((s, i) => ({
      id: `svc-${i}`,
      service: s.service ?? "",
      billingVendor: "",
      billingVendorId: s.billing_vendor_id ?? "",
      minWeight: s.min_weight != null ? String(s.min_weight) : "",
      maxWeight: s.max_weight != null ? String(s.max_weight) : "",
      vendorLink: s.vendor_link ?? "",
      isSinglePiece: s.is_single_piece ?? false,
      status: toUiStatus(s.status ?? "ACTIVE"),
    })),
    apiCredentials: children.apiCredentials.map((c, i) => ({
      id: `api-${i}`,
      carrierCode: c.carrier_code ?? "",
      apiKey: c.api_key ?? "",
      apiSecret: c.api_secret ?? "",
      endpointUrl: c.endpoint_url ?? "",
      username: c.username ?? "",
      isActive: c.is_active ?? true,
      remark: c.remark ?? "",
    })),
    row_version: r.row_version,
  };
}

export function uiVendorToSavePayload(form: UiVendorRow) {
  const fields = {
    code: form.code.trim(),
    name: form.name.trim(),
    contact_person: form.contactPerson || null,
    address1: form.address1 || null,
    address2: form.address2 || null,
    pin_code: form.pinCode || null,
    city: form.city || null,
    state_id: form.stateId || null,
    phone1: form.phone1 || null,
    phone2: form.phone2 || null,
    fax: form.fax || null,
    mobile: form.mobile.trim(),
    email: form.email || null,
    website: form.website || null,
    gst_no: form.gstNo || null,
    mode: form.mode || "Courier",
    vendor_class: form.vendorClass || "VENDOR",
    fuel_head: form.fuelHead || null,
    currency: form.currency || "INR",
    origin_destination_id: form.originDestinationId || null,
    vendor_zip: form.vendorZip || null,
    is_global: form.global,
    gst_applies: form.gst,
    vol_weight_round_off: form.volumetricWeightRoundOff,
    status: toDbStatus(form.status),
  };

  const wizardExtras = {
    rates: { fileName: form.ratesFileName || "" },
  };

  const addresses: VendorAddressInput[] = form.addresses.map((a) => ({
    address_type: a.addressType || null,
    name: a.name || null,
    address1: a.address1 || null,
    address2: a.address2 || null,
    address3: a.address3 || null,
    pin_code: a.pinCode || null,
    city: a.city || null,
    state_id: a.stateId || null,
    country_id: a.countryId || null,
    phone: a.phone || null,
    mobile: a.mobile || null,
    email: a.email || null,
    is_default: a.isDefault,
    remark: a.remark || null,
  }));

  const contacts: VendorContactInput[] = form.contacts.map((c) => ({
    contact_type: c.contactType || null,
    name: c.name || null,
    designation: c.designation || null,
    email: c.email || null,
    mobile: c.mobile || null,
    landline: c.landline || null,
    extension: c.extension || null,
    is_primary: c.isPrimary,
    remark: c.remark || null,
  }));

  const bankAccounts: VendorBankAccountInput[] = form.bankAccounts.map((b) => ({
    bank_id: b.bankId || null,
    account_name: b.accountName || null,
    account_no: b.accountNo || null,
    ifsc: b.ifsc || null,
    branch: b.branch || null,
    is_default: b.isDefault,
    remark: b.remark || null,
  }));

  const documents: VendorDocumentInput[] = form.documents.map((d) => ({
    doc_type: d.docType.trim(),
    file_name: d.fileName || null,
    file_id: d.fileId || null,
    remark: d.remark || null,
  }));

  const services: VendorServiceInput[] = form.services.map((s) => ({
    service: s.service.trim(),
    billing_vendor_id: s.billingVendorId || null,
    min_weight: s.minWeight || null,
    max_weight: s.maxWeight || null,
    vendor_link: s.vendorLink || null,
    is_single_piece: s.isSinglePiece,
    status: toDbStatus(s.status),
  }));

  const apiCredentials: VendorApiCredentialInput[] = form.apiCredentials.map((c) => ({
    carrier_code: c.carrierCode.trim(),
    api_key: c.apiKey || null,
    api_secret: c.apiSecret || null,
    endpoint_url: c.endpointUrl || null,
    username: c.username || null,
    is_active: c.isActive,
    remark: c.remark || null,
  }));

  return {
    fields,
    wizardExtras,
    addresses,
    contacts,
    bankAccounts,
    documents,
    services,
    apiCredentials,
  };
}
