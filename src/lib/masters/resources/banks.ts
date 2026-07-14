import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { CATALOG_MASTER_PERMISSIONS } from "@/lib/permissions";
import {
  bankCreateSchema,
  bankUpdateSchema,
  type BankCreate,
  type BankUpdate,
} from "@/lib/masters/schemas/banks";

export type BankRow = BaseRow & {
  code: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
};

export const banksResource: MasterResource<BankRow, BankCreate, BankUpdate> = {
  key: "banks",
  table: "banks",
  master: "banks",
  permission: CATALOG_MASTER_PERMISSIONS.banks,
  label: { singular: "Bank", plural: "Banks" },
  columns:
    "id, tenant_id, code, name, status, created_at, created_by, updated_at, updated_by, deleted_at, row_version",
  searchColumns: ["code", "name"],
  orderBy: "name",
  ascending: true,
  importColumns: ["code", "name", "status"],
  createSchema: bankCreateSchema,
  updateSchema: bankUpdateSchema,
};
