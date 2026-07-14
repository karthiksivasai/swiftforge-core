import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { GEO_MASTER_PERMISSIONS } from "@/lib/permissions";
import {
  zoneCreateSchema,
  zoneUpdateSchema,
  type ZoneCreate,
  type ZoneUpdate,
} from "@/lib/masters/schemas/zones";

export type ZoneRow = BaseRow & {
  code: string;
  name: string;
};

export const zonesResource: MasterResource<ZoneRow, ZoneCreate, ZoneUpdate> = {
  key: "zones",
  table: "zones",
  master: "zones",
  permission: GEO_MASTER_PERMISSIONS.zones,
  label: { singular: "Zone", plural: "Zones" },
  columns:
    "id, tenant_id, code, name, created_at, created_by, updated_at, updated_by, deleted_at, row_version",
  searchColumns: ["code", "name"],
  orderBy: "name",
  ascending: true,
  importColumns: ["code", "name"],
  lookupKey: "zone",
  createSchema: zoneCreateSchema,
  updateSchema: zoneUpdateSchema,
};
