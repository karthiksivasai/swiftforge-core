import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { GEO_MASTER_PERMISSIONS } from "@/lib/permissions";
import {
  areaCreateSchema,
  areaUpdateSchema,
  type AreaCreate,
  type AreaUpdate,
} from "@/lib/masters/schemas/areas";

export type AreaRow = BaseRow & {
  branch_id: string;
  service_center_id: string | null;
  name: string;
  destination_id: string | null;
};

export const areasResource: MasterResource<AreaRow, AreaCreate, AreaUpdate> = {
  key: "areas",
  table: "areas",
  master: "areas",
  permission: GEO_MASTER_PERMISSIONS.areas,
  label: { singular: "Area", plural: "Areas" },
  columns:
    "id, tenant_id, branch_id, service_center_id, name, destination_id, created_at, created_by, updated_at, updated_by, deleted_at, row_version",
  searchColumns: ["name"],
  orderBy: "name",
  ascending: true,
  importColumns: ["branch_code", "name", "destination_code"],
  lookupKey: "area",
  createSchema: areaCreateSchema,
  updateSchema: areaUpdateSchema,
};
