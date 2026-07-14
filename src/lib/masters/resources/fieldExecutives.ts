import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { AGGREGATE_CATALOG_MASTER_PERMISSIONS } from "@/lib/permissions";
import {
  fieldExecutiveCreateSchema,
  fieldExecutiveUpdateSchema,
  type FieldExecutiveCreate,
  type FieldExecutiveUpdate,
} from "@/lib/masters/schemas/fieldExecutives";

export type FieldExecutiveRow = BaseRow & {
  code: string;
  name: string;
  mobile: string | null;
  pickup_charge: number;
  delivery_charge: number;
  service_center_id: string;
  destination_id: string | null;
  tld_batch_no: string | null;
  in_active: boolean;
};

export const fieldExecutivesResource: MasterResource<
  FieldExecutiveRow,
  FieldExecutiveCreate,
  FieldExecutiveUpdate
> = {
  key: "field_executives",
  table: "field_executives",
  master: "field_executives",
  permission: AGGREGATE_CATALOG_MASTER_PERMISSIONS.field_executives,
  label: { singular: "Field Executive", plural: "Field Executives" },
  columns:
    "id, tenant_id, code, name, mobile, pickup_charge, delivery_charge, service_center_id, destination_id, tld_batch_no, in_active, created_at, created_by, updated_at, updated_by, deleted_at, row_version",
  searchColumns: ["code", "name", "mobile"],
  orderBy: "code",
  ascending: true,
  importColumns: [
    "code",
    "name",
    "mobile",
    "pickup_charge",
    "delivery_charge",
    "service_center_code",
    "destination_code",
    "tld_batch_no",
    "in_active",
  ],
  lookupKey: "field-executive",
  createSchema: fieldExecutiveCreateSchema,
  updateSchema: fieldExecutiveUpdateSchema,
};
