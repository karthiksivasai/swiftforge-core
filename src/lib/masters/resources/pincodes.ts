import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { GEO_MASTER_PERMISSIONS } from "@/lib/permissions";
import {
  pincodeCreateSchema,
  pincodeUpdateSchema,
  type PincodeCreate,
  type PincodeUpdate,
} from "@/lib/masters/schemas/pincodes";

export type PincodeRow = BaseRow & {
  pin_code: string;
  pin_name: string | null;
  branch_id: string | null;
  destination_id: string | null;
  zone_id: string | null;
  state_id: string | null;
  is_oda: boolean;
  is_serviceable: boolean;
  pickup_available: boolean;
  distance_km: number | null;
};

export const pincodesResource: MasterResource<PincodeRow, PincodeCreate, PincodeUpdate> = {
  key: "pincodes",
  table: "pincodes",
  master: "pincodes",
  permission: GEO_MASTER_PERMISSIONS.pincodes,
  label: { singular: "Pincode", plural: "Pincodes" },
  columns:
    "id, tenant_id, pin_code, pin_name, branch_id, destination_id, zone_id, state_id, is_oda, is_serviceable, pickup_available, distance_km, created_at, created_by, updated_at, updated_by, deleted_at, row_version",
  searchColumns: ["pin_code", "pin_name"],
  orderBy: "pin_code",
  ascending: true,
  importColumns: [
    "pin_code",
    "pin_name",
    "branch_code",
    "destination_code",
    "zone_code",
    "state_code",
    "is_oda",
    "is_serviceable",
    "pickup_available",
    "distance_km",
  ],
  lookupKey: "pin-code",
  createSchema: pincodeCreateSchema,
  updateSchema: pincodeUpdateSchema,
};
