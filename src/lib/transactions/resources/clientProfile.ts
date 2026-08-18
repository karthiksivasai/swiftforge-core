/**
 * Reusable Client Profile Loader for AWB Entry and future transaction screens.
 *
 * Loads the complete Customer Master profile in one logical fetch and exposes
 * a stable shape (payment type, contacts, billing defaults, future extensions)
 * so screens can hydrate without field-by-field API calls.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  customersResource,
  fetchCustomerChildren,
  type CustomerRow,
  type DbCustomerAddress,
} from "@/lib/masters/resources/customers";

export type ClientLookupRef = {
  id?: string | null;
  code?: string | null;
  name?: string | null;
};

export type ClientLookupPair = { id?: string; code: string; name: string };

/** Canonical payment types used across Customer Master + AWB Entry. */
export const CLIENT_PAYMENT_TYPES = ["Cash", "Cheque", "Credit", "To Pay"] as const;
export type ClientPaymentType = (typeof CLIENT_PAYMENT_TYPES)[number];

/**
 * Complete client profile — extend `defaults` / `extensions` for future
 * rate cards, credit, preferred vendor/product, tax, invoice prefs, etc.
 * without changing AWB Entry wiring.
 */
export type ClientProfile = {
  id: string;
  code: string;
  name: string;
  paymentType: string | null;
  contactPerson: string;
  accountEmail: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  pincode: string;
  telephone: string;
  mobile: string;
  email: string;
  gstNo: string;
  iecNo: string;
  panNo: string;
  aadharNo: string;
  instructions: string;
  country: string;
  origin: ClientLookupPair;
  salesExecutive: ClientLookupPair;
  fieldExecutive: ClientLookupPair;
  defaultVendor: ClientLookupPair;
  /** Future-ready defaults bag (billing, credit, tax, invoice, etc.). */
  defaults: {
    currency: string;
    billingCycle: string | null;
    creditLimit: number | null;
    creditDays: number | null;
    closingBalance: number | null;
    unbilledAmount: number | null;
    creditAlertPct: number | null;
    invoiceFormat: string | null;
    fuelSurcharge: boolean;
    tax: boolean;
    noTariff: boolean;
    inclusiveTax: boolean;
    preferredProduct: ClientLookupPair;
    preferredVendor: ClientLookupPair;
    defaultService: string;
    customerInstructions: string;
  };
  /** Opaque wizard_extras + unused master fields for future loaders. */
  extensions: Record<string, unknown>;
};

export type AwbClientHydrate = {
  clientName: ClientLookupPair;
  paymentType: string;
  paymentTypeMissing: boolean;
  instruction: string;
  fieldExecutive: ClientLookupPair;
  shipper: {
    companyName: ClientLookupPair;
    origin: ClientLookupPair;
    contactName: string;
    address1: string;
    address2: string;
    pincode: string;
    city: string;
    state: string;
    country: string;
    telephone: string;
    mobileNo: string;
    email: string;
    iecNo: string;
    documentType: string;
    documentNo: string;
  };
  profile: ClientProfile;
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

/** Normalize master payment_type to a known label when possible (no hardcoding of client→type). */
export function normalizeClientPaymentType(raw: string | null | undefined): string {
  const t = str(raw);
  if (!t) return "";
  const match = CLIENT_PAYMENT_TYPES.find((p) => p.toLowerCase() === t.toLowerCase());
  return match ?? t;
}

function pairFromExtra(raw: unknown): ClientLookupPair {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    return {
      id: typeof o.id === "string" ? o.id : undefined,
      code: str(o.code),
      name: str(o.name) || str(o.code),
    };
  }
  const s = str(raw);
  if (!s) return { code: "", name: "" };
  // SearchField often stores the display name (or code) as a plain string.
  return { code: s, name: s };
}

function pickShipperAddress(
  row: CustomerRow,
  addresses: DbCustomerAddress[],
): {
  contactName: string;
  address1: string;
  address2: string;
  pincode: string;
  city: string;
  telephone: string;
  mobile: string;
  email: string;
  iecNo: string;
  gstNo: string;
  panNo: string;
  aadharNo: string;
  stateId: string | null;
  countryId: string | null;
} {
  const def = addresses.find((a) => a.is_default_shipper) ?? addresses[0];
  if (def) {
    return {
      contactName: str(def.name) || str(row.contact_person),
      address1: str(def.address1) || str(row.address1),
      address2: str(def.address2) || str(row.address2),
      pincode: str(def.pin_code) || str(row.pin_code),
      city: str(def.city) || str(row.city),
      telephone: str(def.landline) || str(row.tel1) || str(row.phone),
      mobile: str(def.mobile) || str(row.mobile),
      email: str(def.email) || str(row.email),
      iecNo: str(def.iec_no) || str(row.iec_no),
      gstNo: str(def.gst_no) || str(row.gst_no),
      panNo: str(def.pan_no) || str(row.pan_no),
      aadharNo: str(def.aadhar_no) || str(row.aadhar_no),
      stateId: def.state_id || row.state_id,
      countryId: def.country_id,
    };
  }
  return {
    contactName: str(row.contact_person),
    address1: str(row.address1),
    address2: str(row.address2),
    pincode: str(row.pin_code),
    city: str(row.city),
    telephone: str(row.tel1) || str(row.phone),
    mobile: str(row.mobile),
    email: str(row.email),
    iecNo: str(row.iec_no),
    gstNo: str(row.gst_no),
    panNo: str(row.pan_no),
    aadharNo: str(row.aadhar_no),
    stateId: row.state_id,
    countryId: null,
  };
}

function mapRowToProfile(row: CustomerRow, addresses: DbCustomerAddress[]): ClientProfile {
  const extras = asRecord(row.wizard_extras);
  const other = asRecord(extras.other);
  const shipper = pickShipperAddress(row, addresses);
  const paymentType = normalizeClientPaymentType(row.payment_type);
  const salesExecutive = pairFromExtra(other.salesExecutive);
  const fieldExecutive = pairFromExtra(other.fieldExecutive);
  const defaultVendor = pairFromExtra(other.defaultVendor);
  const preferredProduct = pairFromExtra(other.preferredProduct ?? other.defaultProduct);

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    paymentType: paymentType || null,
    contactPerson: shipper.contactName,
    accountEmail: str(other.accountEmail) || shipper.email,
    address1: shipper.address1,
    address2: shipper.address2,
    city: shipper.city,
    state: "",
    pincode: shipper.pincode,
    telephone: shipper.telephone,
    mobile: shipper.mobile,
    email: shipper.email,
    gstNo: shipper.gstNo,
    iecNo: shipper.iecNo,
    panNo: shipper.panNo,
    aadharNo: shipper.aadharNo,
    instructions: str(row.instructions),
    country: "",
    origin: pairFromExtra(row.origin),
    salesExecutive,
    fieldExecutive,
    defaultVendor,
    defaults: {
      currency: str(other.currency) || str(other.defaultCurrency) || "INR",
      billingCycle: row.billing_cycle,
      creditLimit: row.credit_limit,
      creditDays: row.credit_days,
      closingBalance: row.closing_balance,
      unbilledAmount: row.unbilled_amount,
      creditAlertPct: row.credit_alert_pct,
      invoiceFormat: row.invoice_format,
      fuelSurcharge: row.fuel_surcharge,
      tax: row.tax,
      noTariff: row.no_tariff,
      inclusiveTax: row.inclusive_tax,
      preferredProduct,
      preferredVendor: defaultVendor,
      defaultService: str(other.defaultService),
      customerInstructions: str(row.instructions),
    },
    extensions: {
      wizard_extras: extras,
      customer_type: row.customer_type,
      register_type: row.register_type,
      branch: row.branch,
      origin: row.origin,
      state_id: shipper.stateId,
      country_id: shipper.countryId,
      addresses,
    },
  };
}

async function resolveDestination(raw: string): Promise<ClientLookupPair> {
  const q = str(raw);
  if (!q) return { code: "", name: "" };
  const { data: byCode } = await supabase
    .from("destinations")
    .select("id, code, name")
    .is("deleted_at", null)
    .ilike("code", q)
    .limit(1)
    .maybeSingle();
  if (byCode) return { id: byCode.id, code: byCode.code, name: byCode.name };
  const { data: byName } = await supabase
    .from("destinations")
    .select("id, code, name")
    .is("deleted_at", null)
    .ilike("name", q)
    .limit(1)
    .maybeSingle();
  if (byName) return { id: byName.id, code: byName.code, name: byName.name };
  return { code: q.toUpperCase(), name: q };
}

async function resolveNameById(table: "states" | "countries", id: string | null | undefined): Promise<string> {
  if (!id) return "";
  const { data } = await supabase.from(table).select("name").eq("id", id).maybeSingle();
  return str(data?.name);
}

async function enrichShipperGeo(profile: ClientProfile): Promise<ClientProfile> {
  const extras = asRecord(profile.extensions);
  const stateId = str(extras.state_id) || null;
  const countryId = str(extras.country_id) || null;
  const originRaw = str(extras.origin) || profile.origin.code || profile.origin.name;

  const [origin, stateName, countryName] = await Promise.all([
    resolveDestination(originRaw),
    resolveNameById("states", stateId),
    resolveNameById("countries", countryId),
  ]);

  let city = profile.city;
  let state = profile.state || stateName;
  let country = profile.country || countryName;
  const pin = profile.pincode;

  if (pin.length >= 3 && (!city || !state || !country)) {
    try {
      const { searchPincodes } = await import("@/lib/pincodes/pincode.service");
      const rows = await searchPincodes({ prefix: pin, live: true, limit: 8 });
      const hit = rows.find((r) => r.pincode === pin) ?? rows[0];
      if (hit) {
        city = city || hit.city;
        state = state || hit.state;
        country = country || hit.country;
      }
    } catch {
      /* pincode lookup optional */
    }
  }

  if (!country && /^\d{6}$/.test(pin)) country = "INDIA";

  return {
    ...profile,
    city,
    state,
    country,
    origin: origin.code || origin.name ? origin : profile.origin,
  };
}

async function overlayLinkedShipper(profile: ClientProfile): Promise<ClientProfile> {
  const { data } = await supabase
    .from("shippers")
    .select(
      "id, code, name, origin_id, origin_code, contact_person, address1, address2, pin_code, city, state_name, telephone1, mobile, email, iec_no, gst_no, pan_no, aadhar_no",
    )
    .eq("customer_id", profile.id)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (!data) return profile;

  const originCode = str(data.origin_code);
  const resolved =
    originCode || data.origin_id
      ? await resolveDestination(originCode || str(data.origin_id))
      : profile.origin;
  const origin: ClientLookupPair = {
    ...resolved,
    id: data.origin_id || resolved.id,
  };

  return {
    ...profile,
    contactPerson: str(data.contact_person) || profile.contactPerson,
    address1: str(data.address1) || profile.address1,
    address2: str(data.address2) || profile.address2,
    pincode: str(data.pin_code) || profile.pincode,
    city: str(data.city) || profile.city,
    state: str(data.state_name) || profile.state,
    telephone: str(data.telephone1) || profile.telephone,
    mobile: str(data.mobile) || profile.mobile,
    email: str(data.email) || profile.email,
    iecNo: str(data.iec_no) || profile.iecNo,
    gstNo: str(data.gst_no) || profile.gstNo,
    panNo: str(data.pan_no) || profile.panNo,
    aadharNo: str(data.aadhar_no) || profile.aadharNo,
    origin: origin.code || origin.name ? origin : profile.origin,
  };
}

async function fetchCustomerRow(ref: ClientLookupRef): Promise<CustomerRow | null> {
  if (ref.id) {
    const { data, error } = await supabase
      .from(customersResource.table)
      .select(customersResource.columns)
      .eq("id", ref.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data as CustomerRow;
  }

  const code = str(ref.code);
  if (code) {
    const { data, error } = await supabase
      .from(customersResource.table)
      .select(customersResource.columns)
      .eq("code", code)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data as CustomerRow;
  }

  const name = str(ref.name);
  if (name) {
    const { data, error } = await supabase
      .from(customersResource.table)
      .select(customersResource.columns)
      .ilike("name", name)
      .is("deleted_at", null)
      .limit(2);
    if (error) throw new Error(error.message);
    if (data?.length === 1) return data[0] as CustomerRow;
  }

  return null;
}

/**
 * Load the full client profile (customer row + addresses) for hydrate.
 * Prefer `id` from lookup selection; falls back to unique `code`.
 */
export async function loadClientProfile(ref: ClientLookupRef): Promise<ClientProfile | null> {
  const row = await fetchCustomerRow(ref);
  if (!row) return null;

  let addresses: DbCustomerAddress[] = [];
  try {
    const children = await fetchCustomerChildren(row.id);
    addresses = children.addresses;
  } catch {
    /* addresses optional — root customer fields still hydrate */
  }

  let profile = mapRowToProfile(row, addresses);
  try {
    profile = await overlayLinkedShipper(profile);
  } catch {
    /* linked shipper optional */
  }
  try {
    profile = await enrichShipperGeo(profile);
  } catch {
    /* geo lookup optional */
  }
  return profile;
}

/** Map a loaded profile into AWB Entry form fields. */
export function clientProfileToAwbHydrate(profile: ClientProfile): AwbClientHydrate {
  const normalized = normalizeClientPaymentType(profile.paymentType);
  const paymentType = normalized || "Cash";
  const hasGst = Boolean(profile.gstNo);
  return {
    clientName: { id: profile.id, code: profile.code, name: profile.name },
    paymentType,
    paymentTypeMissing: !normalized,
    instruction: profile.instructions,
    fieldExecutive: profile.fieldExecutive,
    shipper: {
      companyName: { id: profile.id, code: profile.code, name: profile.name },
      origin: profile.origin,
      contactName: profile.contactPerson,
      address1: profile.address1,
      address2: profile.address2,
      pincode: profile.pincode,
      city: profile.city,
      state: profile.state,
      country: profile.country || "INDIA",
      telephone: profile.telephone,
      mobileNo: profile.mobile,
      email: profile.email || profile.accountEmail,
      iecNo: profile.iecNo,
      documentType: hasGst ? "GSTIN (Normal)" : profile.panNo ? "PAN Number" : "",
      documentNo: hasGst ? profile.gstNo : profile.panNo || profile.aadharNo,
    },
    profile,
  };
}
