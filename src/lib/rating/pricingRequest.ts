import { calculatePieceWeights, type PieceItemInput } from "@/lib/rating/ratingEngine";
import type { VendorQuoteQuery } from "@/lib/rating/vendorTariff";

export type PricingRequestBody = {
  customerCode?: string;
  contractNo?: string;
  productCode?: string;
  vendorCode?: string;
  serviceCode?: string;
  serviceName?: string;
  originCode?: string;
  destinationCode?: string;
  zoneId?: string;
  bookDate?: string;
  pieces?: PieceItemInput[];
  division?: number;
  roundHalfKg?: boolean;
  chargeableWeight?: number;
  fuelPct?: number;
  gstPct?: number;
  otherCharges?: number;
  customerBillingStateCode?: string;
  branchStateCode?: string;
};

export function readPricingBody(body: PricingRequestBody): {
  pieces: PieceItemInput[];
  chargeableWeight: number;
  quote: VendorQuoteQuery;
} {
  const pieces = Array.isArray(body.pieces) ? body.pieces : [];
  const weighed =
    pieces.length > 0
      ? calculatePieceWeights(pieces, body.division, { roundHalfKg: body.roundHalfKg === true })
          .chargeableWeight
      : Number(body.chargeableWeight) || 0;

  return {
    pieces,
    chargeableWeight: weighed,
    quote: {
      vendorCode: body.vendorCode?.trim() || undefined,
      productCode: body.productCode?.trim() || undefined,
      originCode: body.originCode?.trim() || undefined,
      destinationCode: body.destinationCode?.trim() || undefined,
      zoneId: body.zoneId?.trim() || undefined,
      serviceCode: (body.serviceCode || body.serviceName || "").trim() || undefined,
      bookDate: body.bookDate || new Date().toISOString().slice(0, 10),
      chargeableWeight: weighed,
      fuelPct: body.fuelPct ?? 0,
      gstPct: body.gstPct ?? 0,
    },
  };
}
