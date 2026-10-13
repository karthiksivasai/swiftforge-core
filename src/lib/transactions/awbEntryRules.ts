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
  return best ? String(best.value) : "5000";
}

/**
 * Vendor Master stores only a yes/no "Volumetric Weight Round off" flag, not a slab.
 * When the flag is on, charge weight rounds up to the next 0.500 kg.
 */
export function formatChargeWeight(weight: number, roundOff: boolean): string {
  const safe = Number.isFinite(weight) && weight > 0 ? weight : 0;
  if (!roundOff) return safe.toFixed(3);
  const steps = Math.ceil(safe * 2 - 1e-9);
  return (steps / 2).toFixed(3);
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
  let gst = 0;
  if (input.applyTax) gst += (amount * gstPct) / 100;
  if (input.applyTaxOnFuel) gst += (fuel * gstPct) / 100;
  const igst = !input.intraState ? gst : 0;
  const half = input.intraState ? gst / 2 : 0;
  const total = amount + fuel + gst;
  const money = (n: number) => n.toFixed(2);
  return {
    fuelAmt: money(fuel),
    igst: money(igst),
    cgst: money(half),
    sgst: money(half),
    total: money(total),
  };
}

export function balanceDue(total: string, received: string): string {
  const gross = Number.parseFloat(total) || 0;
  const paid = Number.parseFloat(received) || 0;
  return (gross - paid).toFixed(2);
}

export function hsnIsValid(code: string): boolean {
  const value = code.trim();
  if (!value) return true;
  return /^\d{8}$/.test(value);
}

/** Commercial and CSB 5 exports are zero-rated. Other AWBs use 18% GST. */
export function awbGstPercent(input: { commercial: boolean; csbType: string }): number {
  const csb = input.csbType.trim().toUpperCase();
  if (input.commercial || csb === "CSB 5" || csb === "COMMERCIAL" || csb === "CBE XIII") return 0;
  return 18;
}

/** Blank state on either side is treated as intra-state, matching the rating engine. */
export function awbIntraState(shipperState: string, consigneeState: string): boolean {
  const shipper = shipperState.trim().toUpperCase();
  const consignee = consigneeState.trim().toUpperCase();
  if (!shipper || !consignee) return true;
  return shipper === consignee;
}
