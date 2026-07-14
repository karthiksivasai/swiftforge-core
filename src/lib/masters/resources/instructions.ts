import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { CATALOG_MASTER_PERMISSIONS } from "@/lib/permissions";
import {
  instructionCreateSchema,
  instructionUpdateSchema,
  type InstructionCreate,
  type InstructionUpdate,
} from "@/lib/masters/schemas/instructions";

export type InstructionRow = BaseRow & {
  code: string;
  name: string;
};

export const instructionsResource: MasterResource<
  InstructionRow,
  InstructionCreate,
  InstructionUpdate
> = {
  key: "instructions",
  table: "instructions",
  master: "instructions",
  permission: CATALOG_MASTER_PERMISSIONS.instructions,
  label: { singular: "Instruction", plural: "Instructions" },
  columns:
    "id, tenant_id, code, name, created_at, created_by, updated_at, updated_by, deleted_at, row_version",
  searchColumns: ["code", "name"],
  orderBy: "name",
  ascending: true,
  importColumns: ["code", "name"],
  createSchema: instructionCreateSchema,
  updateSchema: instructionUpdateSchema,
};
