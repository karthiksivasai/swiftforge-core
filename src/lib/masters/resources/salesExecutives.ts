import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { CATALOG_MASTER_PERMISSIONS } from "@/lib/permissions";
import {
  salesExecutiveCreateSchema,
  salesExecutiveUpdateSchema,
  type SalesExecutiveCreate,
  type SalesExecutiveUpdate,
} from "@/lib/masters/schemas/salesExecutives";

export type SalesExecutiveRow = BaseRow & {
  code: string;
  name: string;
  commission: number;
};

export const salesExecutivesResource: MasterResource<
  SalesExecutiveRow,
  SalesExecutiveCreate,
  SalesExecutiveUpdate
> = {
  key: "sales_executives",
  table: "sales_executives",
  master: "sales_executives",
  permission: CATALOG_MASTER_PERMISSIONS.sales_executives,
  label: { singular: "Sales Executive", plural: "Sales Executives" },
  columns:
    "id, tenant_id, code, name, commission, created_at, created_by, updated_at, updated_by, deleted_at, row_version",
  searchColumns: ["code", "name"],
  orderBy: "name",
  ascending: true,
  importColumns: ["code", "name", "commission"],
  createSchema: salesExecutiveCreateSchema,
  updateSchema: salesExecutiveUpdateSchema,
};
