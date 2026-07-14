import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { CATALOG_MASTER_PERMISSIONS } from "@/lib/permissions";
import {
  contentCreateSchema,
  contentUpdateSchema,
  type ContentCreate,
  type ContentUpdate,
} from "@/lib/masters/schemas/contents";

export type ContentRow = BaseRow & {
  code: string;
  name: string;
};

export const contentsResource: MasterResource<ContentRow, ContentCreate, ContentUpdate> = {
  key: "contents",
  table: "contents",
  master: "contents",
  permission: CATALOG_MASTER_PERMISSIONS.contents,
  label: { singular: "Content", plural: "Contents" },
  columns:
    "id, tenant_id, code, name, created_at, created_by, updated_at, updated_by, deleted_at, row_version",
  searchColumns: ["code", "name"],
  orderBy: "name",
  ascending: true,
  importColumns: ["code", "name"],
  createSchema: contentCreateSchema,
  updateSchema: contentUpdateSchema,
};
