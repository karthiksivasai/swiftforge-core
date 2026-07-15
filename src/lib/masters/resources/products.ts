import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { CATALOG_MASTER_PERMISSIONS } from "@/lib/permissions";
import {
  productCreateSchema,
  productUpdateSchema,
  type ProductCreate,
  type ProductUpdate,
} from "@/lib/masters/schemas/products";

export type ProductRow = BaseRow & {
  code: string;
  name: string | null;
  product_type_id: string | null;
  service: string | null;
  fuel_charge: boolean;
  gst_reverse: boolean;
  shipment_type: "DOX" | "NDOX";
  status: "ACTIVE" | "INACTIVE";
  group_type: "AIR" | "SURFACE" | "TRAIN" | "ALL" | null;
};

export const productsResource: MasterResource<ProductRow, ProductCreate, ProductUpdate> = {
  key: "products",
  table: "products",
  master: "products",
  permission: CATALOG_MASTER_PERMISSIONS.products,
  label: { singular: "Product", plural: "Products" },
  columns:
    "id, tenant_id, code, name, product_type_id, service, fuel_charge, gst_reverse, shipment_type, status, group_type, created_at, created_by, updated_at, updated_by, deleted_at, row_version",
  searchColumns: ["code", "name", "service"],
  orderBy: "code",
  ascending: true,
  importColumns: [
    "code",
    "name",
    "product_type_code",
    "service",
    "fuel_charge",
    "gst_reverse",
    "shipment_type",
    "status",
    "group_type",
  ],
  lookupKey: "product",
  createSchema: productCreateSchema,
  updateSchema: productUpdateSchema,
};

/** UI / CourierWala export headers → import column keys. */
export const PRODUCT_IMPORT_HEADER_ALIASES: Readonly<Record<string, readonly string[]>> = {
  code: ["Product Code"],
  name: ["Product Name"],
  product_type_code: ["Product Type"],
  service: ["Product Service"],
  fuel_charge: ["Fuel Charge"],
  gst_reverse: ["GST Reverse"],
  shipment_type: ["Shipment Type", "Type"],
  status: ["Status"],
  group_type: ["Group Type"],
};

/** Canonical CourierWala product types (code ↔ display name). */
export const CANONICAL_PRODUCT_TYPES = [
  { code: "D", name: "Domestic" },
  { code: "I", name: "International" },
  { code: "L", name: "Local" },
  { code: "P", name: "Import" },
] as const;

export type CanonicalProductTypeName = (typeof CANONICAL_PRODUCT_TYPES)[number]["name"];

/** Map Domestic/International/Local/Import (or D/I/L/P) to product_types.code. */
export function toProductTypeCode(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  const byCode = CANONICAL_PRODUCT_TYPES.find((t) => t.code === upper);
  if (byCode) return byCode.code;
  const byName = CANONICAL_PRODUCT_TYPES.find((t) => t.name.toLowerCase() === raw.toLowerCase());
  return byName?.code ?? raw;
}
