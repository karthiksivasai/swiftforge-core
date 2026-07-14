import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { LOCAL_BRANCH_PERMISSIONS } from "@/lib/permissions";
import {
  localBranchCreateSchema,
  localBranchUpdateSchema,
  type LocalBranchCreate,
  type LocalBranchUpdate,
} from "@/lib/masters/schemas/localBranches";

export type LocalBranchRow = BaseRow & {
  code: string;
  name: string;
  branch_id: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  pin_code: string | null;
  state_id: string | null;
  billing_state_id: string | null;
  gst_no: string | null;
  phone: string | null;
  email: string | null;
  serviceable_pincodes: string[];
  wizard_extras: Record<string, unknown>;
  status: "ACTIVE" | "INACTIVE";
};

export const localBranchesResource: MasterResource<
  LocalBranchRow,
  LocalBranchCreate,
  LocalBranchUpdate
> = {
  key: "local_branches",
  table: "local_branches",
  master: "local_branches",
  permission: LOCAL_BRANCH_PERMISSIONS.local_branches,
  label: { singular: "Local Branch", plural: "Local Branches" },
  columns:
    "id, tenant_id, code, name, branch_id, address1, address2, city, pin_code, state_id, billing_state_id, gst_no, phone, email, serviceable_pincodes, wizard_extras, status, created_at, created_by, updated_at, updated_by, deleted_at, row_version",
  searchColumns: ["code", "name", "city", "pin_code"],
  orderBy: "code",
  ascending: true,
  importColumns: [
    "code",
    "name",
    "branch_code",
    "address1",
    "address2",
    "city",
    "pin_code",
    "state_code",
    "billing_state_code",
    "gst_no",
    "phone",
    "email",
    "status",
  ],
  createSchema: localBranchCreateSchema,
  updateSchema: localBranchUpdateSchema,
};
