import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { GEO_MASTER_PERMISSIONS } from "@/lib/permissions";
import {
  stateCreateSchema,
  stateUpdateSchema,
  type StateCreate,
  type StateUpdate,
} from "@/lib/masters/schemas/states";

export type StateRow = BaseRow & {
  code: string;
  name: string;
  zone_id: string | null;
  gst_alias: string | null;
  is_union_territory: boolean;
};

export const statesResource: MasterResource<StateRow, StateCreate, StateUpdate> = {
  key: "states",
  table: "states",
  master: "states",
  permission: GEO_MASTER_PERMISSIONS.states,
  label: { singular: "State", plural: "States" },
  columns:
    "id, tenant_id, code, name, zone_id, gst_alias, is_union_territory, created_at, created_by, updated_at, updated_by, deleted_at, row_version",
  searchColumns: ["code", "name"],
  orderBy: "name",
  ascending: true,
  importColumns: ["code", "name", "zone_code", "gst_alias", "is_union_territory"],
  lookupKey: "state",
  createSchema: stateCreateSchema,
  updateSchema: stateUpdateSchema,
};
