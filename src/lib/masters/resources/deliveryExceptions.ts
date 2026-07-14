import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { CATALOG_MASTER_PERMISSIONS } from "@/lib/permissions";
import {
  deliveryExceptionCreateSchema,
  deliveryExceptionUpdateSchema,
  type DeliveryExceptionCreate,
  type DeliveryExceptionUpdate,
} from "@/lib/masters/schemas/deliveryExceptions";

export type DeliveryExceptionRow = BaseRow & {
  code: string;
  name: string;
  exc_type: "DELIVERED" | "UNDELIVERED";
  inscan: boolean;
  show_on_mobile: boolean;
};

export const deliveryExceptionsResource: MasterResource<
  DeliveryExceptionRow,
  DeliveryExceptionCreate,
  DeliveryExceptionUpdate
> = {
  key: "delivery_exceptions",
  table: "delivery_exceptions",
  master: "delivery_exceptions",
  permission: CATALOG_MASTER_PERMISSIONS.delivery_exceptions,
  label: { singular: "Exception", plural: "Exceptions" },
  columns:
    "id, tenant_id, code, name, exc_type, inscan, show_on_mobile, created_at, created_by, updated_at, updated_by, deleted_at, row_version",
  searchColumns: ["code", "name"],
  orderBy: "code",
  ascending: true,
  importColumns: ["code", "name", "exc_type", "inscan", "show_on_mobile"],
  createSchema: deliveryExceptionCreateSchema,
  updateSchema: deliveryExceptionUpdateSchema,
};
