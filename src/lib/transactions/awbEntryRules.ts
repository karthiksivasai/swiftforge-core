/** AWB rules backed by Customer Master, Vendor Master, and Charges Master. */

export type VolumetricFactor = {
  product?: string | null;
  vendor?: string | null;
  service?: string | null;
  cm_divisor?: number | null;
  inch_divisor?: number | null;
};

export type FuelSurchargeRow = {
  vendor?: string | null;
  product?: string | null;
  destination?: string | null;
  percentage?: number | null;
  from_date?: string | null;
  to_date?: string | null;
};

function token(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

/** Empty master text matches any AWB value. A filled value must match code or name. */
function fieldMatches(master: string | null | undefined, ...candidates: string[]): boolean {
  const wanted = token(master);
  if (!wanted) return true;
  return candidates.some((candidate) => {
    const have = token(candidate);
    return have !== "" && (have === wanted || have.includes(wanted) || wanted.includes(have));
  });
}

function specificity(row: VolumetricFactor): number {
  return [row.product, row.vendor, row.service].filter((part) => token(part) !== "").length;
}

/**
 * Division factor from Customer Master volumetrics.
 * Inches use inch_divisor. Every other unit uses cm_divisor.
 * The most specific product/vendor/service row wins. Fallback is 5000 (AIR cm).
 */
export function resolveDivision(input: {
  measurementUnit: string;
  productCode?: string;
  productName?: string;
  vendorCode?: string;
  vendorName?: string;
  serviceCode?: string;
  serviceName?: string;
  rows: VolumetricFactor[];
}): string {
  const inches = token(input.measurementUnit).startsWith("INCH");
  let best: { score: number; value: number } | null = null;
  for (const row of input.rows) {
    if (!fieldMatches(row.product, input.productCode ?? "", input.productName ?? "")) continue;
    if (!fieldMatches(row.vendor, input.vendorCode ?? "", input.vendorName ?? "")) continue;
    if (!fieldMatches(row.service, input.serviceCode ?? "", input.serviceName ?? "")) continue;
    const value = inches ? row.inch_divisor : row.cm_divisor;
    if (value == null || !(value > 0)) continue;
    const score = specificity(row);
    if (!best || score > best.score) best = { score, value };
  }
  if (best) return String(best.value);
  return inches ? "" : "5000";
}

/**
 * Vendor Master stores only a yes/no "Volumetric Weight Round off" flag, not a slab.
 * When the flag is on, charge weight rounds up to the next 0.500 kg.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const LOCK_STAMP_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** India business time, used on the AWB lock line. */
export function formatLockStamp(value: string | null | undefined): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const ist = new Date(parsed.getTime() + IST_OFFSET_MS);
  const day = String(ist.getUTCDate()).padStart(2, "0");
  const month = LOCK_STAMP_MONTHS[ist.getUTCMonth()] ?? "";
  const year = ist.getUTCFullYear();
  const hour = String(ist.getUTCHours()).padStart(2, "0");
  const minute = String(ist.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hour}:${minute}`;
}

export function lockedByCaption(name: string | null | undefined, at: string | null | undefined): string | null {
  const stamp = formatLockStamp(at);
  if (!stamp) return null;
  const who = name?.trim() || "Unknown user";
  return `Locked by ${who} on ${stamp}`;
}

/** Calendar date in India, including the hours before UTC midnight. */
export function istBookDate(now = new Date()): string {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const year = ist.getUTCFullYear();
  const month = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const day = String(ist.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** A book date may be today or earlier in IST. Blank is left to the date control. */
export function futureBookDateError(bookDate: string, today = istBookDate()): string | null {
  const day = bookDate.trim().slice(0, 10);
  if (!day) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "Book Date is not a valid date";
  if (day > today) return "Book Date cannot be in the future";
  return null;
}

export function formatChargeWeight(weight: number, roundOff: boolean): string {
  const safe = Number.isFinite(weight) && weight > 0 ? weight : 0;
  if (!roundOff) return safe.toFixed(3);
  const steps = Math.ceil(safe * 2 - 1e-9);
  return (steps / 2).toFixed(3);
}

/** Round a money amount to paise. */
export function roundMoney2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * One GST rule for the screen, the booking, and the invoice:
 * round the total GST to 2 decimals, then split that amount in half.
 * The second half is the remainder, so CGST + SGST equals the rounded total.
 */
export function splitRoundedGst(
  taxable: number,
  input: { intraState: boolean; gstPct: number },
): { igst: number; cgst: number; sgst: number; tax: number } {
  const base = Number.isFinite(taxable) ? taxable : 0;
  const rate = Number.isFinite(input.gstPct) && input.gstPct > 0 ? input.gstPct : 0;
  const tax = roundMoney2((base * rate) / 100);
  if (!input.intraState) return { igst: tax, cgst: 0, sgst: 0, tax };
  const cgst = roundMoney2(tax / 2);
  const sgst = roundMoney2(tax - cgst);
  return { igst: 0, cgst, sgst, tax: roundMoney2(cgst + sgst) };
}

export function fuelPercentFor(input: {
  rows: FuelSurchargeRow[];
  vendorCode?: string;
  vendorName?: string;
  productCode?: string;
  productName?: string;
  destinationCode?: string;
  destinationName?: string;
  bookDate?: string;
}): number {
  const day = (input.bookDate ?? "").slice(0, 10);
  let best: { score: number; pct: number } | null = null;
  for (const row of input.rows) {
    if (day && row.from_date && day < row.from_date.slice(0, 10)) continue;
    if (day && row.to_date && day > row.to_date.slice(0, 10)) continue;
    if (!fieldMatches(row.vendor, input.vendorCode ?? "", input.vendorName ?? "")) continue;
    if (!fieldMatches(row.product, input.productCode ?? "", input.productName ?? "")) continue;
    if (!fieldMatches(row.destination, input.destinationCode ?? "", input.destinationName ?? "")) continue;
    const pct = row.percentage;
    if (pct == null || !Number.isFinite(pct)) continue;
    const score = [row.vendor, row.product, row.destination].filter((part) => token(part) !== "").length;
    if (!best || score > best.score) best = { score, pct };
  }
  return best?.pct ?? 0;
}

export type ChargeMoney = {
  fuelAmt: string;
  igst: string;
  cgst: string;
  sgst: string;
  total: string;
};

/** Item total = item amount + fuel + GST. Tax flags come from Charges Master. */
export function manualChargeAmounts(input: {
  itemAmount: number;
  applyFuel: boolean;
  applyTaxOnFuel: boolean;
  applyTax: boolean;
  fuelPct: number;
  gstPct: number;
  intraState: boolean;
}): ChargeMoney {
  const amount = Number.isFinite(input.itemAmount) && input.itemAmount > 0 ? input.itemAmount : 0;
  const fuel = input.applyFuel ? (amount * input.fuelPct) / 100 : 0;
  const gstPct = input.gstPct > 0 ? input.gstPct : 0;
  const taxable =
    (input.applyTax ? amount : 0) + (input.applyTaxOnFuel ? fuel : 0);
  const split = splitRoundedGst(taxable, { intraState: input.intraState, gstPct });
  const total = amount + fuel + split.tax;
  const money = (n: number) => roundMoney2(n).toFixed(2);
  return {
    fuelAmt: money(fuel),
    igst: money(split.igst),
    cgst: money(split.cgst),
    sgst: money(split.sgst),
    total: money(total),
  };
}

export function balanceDue(total: string, received: string): string {
  const gross = Number.parseFloat(total) || 0;
  const paid = Number.parseFloat(received) || 0;
  return (gross - paid).toFixed(2);
}

/** Amount received cannot be more than the shipment total. */
export function amountReceivedError(total: string, received: string): string | null {
  const gross = Number.parseFloat(total) || 0;
  const paid = Number.parseFloat(received) || 0;
  if (paid > gross + 0.001) return "Amount received cannot be more than the total";
  return null;
}

const AWB_ERROR_FIELDS: Array<{ field: string; test: RegExp }> = [
  { field: "shipperMobile", test: /shipper mobile/i },
  { field: "shipperEmail", test: /shipper email/i },
  { field: "shipperIec", test: /shipper iec|invalid iec|iec is required on shipper/i },
  { field: "consigneeEmail", test: /consignee email/i },
  { field: "consigneeMobile", test: /consignee mobile|consignee phone/i },
  { field: "consigneeIec", test: /consignee iec/i },
  { field: "cashReceiptNo", test: /cash receipt no/i },
  { field: "cashReceiptDate", test: /cash receipt date/i },
  { field: "amountReceived", test: /amount received/i },
  { field: "expectedDelivery", test: /expected delivery/i },
  { field: "shipperAddress1", test: /shipper address/i },
  { field: "shipperPincode", test: /shipper pincode/i },
  { field: "shipperCity", test: /shipper city/i },
  { field: "shipperState", test: /shipper state/i },
  { field: "consigneeAddress1", test: /consignee address/i },
  { field: "consigneePostcode", test: /consignee postcode|consignee pincode/i },
  { field: "consigneeCity", test: /consignee city/i },
  { field: "reference", test: /reference no/i },
  { field: "manualAwb", test: /manual awb/i },
  { field: "client", test: /client name is required/i },
  { field: "origin", test: /^origin is required/i },
  { field: "shipperCompany", test: /shipper company/i },
  { field: "destination", test: /destination is required|consignee country/i },
  { field: "consigneeCompany", test: /consignee company/i },
  { field: "product", test: /product is required/i },
  { field: "vendor", test: /^vendor is required/i },
  { field: "service", test: /service is required/i },
  { field: "adCode", test: /ad code/i },
  { field: "bondUt", test: /bond\/ut|lut \(bond\/ut\)|lut number is required|valid lut/i },
  { field: "lutExpiry", test: /lut expiry date/i },
  { field: "payOfIgst", test: /payment of igst/i },
  { field: "csbType", test: /csb type|csb-iv\/iii|csb-v|csb 5/i },
  { field: "exportReason", test: /export reason/i },
  { field: "proformaLines", test: /proforma line item is required|proforma line/i },
];

/** Which screen field a save message belongs to, when it has one. */
export function awbErrorField(message: string): string | null {
  return AWB_ERROR_FIELDS.find((row) => row.test.test(message))?.field ?? null;
}

const AWB_LIMITS = {
  reference: 30,
  name: 100,
  address: 100,
  city: 50,
  phone: 15,
  email: 100,
  iec: 10,
} as const;

export function clipText(value: string, max: number): string {
  return value.slice(0, max);
}

function tooLong(label: string, value: string, max: number): string | null {
  const text = value.trim();
  if (text.length > max) return `${label} cannot be longer than ${max} characters`;
  return null;
}

/** Screen and server limits for the AWB header and the two parties. */
export function awbTextErrors(input: {
  referenceNo?: string;
  paymentType?: string;
  cashReceiptNo?: string;
  amountReceived?: string;
  cashReceiptDate?: string;
  bookDate?: string;
  expectedDeliveryDate?: string;
  totalAmount?: string;
  shipper?: PartyText;
  consignee?: PartyText;
}): string[] {
  const errors: string[] = [];
  const push = (message: string | null) => {
    if (message) errors.push(message);
  };
  push(tooLong("Reference No.", input.referenceNo ?? "", AWB_LIMITS.reference));
  for (const [role, party] of [
    ["Shipper", input.shipper],
    ["Consignee", input.consignee],
  ] as const) {
    if (!party) continue;
    push(tooLong(`${role} company name`, party.companyName ?? "", AWB_LIMITS.name));
    push(tooLong(`${role} contact name`, party.contactName ?? "", AWB_LIMITS.name));
    push(tooLong(`${role} address 1`, party.address1 ?? "", AWB_LIMITS.address));
    push(tooLong(`${role} address 2`, party.address2 ?? "", AWB_LIMITS.address));
    push(tooLong(`${role} city`, party.city ?? "", AWB_LIMITS.city));
    push(tooLong(`${role} state`, party.state ?? "", AWB_LIMITS.city));
    push(tooLong(`${role} telephone`, party.telephone ?? "", AWB_LIMITS.phone));
    push(tooLong(`${role} mobile`, party.mobile ?? "", AWB_LIMITS.phone));
    push(tooLong(`${role} email`, party.email ?? "", AWB_LIMITS.email));
    push(tooLong(`${role} IEC`, party.iecNo ?? "", AWB_LIMITS.iec));
    const email = (party.email ?? "").trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push(`${role} email is not a valid email address`);
    }
    const mobile = (party.mobile ?? "").trim();
    const country = (party.country ?? "").trim().toUpperCase();
    const india = country === "" || country === "INDIA" || country === "IN";
    if (role === "Shipper" && india && mobile && !/^\d{10}$/.test(mobile)) {
      errors.push("Shipper mobile must be 10 digits");
    }
    const iec = (party.iecNo ?? "").trim();
    if (iec && !/^[A-Za-z0-9]{10}$/.test(iec)) {
      errors.push(`${role} IEC must be 10 letters or numbers`);
    }
  }
  if ((input.paymentType ?? "").trim().toUpperCase() === "CASH") {
    if (!(input.cashReceiptNo ?? "").trim()) errors.push("Cash Receipt No. is required for a cash payment");
    if (!(input.amountReceived ?? "").trim() || Number(input.amountReceived) <= 0) {
      errors.push("Amount Received is required for a cash payment");
    }
    if (!(input.cashReceiptDate ?? "").trim()) errors.push("Cash Receipt Date is required for a cash payment");
  }
  push(amountReceivedError(input.totalAmount ?? "0", input.amountReceived ?? ""));
  const delivery = (input.expectedDeliveryDate ?? "").trim().slice(0, 10);
  const booked = (input.bookDate ?? "").trim().slice(0, 10);
  if (delivery && booked && delivery < booked) {
    errors.push("Expected delivery date cannot be before the book date");
  }
  return errors;
}

type PartyText = {
  companyName?: string;
  contactName?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  telephone?: string;
  mobile?: string;
  email?: string;
  country?: string;
  iecNo?: string;
};

/** Volumetric discount from the matched divisor row. None is configured, so this is 0. */
export function volumetricDiscountPct(rows: VolumetricFactor[]): number {
  for (const row of rows) {
    const pct = (row as VolumetricFactor & { discount_pct?: number | null }).discount_pct;
    if (pct != null && Number.isFinite(pct) && pct > 0) return pct;
  }
  return 0;
}

/** Money on screen and in the form. Blank stays blank. 324.5 becomes 324.50. */
export function formatMoney2(value: string | number | null | undefined): string {
  if (value == null) return "";
  const text = String(value).trim().replace(/,/g, "");
  if (!text) return "";
  const amount = Number.parseFloat(text);
  if (!Number.isFinite(amount)) return "";
  return roundMoney2(amount).toFixed(2);
}

export type StoredChargeDisplay = {
  freight: string;
  other: string;
  fuel: string;
  igst: string;
  cgst: string;
  sgst: string;
  total: string;
};

/**
 * Amounts shown when a saved AWB is opened. This reads the stored charge
 * lines only. It does not rate the shipment again.
 */
export function storedChargeDisplay(
  lines: Array<{
    description?: string;
    amount?: string | number | null;
    fuelAmt?: string | number | null;
    igst?: string | number | null;
    cgst?: string | number | null;
    sgst?: string | number | null;
    total?: string | number | null;
  }>,
): StoredChargeDisplay {
  const money = (value: string | number | null | undefined) => Number.parseFloat(formatMoney2(value) || "0");
  let freight = 0;
  let other = 0;
  let fuel = 0;
  let igst = 0;
  let cgst = 0;
  let sgst = 0;
  let total = 0;
  for (const line of lines) {
    const amount = money(line.amount);
    if (/freight/i.test(line.description ?? "")) freight += amount;
    else other += amount;
    fuel += money(line.fuelAmt);
    igst += money(line.igst);
    cgst += money(line.cgst);
    sgst += money(line.sgst);
    total += money(line.total);
  }
  return {
    freight: freight.toFixed(2),
    other: other.toFixed(2),
    fuel: fuel.toFixed(2),
    igst: igst.toFixed(2),
    cgst: cgst.toFixed(2),
    sgst: sgst.toFixed(2),
    total: total.toFixed(2),
  };
}

/**
 * A new AWB can rate as the form is filled. A saved AWB shows its stored
 * charges until a field that affects the rate changes.
 */
export function rateRefreshDecision(input: {
  isSavedAwb: boolean;
  loadedRateKey: string | null;
  currentRateKey: string;
}): "show-stored" | "recalculate" {
  if (!input.isSavedAwb) return "recalculate";
  if (!input.loadedRateKey || input.loadedRateKey === input.currentRateKey) return "show-stored";
  return "recalculate";
}

export function hsnIsValid(code: string): boolean {
  const value = code.trim();
  if (!value) return true;
  return /^\d{8}$/.test(value);
}

/**
 * GST percent for the preview. Commercial shipments are not zero-rated.
 * Pass the percent from the tax table. 18 is only the preview default.
 */
export function awbGstPercent(input?: {
  commercial?: boolean;
  csbType?: string;
  gstPercent?: number | null;
}): number {
  if (input?.gstPercent != null && Number.isFinite(input.gstPercent)) return input.gstPercent;
  return 18;
}

/**
 * True when both state codes are present and equal.
 * A blank state is not treated as a match.
 */
export function awbIntraState(billingState: string, branchState: string): boolean {
  const billing = billingState.trim().toUpperCase();
  const branch = branchState.trim().toUpperCase();
  if (!billing || !branch) return false;
  return billing === branch;
}

/** Letters, numbers, spaces, and hyphens. Empty is not a valid postcode. */
export function loosePostcodeOk(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9 -]{0,15}$/.test(value.trim());
}

export function consigneeBookingErrors(party: {
  companyName?: string;
  address1?: string;
  city?: string;
  postcode?: string;
  country?: string;
  phone?: string;
}): string[] {
  const errors: string[] = [];
  if (!party.companyName?.trim()) errors.push("Consignee company name is required");
  if (!party.address1?.trim()) errors.push("Consignee address 1 is required");
  if (!party.city?.trim()) errors.push("Consignee city is required");
  if (!party.postcode?.trim()) errors.push("Consignee postcode is required");
  else if (!loosePostcodeOk(party.postcode)) {
    errors.push("Consignee postcode can use letters, numbers, spaces, and hyphens only");
  }
  if (!party.country?.trim()) errors.push("Consignee country is required");
  if (!party.phone?.trim()) errors.push("Consignee phone is required");
  return errors;
}

type LookupLike = { code?: string; name?: string };

function isLookup(value: unknown): value is LookupLike {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Copy incoming text only into fields the user has not typed. */
export function fillEmptyPartyFields<T extends Record<string, unknown>>(current: T, incoming: T): T {
  const next = { ...current };
  for (const key of Object.keys(incoming)) {
    const value = incoming[key];
    const existing = current[key];
    if (isLookup(value) && isLookup(existing)) {
      const have = `${existing.code ?? ""} ${existing.name ?? ""}`.trim();
      const got = `${value.code ?? ""} ${value.name ?? ""}`.trim();
      if (!have && got) next[key as keyof T] = value as T[keyof T];
      continue;
    }
    if (typeof existing === "string" && existing.trim()) continue;
    if (typeof value === "string" && value.trim()) next[key as keyof T] = value as T[keyof T];
  }
  return next;
}

export function childAwbNo(awbNo: string, seq: number): string {
  const awb = awbNo.trim();
  if (!awb) return "";
  return `${awb}-${seq}`;
}

export function sumPieceCount(pieces: Array<string | number | null | undefined>): number {
  return pieces.reduce<number>((sum, value) => sum + (Number.parseFloat(String(value ?? "")) || 0), 0);
}
