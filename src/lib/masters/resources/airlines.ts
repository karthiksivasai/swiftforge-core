import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { COMPLEX_CATALOG_MASTER_PERMISSIONS } from "@/lib/permissions";
import {
  airlineCreateSchema,
  airlineUpdateSchema,
  type AirlineCreate,
  type AirlineUpdate,
} from "@/lib/masters/schemas/airlines";

export type AirlineRow = BaseRow & {
  name: string;
  product_id: string;
};

export const airlinesResource: MasterResource<AirlineRow, AirlineCreate, AirlineUpdate> = {
  key: "airlines",
  table: "airlines",
  master: "airlines",
  permission: COMPLEX_CATALOG_MASTER_PERMISSIONS.airlines,
  label: { singular: "Airline", plural: "Airlines" },
  columns:
    "id, tenant_id, name, product_id, created_at, created_by, updated_at, updated_by, deleted_at, row_version",
  searchColumns: ["name"],
  orderBy: "name",
  ascending: true,
  importColumns: ["name", "product_code"],
  lookupKey: "airline",
  createSchema: airlineCreateSchema,
  updateSchema: airlineUpdateSchema,
};
