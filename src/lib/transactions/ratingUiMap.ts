/**
 * Maps rating breakdown / snapshots / API rating results → AWB Entry charge UI.
 */
import type { RatingBreakdown } from "@/lib/transactions/resources/rating";
import type { RatingCalculationResult } from "@/lib/rating/ratingEngine";

export type RatingChargeLine = {
  id: string;
  description: string;
  rate: string;
  amount: string;
  fuelApply: string;
  fuelAmt: string;
  taxApply: string;
  taxOnFuel: string;
  igst: string;
  sgst: string;
  cgst: string;
  total: string;
  chargesType: string;
};

export type RatingSummary = {
  freight: string;
  fuel: string;
  tax: string;
  otherCharges: string;
  vendorCost: string;
  total: string;
  contractCharges: string;
  subTotal: string;
  totalFuel: string;
  igst: string;
  cgst: string;
  sgst: string;
  totalAmount: string;
};

function money(n: number): string {
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

function format3dp(n: number): string {
  return (Number.isFinite(n) ? n : 0).toFixed(3);
}

function formatGst4dp(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0.0000";
  // Format up to 4 decimal places, keeping 3 or 4 places as per display
  const str = n.toFixed(4);
  return str;
}

export function ratingToSummary(b: RatingBreakdown): RatingSummary {
  const freight = money(b.freight);
  const fuel = money(b.fuel);
  const tax = money(b.tax);
  const other = money(b.other_charges);
  const sub = money(b.freight + b.other_charges);
  return {
    freight,
    fuel,
    tax,
    otherCharges: other,
    vendorCost: money(b.vendor_cost),
    total: money(b.total),
    contractCharges: freight,
    subTotal: sub,
    totalFuel: fuel,
    igst: "0.00",
    cgst: "0.00",
    sgst: "0.00",
    totalAmount: money(b.total),
  };
}

/**
 * Formats full-precision RatingCalculationResult from /api/shipments/rate
 * into UI display values matching Xpresion reference output:
 * - Contract Charges: 3 dp
 * - Other Charges: 3 dp
 * - Sub Total: 3 dp
 * - Total Fuel: 3 dp
 * - CGST / SGST: up to 4 dp
 * - Total Amount: 2 dp
 */
export function apiRatingToSummary(r: RatingCalculationResult): RatingSummary {
  return {
    freight: money(r.contractCharges),
    fuel: money(r.fuelAmount),
    tax: money(r.cgst + r.sgst + r.igst),
    otherCharges: format3dp(r.otherCharges),
    vendorCost: "0.00",
    total: money(r.totalAmount),
    contractCharges: format3dp(r.contractCharges),
    subTotal: format3dp(r.subTotal),
    totalFuel: format3dp(r.fuelAmount),
    igst: formatGst4dp(r.igst),
    cgst: formatGst4dp(r.cgst),
    sgst: formatGst4dp(r.sgst),
    totalAmount: money(r.totalAmount),
  };
}

export function apiRatingToChargeLines(r: RatingCalculationResult): RatingChargeLine[] {
  return [
    {
      id: crypto.randomUUID(),
      description: "FREIGHT",
      rate: r.ratePerKg.toFixed(2),
      amount: format3dp(r.contractCharges),
      fuelApply: r.fuelAmount > 0 ? "Yes" : "Yes",
      fuelAmt: format3dp(r.fuelAmount),
      taxApply: "Yes",
      taxOnFuel: "Yes",
      igst: formatGst4dp(r.igst),
      sgst: formatGst4dp(r.sgst),
      cgst: formatGst4dp(r.cgst),
      total: money(r.totalAmount),
      chargesType: "System",
    },
  ];
}

export function ratingSnapshotToChargeLines(b: RatingBreakdown): RatingChargeLine[] {
  const snaps = (b.snapshot ?? []).filter(
    (s) => String(s.side ?? "CUSTOMER").toUpperCase() === "CUSTOMER",
  );
  if (snaps.length === 0) {
    return [
      {
        id: crypto.randomUUID(),
        description: "Freight",
        rate: money(b.freight),
        amount: money(b.freight),
        fuelApply: b.fuel > 0 ? "Yes" : "No",
        fuelAmt: money(b.fuel),
        taxApply: b.tax > 0 ? "Yes" : "No",
        taxOnFuel: "No",
        igst: "0.00",
        sgst: "0.00",
        cgst: "0.00",
        total: money(b.total),
        chargesType: "SYSTEM",
      },
    ];
  }
  return snaps.map((s) => ({
    id: String(s.id ?? crypto.randomUUID()),
    description: String(s.description ?? ""),
    rate: money(Number(s.rate ?? 0)),
    amount: money(Number(s.amount ?? 0)),
    fuelApply: s.fuel_applies ? "Yes" : "No",
    fuelAmt: money(Number(s.fuel_amount ?? 0)),
    taxApply: s.tax_applies ? "Yes" : "No",
    taxOnFuel: s.tax_on_fuel ? "Yes" : "No",
    igst: money(Number(s.igst ?? 0)),
    sgst: money(Number(s.sgst ?? 0)),
    cgst: money(Number(s.cgst ?? 0)),
    total: money(Number(s.total ?? 0)),
    chargesType: String(s.charges_type ?? "SYSTEM"),
  }));
}
