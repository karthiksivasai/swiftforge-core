/**
 * Courier Charge Details Rating Engine Module
 *
 * Core pure rating engine matching the reference case to the paisa without pre-rounding.
 * Precision: Engine operates and returns full-precision numeric values.
 * Display formatting (3 dp contract charges, 4 dp GST, 2 dp total) is applied at UI level.
 */

import { formatChargeWeight, roundMoney2, splitRoundedGst } from "@/lib/transactions/awbEntryRules";

export interface PieceItemInput {
  actualWeight: number;
  pieces: number;
  length: number;
  width: number;
  height: number;
}

export interface CustomerRateRecord {
  id?: string;
  customer_code: string;
  contract_no: string;
  product_code?: string | null;
  vendor_code?: string | null;
  origin_code?: string | null;
  origin_name?: string | null;
  destination_code?: string | null;
  destination_name?: string | null;
  country_code?: string | null;
  country_name?: string | null;
  zone_id?: string | null;
  zone_code?: string | null;
  weight_slab_from?: number | null;
  weight_slab_to?: number | null;
  /** Floor applied before PER_KG multiplication. */
  min_weight?: number | null;
  rate_per_kg: number;
  /** FLAT uses rate_per_kg as a fixed amount. MINIMUM uses it as a floor. */
  rate_type?: "FLAT" | "PER_KG" | "PER_SLAB" | "MINIMUM" | null;
  fuel_pct?: number | null;
  other_charges?: number | null;
  status: "ACTIVE" | "INACTIVE";
  from_date: string; // ISO date string YYYY-MM-DD
  to_date?: string | null;
}

export interface ServiceWeightRuleRecord {
  id?: string;
  service_code: string;
  service_name: string;
  min_weight: number;
  max_weight: number;
  status: "ACTIVE" | "INACTIVE";
}

export interface ServiceWeightValidationResult {
  valid: boolean;
  min?: number;
  max?: number;
  serviceName?: string;
  message?: string;
}

export interface RateQueryInput {
  customerCode: string;
  contractNo: string;
  productCode?: string;
  vendorCode?: string;
  serviceCode?: string;
  serviceName?: string;
  originCode?: string;
  originName?: string;
  destinationCode?: string;
  destinationName?: string;
  destinationCountry?: string;
  zoneId?: string;
  bookDate: string;
  pieces: PieceItemInput[];
  division?: number;
  /** Vendor Master "Volumetric Weight Round off": ceil charge weight to the next 0.500 kg. */
  roundHalfKg?: boolean;
  otherCharges?: number;
  customerBillingStateCode?: string;
  branchStateCode?: string;
  /** From the tax table. When set, these replace the half-split of gstPct. */
  igstPct?: number;
  cgstPct?: number;
  sgstPct?: number;
  gstPct?: number;
  fuelPct?: number;
}

export interface RatingCalculationResult {
  customerCode: string;
  contractNo: string;
  ratePerKg: number;
  chargeableWeight: number;
  contractCharges: number;
  otherCharges: number;
  subTotal: number;
  fuelPct: number;
  fuelAmount: number;
  isIntraState: boolean;
  gstPct: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalAmount: number;
  zoneCode?: string | null;
  matchedRateId?: string;
  isExportZeroRated: boolean;
}

/**
 * Each piece charge weight is max(actual, volumetric). Those weights are added,
 * and only the total is rounded up to the next 0.5 kg when roundHalfKg is set.
 * Default division is 5000 cm³/kg.
 */
export function calculatePieceWeights(
  pieces: PieceItemInput[],
  division = 5000,
  options?: { roundHalfKg?: boolean },
) {
  const div = division > 0 ? division : 5000;
  let totalChargeable = 0;

  const calculatedPieces = pieces.map((p) => {
    const pcs = Math.max(p.pieces || 1, 1);
    const volumetric = (p.length * p.width * p.height * pcs) / div;
    const actual = (p.actualWeight || 0) * pcs;
    const rowChargeWeight = Math.max(volumetric, actual);
    totalChargeable += rowChargeWeight;
    return {
      ...p,
      volumetric,
      actual,
      rowChargeWeight,
    };
  });

  if (options?.roundHalfKg) {
    totalChargeable = Number(formatChargeWeight(totalChargeable, true));
  }

  return {
    calculatedPieces,
    chargeableWeight: totalChargeable,
  };
}

/**
 * Seed Service Weight Rules
 * Reference case: COURIER PLEASE allows 0.500 to 999.000 kg.
 */
export const SEED_SERVICE_WEIGHT_RULES: ServiceWeightRuleRecord[] = [
  {
    id: "rule-courier-please",
    service_code: "COURIER PLEASE",
    service_name: "COURIER PLEASE",
    min_weight: 0.5,
    max_weight: 999.0,
    status: "ACTIVE",
  },
];

/**
 * Validates chargeable weight against allowed min/max weight bounds for a service.
 * Match rule: ACTIVE rule for serviceCode / serviceName (case-insensitive).
 * Message format: "weight allowed between {min} to {max} For {serviceName} service"
 * Default behaviour if no rule found: Treat as VALID (default allow).
 */
export function validateServiceWeight(input: {
  serviceCode?: string;
  serviceName?: string;
  chargeableWeight: number;
  rules?: ServiceWeightRuleRecord[];
}): ServiceWeightValidationResult {
  const code = (input.serviceCode || input.serviceName || "").trim().toUpperCase();
  if (!code) return { valid: true };

  const rulesList = input.rules ?? SEED_SERVICE_WEIGHT_RULES;
  const matchedRule = rulesList.find(
    (r) =>
      r.status === "ACTIVE" &&
      (r.service_code.trim().toUpperCase() === code ||
        r.service_name.trim().toUpperCase() === code),
  );

  // Default allow if no active rule exists for the service
  if (!matchedRule) {
    return { valid: true };
  }

  const { min_weight, max_weight, service_name } = matchedRule;
  const weight = input.chargeableWeight;

  if (weight < min_weight || weight > max_weight) {
    const minFormatted = min_weight.toFixed(3);
    const maxFormatted = max_weight.toFixed(3);
    const message = `weight allowed between ${minFormatted} to ${maxFormatted} For ${service_name} service`;
    return {
      valid: false,
      min: min_weight,
      max: max_weight,
      serviceName: service_name,
      message,
    };
  }

  return { valid: true, min: min_weight, max: max_weight, serviceName: service_name };
}

function norm(value?: string | null): string {
  return (value ?? "").trim().toUpperCase();
}

function laneMatches(
  rateValues: Array<string | null | undefined>,
  queryValues: Array<string | null | undefined>,
): boolean {
  const rateTokens = rateValues.map(norm).filter(Boolean);
  if (rateTokens.length === 0) return true;
  const queryTokens = queryValues.map(norm).filter(Boolean);
  if (queryTokens.length === 0) return true;
  return rateTokens.some((token) => queryTokens.includes(token));
}

/**
 * Resolves customer rate from rate card using scored specificity matching:
 * Destination (16) > Zone (8) > Origin (4) > Product (2) > Vendor (1).
 * Ties broken by latest from_date.
 */
export function resolveCustomerRate(
  rates: CustomerRateRecord[],
  query: {
    customerCode: string;
    contractNo: string;
    productCode?: string;
    vendorCode?: string;
    originCode?: string;
    originName?: string;
    destinationCode?: string;
    destinationName?: string;
    destinationCountry?: string;
    zoneId?: string;
    bookDate: string;
    chargeableWeight: number;
  },
): CustomerRateRecord | null {
  const bookDateObj = new Date(query.bookDate);

  const activeCandidates = rates.filter((r) => {
    if (r.status !== "ACTIVE") return false;
    if (r.customer_code.toUpperCase() !== query.customerCode.toUpperCase()) return false;
    const rateContract = (r.contract_no || "").trim().toUpperCase();
    const queryContract = (query.contractNo || "").trim().toUpperCase();
    if (rateContract && queryContract && rateContract !== queryContract) return false;

    // Date range check
    const fromObj = new Date(r.from_date);
    if (bookDateObj < fromObj) return false;
    if (r.to_date) {
      const toObj = new Date(r.to_date);
      if (bookDateObj > toObj) return false;
    }

    // Weight slab check if present
    if (r.weight_slab_from != null && query.chargeableWeight < r.weight_slab_from) return false;
    if (r.weight_slab_to != null && query.chargeableWeight > r.weight_slab_to) return false;

    // Wildcard match checks (if candidate specifies a field, query must match it)
    if (
      r.product_code &&
      query.productCode &&
      r.product_code.toUpperCase() !== query.productCode.toUpperCase()
    ) {
      return false;
    }
    if (!laneMatches([r.origin_code, r.origin_name], [query.originCode, query.originName])) return false;
    if (
      !laneMatches(
        [r.destination_code, r.destination_name, r.country_code, r.country_name],
        [query.destinationCode, query.destinationName, query.destinationCountry],
      )
    ) {
      return false;
    }
    if (r.zone_id && query.zoneId && r.zone_id !== query.zoneId) {
      return false;
    }

    return true;
  });

  if (activeCandidates.length === 0) return null;

  // Score candidate rows
  const scored = activeCandidates.map((r) => {
    let score = 0;
    if (r.destination_code) score += 16;
    if (r.zone_id) score += 8;
    if (r.origin_code) score += 4;
    if (r.product_code) score += 2;
    if (
      r.vendor_code &&
      query.vendorCode &&
      r.vendor_code.toUpperCase() === query.vendorCode.toUpperCase()
    ) {
      score += 1;
    }
    return { record: r, score, fromTime: new Date(r.from_date).getTime() };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.fromTime - a.fromTime;
  });

  return scored[0]?.record ?? null;
}

/**
 * Documented hook for export zero-rating determination.
 * By default returns false (reference case: standard GST split based on state comparison).
 */
export function isExportZeroRated(_shipment: Partial<RateQueryInput>): boolean {
  return false;
}

/**
 * Default Seed Reference Rate Row for CKING / Contract 243792
 */
export const SEED_CUSTOMER_RATES: CustomerRateRecord[] = [
  {
    id: "rate-cking-243792-ref",
    customer_code: "CKING",
    contract_no: "243792",
    product_code: "SPX",
    vendor_code: "DTAU",
    origin_code: "HYD",
    destination_code: "AUSTRALIA",
    rate_per_kg: 444.91,
    status: "ACTIVE",
    from_date: "2020-01-01",
    to_date: null,
  },
];

/**
 * Core shipment rating computation.
 * Returns full-precision numeric amounts without pre-rounding.
 */
export function computeShipmentRating(
  query: RateQueryInput,
  rateCard: CustomerRateRecord[] = SEED_CUSTOMER_RATES,
  serviceRules: ServiceWeightRuleRecord[] = SEED_SERVICE_WEIGHT_RULES,
): RatingCalculationResult {
  const { chargeableWeight } = calculatePieceWeights(query.pieces, query.division, {
    roundHalfKg: query.roundHalfKg === true,
  });

  // Validate service weight bounds BEFORE rate resolution
  const weightValidation = validateServiceWeight({
    serviceCode: query.serviceCode,
    serviceName: query.serviceName || query.serviceCode,
    chargeableWeight,
    rules: serviceRules,
  });

  if (!weightValidation.valid) {
    throw new Error(weightValidation.message || "WEIGHT_OUT_OF_RANGE");
  }

  const matchedRate = resolveCustomerRate(rateCard, {
    customerCode: query.customerCode,
    contractNo: query.contractNo,
    productCode: query.productCode,
    vendorCode: query.vendorCode,
    originCode: query.originCode,
    originName: query.originName,
    destinationCode: query.destinationCode,
    destinationName: query.destinationName,
    destinationCountry: query.destinationCountry,
    zoneId: query.zoneId,
    bookDate: query.bookDate,
    chargeableWeight,
  });

  if (!matchedRate) {
    const lane = `${query.originCode || query.originName || "*"} to ${query.destinationCode || query.destinationName || "*"}`;
    const product = query.productCode ? ` for product ${query.productCode}` : "";
    throw new Error(`NO_RATE_FOUND: No customer rate for ${query.customerCode} from ${lane}${product}`);
  }

  const billableWeight = Math.max(chargeableWeight, matchedRate.min_weight ?? 0);
  const ratePerKg = matchedRate.rate_per_kg;
  const rateType = matchedRate.rate_type ?? "PER_KG";
  const contractCharges =
    rateType === "FLAT"
      ? ratePerKg
      : rateType === "MINIMUM"
        ? Math.max(ratePerKg * billableWeight, ratePerKg)
        : ratePerKg * billableWeight;
  const otherCharges = (query.otherCharges || 0) + (matchedRate.other_charges || 0);
  const subTotal = contractCharges + otherCharges;

  const fuelPct = (query.fuelPct ?? 0) > 0 ? (query.fuelPct ?? 0) : (matchedRate.fuel_pct ?? 0);
  const fuelAmount = subTotal * (fuelPct / 100);

  const taxable = subTotal + fuelAmount;
  const zeroRated = isExportZeroRated(query);

  const custState = (query.customerBillingStateCode || "").trim().toUpperCase();
  const branchState = (query.branchStateCode || "").trim().toUpperCase();
  if (!custState || !branchState) {
    throw new Error(
      "Customer billing state and branch state are required before GST can be calculated",
    );
  }
  const isIntraState = custState === branchState;

  const gstPct = zeroRated ? 0 : (query.gstPct ?? 18);
  const igstPct = query.igstPct ?? gstPct;
  const cgstPct = query.cgstPct ?? gstPct / 2;
  const sgstPct = query.sgstPct ?? gstPct / 2;
  const appliedPct = isIntraState ? cgstPct + sgstPct : igstPct;
  const split = splitRoundedGst(taxable, {
    intraState: isIntraState,
    gstPct: zeroRated ? 0 : appliedPct,
  });
  const cgst = split.cgst;
  const sgst = split.sgst;
  const igst = split.igst;

  const totalAmount = roundMoney2(subTotal + fuelAmount + split.tax);

  return {
    customerCode: query.customerCode,
    contractNo: matchedRate.contract_no || query.contractNo,
    zoneCode: matchedRate.zone_code || null,
    ratePerKg,
    chargeableWeight,
    contractCharges,
    otherCharges,
    subTotal,
    fuelPct,
    fuelAmount,
    isIntraState,
    gstPct,
    cgst,
    sgst,
    igst,
    totalAmount,
    matchedRateId: matchedRate.id,
    isExportZeroRated: zeroRated,
  };
}
