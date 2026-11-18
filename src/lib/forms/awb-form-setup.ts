/**
 * AWB Entry Form Setup.
 *
 * One row per user is stored in public.awb_form_setup. The checkbox
 * `awbNoPlus1` stays in the payload so older rows still load, and the
 * page does not offer it. Numbering is allocated by app.claim_awb_no.
 */

export const AWB_FORM_SETUP_STORAGE_KEY = "cms.awb-form-setup.v1";
export const AWB_LAST_SAVED_STORAGE_KEY = "cms.awb-last-saved.v1";

export const AWB_FORM_SETUP_EDIT_SLUG = "txn.awb-form-setup";
export const AWB_PAYMENT_OVERRIDE_SLUG = "txn.awb-payment-override";

export const AWB_FORM_SETUP_KEYS = [
  "customerRepeat",
  "dateRepeat",
  "contentRepeat",
  "awbNoPlus1",
  "productRepeat",
  "consigneeNameRepeat",
  "instructionRepeat",
  "allowConsigneeNameBlank",
  "vendorRepeat",
  "airlineRepeat",
  "airlineNotRequired",
  "serviceRepeat",
  "destinationRepeat",
  "shipperDetailsRepeat",
  "consigneeNotRequired",
  "allowPaymentTypeOverride",
] as const;

export type AwbFormSetupKey = (typeof AWB_FORM_SETUP_KEYS)[number];
export type AwbFormSetupSettings = Record<AwbFormSetupKey, boolean>;

/** Checkboxes shown in the modal. AWB No Plus 1 is stored but not offered. */
export const AWB_FORM_SETUP_COLUMNS: Array<Array<{ key: AwbFormSetupKey; label: string }>> = [
  [
    { key: "customerRepeat", label: "Customer Repeat" },
    { key: "dateRepeat", label: "Date Repeat" },
    { key: "contentRepeat", label: "Content Repeat" },
  ],
  [
    { key: "productRepeat", label: "Product Repeat" },
    { key: "consigneeNameRepeat", label: "Consignee Name Repeat" },
    { key: "instructionRepeat", label: "Instruction Repeat" },
    { key: "allowConsigneeNameBlank", label: "Allow consignee Name Blank" },
  ],
  [
    { key: "vendorRepeat", label: "Vendor Repeat" },
    { key: "airlineRepeat", label: "Airline Repeat" },
    { key: "airlineNotRequired", label: "Airline Not Required" },
    { key: "serviceRepeat", label: "Service Repeat" },
  ],
  [
    { key: "destinationRepeat", label: "Destination Repeat" },
    { key: "shipperDetailsRepeat", label: "Shipper Details Repeat" },
    { key: "consigneeNotRequired", label: "Consignee Not Required" },
    { key: "allowPaymentTypeOverride", label: "Allow Payment Type Override" },
  ],
];

export const AWB_FIELD_MESSAGES = {
  destination: "Destination is required",
  consigneeCompany: "Consignee company name is required",
  consigneeAddress1: "Consignee address 1 is required",
  consigneeCity: "Consignee city is required",
  consigneePostcode: "Consignee postcode is required",
  consigneeCountry: "Consignee country is required",
  consigneePhone: "Consignee phone is required",
  airline: "Airline is required",
  paymentType: "Payment type must match the customer master",
} as const;

export function defaultAwbFormSetup(): AwbFormSetupSettings {
  return {
    customerRepeat: false,
    dateRepeat: false,
    contentRepeat: false,
    awbNoPlus1: false,
    productRepeat: false,
    consigneeNameRepeat: false,
    instructionRepeat: false,
    allowConsigneeNameBlank: false,
    vendorRepeat: false,
    airlineRepeat: false,
    airlineNotRequired: true,
    serviceRepeat: false,
    destinationRepeat: false,
    shipperDetailsRepeat: false,
    consigneeNotRequired: false,
    allowPaymentTypeOverride: true,
  };
}

export function parseAwbFormSetup(raw: unknown): AwbFormSetupSettings {
  const next = defaultAwbFormSetup();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return next;
  const record = raw as Record<string, unknown>;
  for (const key of AWB_FORM_SETUP_KEYS) {
    if (typeof record[key] === "boolean") next[key] = record[key];
  }
  return next;
}

export function legacyAwbFormSetupKeys(profileId?: string | null, authUserId?: string | null): string[] {
  const ids = [profileId, authUserId].filter((id): id is string => Boolean(id && id.trim()));
  return [...new Set(ids)].map((id) => `${AWB_FORM_SETUP_STORAGE_KEY}:${id}`);
}

export function readLegacyAwbFormSetup(
  storage: { getItem: (key: string) => string | null },
  profileId?: string | null,
  authUserId?: string | null,
): AwbFormSetupSettings | null {
  for (const key of legacyAwbFormSetupKeys(profileId, authUserId)) {
    const raw = storage.getItem(key);
    if (!raw) continue;
    try {
      return parseAwbFormSetup(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  return null;
}

export function clearLegacyAwbFormSetup(
  storage: { removeItem: (key: string) => void },
  profileId?: string | null,
  authUserId?: string | null,
): void {
  for (const key of legacyAwbFormSetupKeys(profileId, authUserId)) storage.removeItem(key);
}

export function lastSavedAwbStorageKey(userKey: string, branchId?: string | null): string {
  return `${AWB_LAST_SAVED_STORAGE_KEY}:${userKey || "anon"}:${branchId || "none"}`;
}

export function readLastSavedAwbId(
  storage: { getItem: (key: string) => string | null },
  userKey: string,
  branchId?: string | null,
): string | null {
  const value = storage.getItem(lastSavedAwbStorageKey(userKey, branchId));
  return value && value.trim() ? value.trim() : null;
}

export function writeLastSavedAwbId(
  storage: { setItem: (key: string, value: string) => void },
  userKey: string,
  branchId: string | null | undefined,
  awbId: string,
): void {
  if (!awbId.trim()) return;
  storage.setItem(lastSavedAwbStorageKey(userKey, branchId), awbId.trim());
}

export type AwbFieldRequirements = {
  destination: boolean;
  consigneeCompany: boolean;
  consigneeAddress1: boolean;
  consigneeCity: boolean;
  consigneePostcode: boolean;
  consigneeCountry: boolean;
  consigneePhone: boolean;
  airline: boolean;
};

/** Required-field rules shared by asterisks, navigation, and save checks. */
export function awbFieldRequirements(
  setup: Pick<AwbFormSetupSettings, "consigneeNotRequired" | "allowConsigneeNameBlank" | "airlineNotRequired">,
): AwbFieldRequirements {
  if (setup.consigneeNotRequired) {
    return {
      destination: false,
      consigneeCompany: false,
      consigneeAddress1: false,
      consigneeCity: false,
      consigneePostcode: false,
      consigneeCountry: false,
      consigneePhone: false,
      airline: !setup.airlineNotRequired,
    };
  }
  return {
    destination: true,
    consigneeCompany: !setup.allowConsigneeNameBlank,
    consigneeAddress1: true,
    consigneeCity: true,
    consigneePostcode: true,
    consigneeCountry: true,
    consigneePhone: true,
    airline: !setup.airlineNotRequired,
  };
}

export type RepeatLookup = { id?: string; code: string; name: string };

export type RepeatParty = {
  origin: RepeatLookup;
  companyName: RepeatLookup;
  contactName: string;
  address1: string;
  address2: string;
  pincode: string;
  city: string;
  state: string;
  telephone: string;
  mobileNo: string;
  email: string;
  country: string;
  iecNo: string;
  documentType: string;
  documentNo: string;
};

export type AwbRepeatForm = {
  clientName: RepeatLookup;
  bookDate: string;
  bookTime: string;
  content: string;
  product: RepeatLookup;
  vendor: RepeatLookup;
  airline: string;
  service: RepeatLookup;
  instruction: string;
  shipper: RepeatParty;
  consignee: RepeatParty;
  awbNo: string;
  chargeLines?: unknown[];
  customerChargesTotal?: string;
  vendorChargesTotal?: string;
};

function cloneLookup(pair: RepeatLookup): RepeatLookup {
  return { id: pair.id, code: pair.code, name: pair.name };
}

function cloneParty(party: RepeatParty): RepeatParty {
  return {
    ...party,
    origin: cloneLookup(party.origin),
    companyName: cloneLookup(party.companyName),
  };
}

/**
 * Copy only the fields selected in Form Setup onto a blank entry.
 * Charge lines and totals are never copied. Book time stays on the new form.
 * AWB numbers are never incremented here.
 */
export function applyAwbFormSetupRepeats<T extends AwbRepeatForm>(
  base: T,
  previous: T | null | undefined,
  setup: AwbFormSetupSettings,
): T {
  if (!previous) return base;
  let next: T = { ...base };
  if (setup.customerRepeat) next = { ...next, clientName: cloneLookup(previous.clientName) };
  if (setup.dateRepeat) next = { ...next, bookDate: previous.bookDate };
  if (setup.contentRepeat) next = { ...next, content: previous.content };
  if (setup.productRepeat) next = { ...next, product: cloneLookup(previous.product) };
  if (setup.vendorRepeat) next = { ...next, vendor: cloneLookup(previous.vendor) };
  if (setup.airlineRepeat) next = { ...next, airline: previous.airline };
  if (setup.serviceRepeat) next = { ...next, service: cloneLookup(previous.service) };
  if (setup.instructionRepeat) next = { ...next, instruction: previous.instruction };
  if (setup.shipperDetailsRepeat) next = { ...next, shipper: cloneParty(previous.shipper) };
  if (setup.destinationRepeat || setup.consigneeNameRepeat) {
    next = {
      ...next,
      consignee: {
        ...next.consignee,
        ...(setup.destinationRepeat ? { origin: cloneLookup(previous.consignee.origin) } : {}),
        ...(setup.consigneeNameRepeat
          ? {
              companyName: cloneLookup(previous.consignee.companyName),
              contactName: previous.consignee.contactName,
            }
          : {}),
      },
    };
  }
  return next;
}

/** The copied instruction wins only when Instruction Repeat is on. */
export function instructionAfterClientHydrate(input: {
  instructionRepeat: boolean;
  repeatedInstruction: string;
  clientInstruction: string;
}): string {
  if (input.instructionRepeat) return input.repeatedInstruction;
  return input.clientInstruction;
}

/**
 * Payment type lock. A blank customer master leaves the typed value.
 * A different value is kept only when the setup flag is on and the user
 * holds the override permission. That case is logged by the caller.
 */
export function resolvePaymentType(input: {
  allowPaymentTypeOverride: boolean;
  canOverride: boolean;
  masterPaymentType: string;
  submitted: string;
}): { paymentType: string; error: string | null; overrideLogged: boolean } {
  const master = input.masterPaymentType.trim();
  const submitted = input.submitted.trim();
  if (!master) return { paymentType: submitted, error: null, overrideLogged: false };
  if (!submitted || submitted.toLowerCase() === master.toLowerCase()) {
    return { paymentType: master, error: null, overrideLogged: false };
  }
  if (input.allowPaymentTypeOverride && input.canOverride) {
    return { paymentType: submitted, error: null, overrideLogged: true };
  }
  return {
    paymentType: master,
    error: AWB_FIELD_MESSAGES.paymentType,
    overrideLogged: false,
  };
}
