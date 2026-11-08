/**
 * Vendor Master Tariff pricing.
 *
 * Slab application matches app.compute_vendor_cost:
 * FLAT replaces the amount, PER_KG is weight × rate, PER_SLAB stops at the
 * first slab the weight fits, and MINIMUM raises the result to a floor.
 * Fuel and tax are then added so the quote is the landed cost.
 */

export type VendorRateType = "FLAT" | "PER_KG" | "PER_SLAB" | "MINIMUM";

export type VendorSlab = {
  seq: number;
  rate_type: VendorRateType;
  weight: number;
  rate: number;
};

export type VendorTariff = {
  id: string;
  vendorId: string;
  vendorCode: string;
  vendorName: string;
  productCode: string | null;
  originCode: string | null;
  destinationCode: string | null;
  contractNo: string;
  zoneId: string | null;
  zoneCode: string | null;
  service: string | null;
  fromDate: string;
  status: "ACTIVE" | "INACTIVE";
  slabs: VendorSlab[];
};

export type VendorQuoteQuery = {
  vendorCode?: string;
  productCode?: string;
  originCode?: string;
  destinationCode?: string;
  zoneId?: string;
  serviceCode?: string;
  bookDate: string;
  chargeableWeight: number;
  fuelPct?: number;
  gstPct?: number;
};

export type VendorQuote = {
  contractId: string;
  contractNo: string;
  zoneCode: string;
  vendorId: string;
  origin: string;
  vendorCode: string;
  vendorName: string;
  service: string;
  weight: number;
  ratePerKg: number;
  freight: number;
  fuelAmount: number;
  taxAmount: number;
  totalAmount: number;
};

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function applyVendorSlabs(
  weight: number,
  slabs: VendorSlab[],
): { freight: number; ratePerKg: number } {
  const w = Number.isFinite(weight) ? weight : 0;
  let cost = 0;
  let floor = 0;
  let perKg = 0;

  for (const slab of [...slabs].sort((a, b) => a.seq - b.seq)) {
    if (slab.rate_type === "FLAT") {
      cost = slab.rate;
    } else if (slab.rate_type === "PER_KG") {
      perKg = slab.rate;
      cost = roundMoney(w * slab.rate);
    } else if (slab.rate_type === "PER_SLAB") {
      const cap = slab.weight === 0 ? w : slab.weight;
      if (w <= cap) {
        cost = slab.rate;
        break;
      }
    } else if (slab.rate_type === "MINIMUM") {
      floor = Math.max(floor, slab.rate);
    }
  }

  const freight = Math.max(cost, floor);
  const ratePerKg = perKg > 0 ? perKg : w > 0 ? freight / w : freight;
  return { freight, ratePerKg };
}

function same(left?: string | null, right?: string | null): boolean {
  return (left ?? "").trim().toUpperCase() === (right ?? "").trim().toUpperCase();
}

export function matchVendorTariffs(tariffs: VendorTariff[], query: VendorQuoteQuery): VendorTariff[] {
  const book = (query.bookDate || "").slice(0, 10);
  return tariffs.filter((tariff) => {
    if (tariff.status !== "ACTIVE") return false;
    if (book && tariff.fromDate.slice(0, 10) > book) return false;
    if (query.vendorCode && !same(tariff.vendorCode, query.vendorCode)) return false;
    if (query.productCode && !same(tariff.productCode, query.productCode)) return false;
    if (tariff.originCode && query.originCode && !same(tariff.originCode, query.originCode)) return false;
    if (
      tariff.destinationCode &&
      query.destinationCode &&
      !same(tariff.destinationCode, query.destinationCode)
    ) {
      return false;
    }
    if (tariff.zoneId && query.zoneId && tariff.zoneId !== query.zoneId) return false;
    if (tariff.service && query.serviceCode && !same(tariff.service, query.serviceCode)) return false;
    return true;
  });
}

function specificity(tariff: VendorTariff): number {
  return (
    (tariff.destinationCode ? 8 : 0) +
    (tariff.zoneId ? 4 : 0) +
    (tariff.originCode ? 2 : 0) +
    (tariff.service ? 1 : 0)
  );
}

function rankTariffs(tariffs: VendorTariff[]): VendorTariff[] {
  return [...tariffs].sort((a, b) => {
    const score = specificity(b) - specificity(a);
    if (score !== 0) return score;
    return b.fromDate.localeCompare(a.fromDate);
  });
}

export function quoteVendorTariff(tariff: VendorTariff, query: VendorQuoteQuery): VendorQuote {
  const { freight, ratePerKg } = applyVendorSlabs(query.chargeableWeight, tariff.slabs);
  const fuelAmount = roundMoney(freight * ((query.fuelPct ?? 0) / 100));
  const taxAmount = roundMoney((freight + fuelAmount) * ((query.gstPct ?? 0) / 100));
  return {
    contractId: tariff.id,
    contractNo: tariff.contractNo,
    zoneCode: tariff.zoneCode || "",
    vendorId: tariff.vendorId,
    origin: tariff.originCode || query.originCode || "",
    vendorCode: tariff.vendorCode,
    vendorName: tariff.vendorName || tariff.vendorCode,
    service: tariff.service || query.serviceCode || "",
    weight: query.chargeableWeight,
    ratePerKg,
    freight,
    fuelAmount,
    taxAmount,
    totalAmount: roundMoney(freight + fuelAmount + taxAmount),
  };
}

/** Best tariff for the vendor named on the shipment. */
export function quoteSelectedVendor(
  tariffs: VendorTariff[],
  query: VendorQuoteQuery,
): VendorQuote | null {
  const ranked = rankTariffs(matchVendorTariffs(tariffs, query));
  const best = ranked[0];
  return best ? quoteVendorTariff(best, query) : null;
}

/** One landed-cost row per vendor and service that can carry this lane. */
export function compareVendorRates(tariffs: VendorTariff[], query: VendorQuoteQuery): VendorQuote[] {
  const ranked = rankTariffs(matchVendorTariffs(tariffs, { ...query, vendorCode: undefined }));
  const seen = new Set<string>();
  const rows: VendorQuote[] = [];
  for (const tariff of ranked) {
    const key = `${tariff.vendorCode.trim().toUpperCase()}|${(tariff.service ?? "").trim().toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(quoteVendorTariff(tariff, query));
  }
  rows.sort((a, b) => a.totalAmount - b.totalAmount);
  return rows;
}
