/**
 * Minimal UI ↔ DB mapping for Vendor Contract aggregate screens.
 */
import type {
  VendorContractCreate,
  VendorContractSlabInput,
} from "@/lib/masters/schemas/vendorContracts";
import type {
  VendorContractRow,
  VendorContractSlabRow,
} from "@/lib/masters/resources/vendorContracts";

export type UiRateLine = { rateType: string; weight: string; rate: string };

export type UiVendorContractForm = {
  fromDate: string;
  vendorId: string;
  vendorCode: string;
  vendorName: string;
  originId: string;
  originCode: string;
  originName: string;
  zoneId: string;
  zoneCode: string;
  zoneName: string;
  countryId: string;
  countryCode: string;
  countryName: string;
  destinationId: string;
  destinationCode: string;
  destinationName: string;
  productId: string;
  productCode: string;
  productName: string;
  service: string;
  contractNo: string;
  unit: string;
  days: string;
  rateType: string;
  weight: string;
  rate: string;
};

export type UiVendorContractRow = UiVendorContractForm & {
  id: string;
  contractId: string;
  slabSeq: number;
  row_version?: number;
};

const RATE_TYPE_TO_DB: Record<string, VendorContractSlabInput["rate_type"]> = {
  Flat: "FLAT",
  FLAT: "FLAT",
  "Per KG": "PER_KG",
  PER_KG: "PER_KG",
  "Per Slab": "PER_SLAB",
  PER_SLAB: "PER_SLAB",
  Minimum: "MINIMUM",
  MINIMUM: "MINIMUM",
};

const RATE_TYPE_TO_UI: Record<string, string> = {
  FLAT: "Flat",
  PER_KG: "Per KG",
  PER_SLAB: "Per Slab",
  MINIMUM: "Minimum",
};

export function rateTypeToDb(label: string): VendorContractSlabInput["rate_type"] {
  return RATE_TYPE_TO_DB[label] ?? "FLAT";
}

export function rateTypeToUi(db: string): string {
  return RATE_TYPE_TO_UI[db] ?? db;
}

export function unitToDb(unit: string): "KG" | "LB" | "CBM" | "PIECE" {
  if (unit.toUpperCase() === "PIECE") return "PIECE";
  return (unit.toUpperCase() as "KG" | "LB" | "CBM") || "KG";
}

export function unitToUi(unit: string): string {
  if (unit === "PIECE") return "Piece";
  return unit;
}

export type VendorContractLabels = {
  vendor_code?: string | null;
  vendor_name?: string | null;
  product_code?: string | null;
  product_name?: string | null;
  zone_code?: string | null;
  zone_name?: string | null;
  country_code?: string | null;
  country_name?: string | null;
  origin_code?: string | null;
  origin_name?: string | null;
  destination_code?: string | null;
  destination_name?: string | null;
};

export function dbVendorContractToUi(
  root: VendorContractRow & VendorContractLabels,
  slab: VendorContractSlabRow,
): UiVendorContractRow {
  return {
    id: `${root.id}:${slab.seq}`,
    contractId: root.id,
    slabSeq: slab.seq,
    row_version: root.row_version,
    fromDate: root.from_date,
    vendorId: root.vendor_id,
    vendorCode: root.vendor_code ?? "",
    vendorName: root.vendor_name ?? "",
    originId: root.origin_destination_id ?? "",
    originCode: root.origin_code ?? "",
    originName: root.origin_name ?? "",
    zoneId: root.zone_id ?? "",
    zoneCode: root.zone_code ?? "",
    zoneName: root.zone_name ?? "",
    countryId: root.country_id ?? "",
    countryCode: root.country_code ?? "",
    countryName: root.country_name ?? "",
    destinationId: root.destination_id ?? "",
    destinationCode: root.destination_code ?? "",
    destinationName: root.destination_name ?? "",
    productId: root.product_id,
    productCode: root.product_code ?? "",
    productName: root.product_name ?? "",
    service: root.service ?? "",
    contractNo: root.contract_no,
    unit: unitToUi(root.unit),
    days: root.transit_days != null ? String(root.transit_days) : "",
    rateType: rateTypeToUi(slab.rate_type),
    weight: String(slab.weight),
    rate: String(slab.rate),
  };
}

export function uiSlabsFromDraft(
  form: Pick<UiVendorContractForm, "rateType" | "weight" | "rate">,
  draftRates: UiRateLine[],
): VendorContractSlabInput[] {
  const lines =
    draftRates.length > 0
      ? draftRates
      : form.rateType && form.weight && form.rate
        ? [{ rateType: form.rateType, weight: form.weight, rate: form.rate }]
        : [];

  return lines.map((line) => ({
    rate_type: rateTypeToDb(line.rateType),
    weight: parseFloat(line.weight) || 0,
    rate: parseFloat(line.rate) || 0,
  }));
}

export function uiVendorContractToSavePayload(form: UiVendorContractForm): VendorContractCreate {
  return {
    contract_no: form.contractNo.trim(),
    from_date: form.fromDate,
    vendor_id: form.vendorId,
    origin_destination_id: form.originId || null,
    zone_id: form.zoneId || null,
    country_id: form.countryId || null,
    destination_id: form.destinationId || null,
    product_id: form.productId,
    service: form.service.trim() || null,
    unit: unitToDb(form.unit),
    transit_days: form.days.trim() ? parseInt(form.days, 10) : null,
    status: "ACTIVE",
  };
}

export function slabsToDraftRates(slabs: VendorContractSlabRow[]): UiRateLine[] {
  return slabs.map((s) => ({
    rateType: rateTypeToUi(s.rate_type),
    weight: String(s.weight),
    rate: String(s.rate),
  }));
}
