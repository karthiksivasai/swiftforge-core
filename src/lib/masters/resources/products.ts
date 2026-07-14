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
