import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { CATALOG_MASTER_PERMISSIONS } from "@/lib/permissions";
import {
  productTypeCreateSchema,
  productTypeUpdateSchema,
  type ProductTypeCreate,
  type ProductTypeUpdate,
} from "@/lib/masters/schemas/productTypes";

export type ProductTypeRow = BaseRow & {
  code: string;
  name: string;
};

export const productTypesResource: MasterResource<
  ProductTypeRow,
  ProductTypeCreate,
  ProductTypeUpdate
> = {
  key: "product_types",
  table: "product_types",
  master: "product_types",
  permission: CATALOG_MASTER_PERMISSIONS.product_types,
  label: { singular: "Product Type", plural: "Product Types" },
  columns:
    "id, tenant_id, code, name, created_at, created_by, updated_at, updated_by, deleted_at, row_version",
  searchColumns: ["code", "name"],
  orderBy: "name",
  ascending: true,
  importColumns: ["code", "name"],
  lookupKey: "product-type",
  createSchema: productTypeCreateSchema,
  updateSchema: productTypeUpdateSchema,
};
