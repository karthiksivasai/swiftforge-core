import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import type { ExportFormat } from "@/lib/io/tableIo";
import { GEO_MASTER_PERMISSIONS } from "@/lib/permissions";
import {
  areaCreateSchema,
  areaUpdateSchema,
  type AreaCreate,
  type AreaUpdate,
} from "@/lib/masters/schemas/areas";

/** Template headers on the Area import file. Destination is checked, then derived. */
export const AREA_IMPORT_HEADER_ALIASES: Readonly<Record<string, readonly string[]>> = {
  name: ["Area Name"],
  service_center_code: ["Service Center", "Service Centre"],
  destination_code: ["Destination"],
};

export const AREA_EXPORT_FORMATS = ["excel", "csv", "pdf", "print"] as const satisfies readonly ExportFormat[];

export const AREA_EXPORT_COLUMNS = [
  { key: "areaName", header: "Area Name" },
  { key: "serviceCenter", header: "Service Center" },
  { key: "destination", header: "Destination" },
] as const;

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
  importColumns: ["name", "service_center_code", "destination_code"],
  lookupKey: "area",
  createSchema: areaCreateSchema,
  updateSchema: areaUpdateSchema,
};
