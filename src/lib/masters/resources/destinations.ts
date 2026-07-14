import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { GEO_MASTER_PERMISSIONS } from "@/lib/permissions";
import {
  destinationCreateSchema,
  destinationUpdateSchema,
  type DestinationCreate,
  type DestinationUpdate,
} from "@/lib/masters/schemas/destinations";

export type DestinationRow = BaseRow & {
  dest_type: "DOMESTIC" | "INTERNATIONAL" | "LOCAL";
  code: string;
  name: string;
  country_id: string | null;
  state_id: string | null;
  zone_id: string | null;
  service_type: "REGULAR" | "METRO" | "REMOTE" | null;
  main_branch_id: string | null;
  manifest_branch_id: string | null;
  email: string | null;
  mobile: string | null;
  status: "ACTIVE" | "INACTIVE";
};

export const destinationsResource: MasterResource<
  DestinationRow,
  DestinationCreate,
  DestinationUpdate
> = {
  key: "destinations",
  table: "destinations",
  master: "destinations",
  permission: GEO_MASTER_PERMISSIONS.destinations,
  label: { singular: "Destination", plural: "Destinations" },
  columns:
    "id, tenant_id, dest_type, code, name, country_id, state_id, zone_id, service_type, main_branch_id, manifest_branch_id, email, mobile, status, created_at, created_by, updated_at, updated_by, deleted_at, row_version",
  searchColumns: ["code", "name"],
  orderBy: "name",
  ascending: true,
  importColumns: [
    "dest_type",
    "code",
    "name",
    "country_code",
    "state_code",
    "zone_code",
    "service_type",
    "main_branch_code",
    "manifest_branch_code",
    "email",
    "mobile",
    "status",
  ],
  lookupKey: "destination",
  createSchema: destinationCreateSchema,
  updateSchema: destinationUpdateSchema,
};
