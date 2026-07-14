import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { CATALOG_MASTER_PERMISSIONS } from "@/lib/permissions";
import {
  industryCreateSchema,
  industryUpdateSchema,
  type IndustryCreate,
  type IndustryUpdate,
} from "@/lib/masters/schemas/industries";

export type IndustryRow = BaseRow & {
  code: string;
  name: string;
};

export const industriesResource: MasterResource<IndustryRow, IndustryCreate, IndustryUpdate> = {
  key: "industries",
  table: "industries",
  master: "industries",
  permission: CATALOG_MASTER_PERMISSIONS.industries,
  label: { singular: "Industry", plural: "Industries" },
  columns:
    "id, tenant_id, code, name, created_at, created_by, updated_at, updated_by, deleted_at, row_version",
  searchColumns: ["code", "name"],
  orderBy: "name",
  ascending: true,
  importColumns: ["code", "name"],
  createSchema: industryCreateSchema,
  updateSchema: industryUpdateSchema,
};
