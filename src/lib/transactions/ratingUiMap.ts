/**
 * Maps rating breakdown / snapshots → AWB Entry charge UI (server-authoritative).
 */
import type { RatingBreakdown } from "@/lib/transactions/resources/rating";

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
