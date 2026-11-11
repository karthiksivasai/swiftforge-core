/**
 * Pure Rate Update quote used by the screen and the unit tests.
 * The database function app.quote_rate_update_shipment (migration 0151)
 * uses the same rules. Preview never writes. Apply writes only after confirm.
 *
 * Vendor OBC Rate is not a price. There is no OBC calculation, so the screen
 * does not offer it.
 */

export type RateUpdateKind = "AWB_RATE" | "VENDOR_RATE" | "TAX_FUEL";

export type SkipReason = "locked" | "invoiced" | "cancelled";

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Customer freight: chargeable weight times the rate per kg. */
export function freightAmount(weight: number, minWeight: number, ratePerKg: number): number {
  const chargeable = Math.max(weight, minWeight);
  return roundMoney(chargeable * ratePerKg);
}

export function fuelAmount(freight: number, fuelPct: number): number {
  return roundMoney((freight * fuelPct) / 100);
}

export function taxAmount(taxable: number, taxPct: number): number {
  return roundMoney((taxable * taxPct) / 100);
}

export function customerTotal(
  freight: number,
  fuel: number,
  tax: number,
  manualTotal: number,
  otherTotal: number,
): number {
  return roundMoney(freight + fuel + tax + manualTotal + otherTotal);
}

export function skipReason(shipment: {
  isLocked: boolean;
  invoiceId: string | null;
  status: string;
}): SkipReason | null {
  if (shipment.isLocked) return "locked";
  if (shipment.invoiceId) return "invoiced";
  if (shipment.status === "CANCELLED" || shipment.status === "VOID") return "cancelled";
  return null;
}

export function skipReasonLabel(reason: SkipReason | string | null): string {
  if (reason === "locked") return "Locked";
  if (reason === "invoiced") return "Invoiced";
  if (reason === "cancelled") return "Cancelled";
  return reason ? String(reason) : "";
}

/** Ok is blocked when customer, vendor, and destination are all blank. */
export function rateUpdateScopeBlocked(input: {
  customer: string;
  vendor: string;
  destination: string;
  confirmAll: boolean;
}): boolean {
  const blank =
    input.customer.trim() === "" && input.vendor.trim() === "" && input.destination.trim() === "";
  return blank && !input.confirmAll;
}

export type QuoteInput = {
  updateType: RateUpdateKind;
  oldFreight: number;
  oldFuel: number;
  oldTax: number;
  manualTotal: number;
  otherTotal: number;
  oldVendor: number;
  weight: number;
  minWeight: number;
  /** Null when this customer has no matching rate card. Freight stays as booked. */
  ratePerKg: number | null;
  fuelPct: number;
  taxPct: number;
  /** Null when this vendor has no contract. Vendor cost stays as booked. */
  newVendor: number | null;
  oldZone: string | null;
  newZone: string | null;
  skip: SkipReason | null;
};

export type QuoteResult = {
  oldFreight: number;
  newFreight: number;
  oldFuel: number;
  newFuel: number;
  oldTax: number;
  newTax: number;
  oldTotal: number;
  newTotal: number;
  oldVendor: number;
  newVendor: number;
  oldZone: string | null;
  newZone: string | null;
  difference: number;
  changed: boolean;
  skip: SkipReason | null;
};

export function quoteRateUpdate(input: QuoteInput): QuoteResult {
  const oldFreight = roundMoney(input.oldFreight);
  const oldFuel = roundMoney(input.oldFuel);
  const oldTax = roundMoney(input.oldTax);
  const manualTotal = roundMoney(input.manualTotal);
  const otherTotal = roundMoney(input.otherTotal);
  const oldVendor = roundMoney(input.oldVendor);
  const oldCustomer = customerTotal(oldFreight, oldFuel, oldTax, manualTotal, otherTotal);

  let newFreight = oldFreight;
  let newFuel = oldFuel;
  let newTax = oldTax;
  let newVendor = oldVendor;
  let newZone = input.oldZone;

  if (!input.skip && input.updateType === "AWB_RATE") {
    if (input.ratePerKg != null) {
      newFreight = freightAmount(input.weight, input.minWeight, input.ratePerKg);
    }
    newFuel = fuelAmount(newFreight, input.fuelPct);
    newTax = taxAmount(newFreight + newFuel, input.taxPct);
    newZone = input.newZone;
  } else if (!input.skip && input.updateType === "TAX_FUEL") {
    newFuel = fuelAmount(oldFreight, input.fuelPct);
    newTax = taxAmount(oldFreight + newFuel, input.taxPct);
  } else if (!input.skip && input.updateType === "VENDOR_RATE") {
    if (input.newVendor != null) newVendor = roundMoney(input.newVendor);
  }

  const newCustomer = customerTotal(newFreight, newFuel, newTax, manualTotal, otherTotal);
  const vendorMode = input.updateType === "VENDOR_RATE";
  const oldTotal = vendorMode ? oldVendor : oldCustomer;
  const newTotal = vendorMode ? newVendor : newCustomer;
  const difference = input.skip ? 0 : roundMoney(newTotal - oldTotal);
  const changed =
    !input.skip &&
    (difference !== 0 || (input.updateType === "AWB_RATE" && (newZone ?? "") !== (input.oldZone ?? "")));

  return {
    oldFreight,
    newFreight: input.skip ? oldFreight : newFreight,
    oldFuel,
    newFuel: input.skip ? oldFuel : newFuel,
    oldTax,
    newTax: input.skip ? oldTax : newTax,
    oldTotal,
    newTotal: input.skip ? oldTotal : newTotal,
    oldVendor,
    newVendor: input.skip ? oldVendor : newVendor,
    oldZone: input.oldZone,
    newZone: input.skip ? input.oldZone : newZone,
    difference,
    changed,
    skip: input.skip,
  };
}

export function grandDifference(
  rows: Array<{ difference: number; skip: string | null }>,
): number {
  return roundMoney(
    rows.filter((row) => !row.skip).reduce((sum, row) => sum + row.difference, 0),
  );
}

/** What each update type is allowed to change. Manual lines are never in this list. */
export function updateTypeEffects(updateType: RateUpdateKind): {
  customerFreight: boolean;
  fuelAndTax: boolean;
  vendorCost: boolean;
  zone: boolean;
  manualLines: boolean;
} {
  if (updateType === "VENDOR_RATE") {
    return {
      customerFreight: false,
      fuelAndTax: false,
      vendorCost: true,
      zone: false,
      manualLines: false,
    };
  }
  if (updateType === "TAX_FUEL") {
    return {
      customerFreight: false,
      fuelAndTax: true,
      vendorCost: false,
      zone: false,
      manualLines: false,
    };
  }
  return {
    customerFreight: true,
    fuelAndTax: true,
    vendorCost: false,
    zone: true,
    manualLines: false,
  };
}
