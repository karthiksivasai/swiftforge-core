import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { SIMPLE_PARTY_MASTER_PERMISSIONS } from "@/lib/permissions";
import {
  shipperCreateSchema,
  shipperUpdateSchema,
  type ShipperCreate,
  type ShipperUpdate,
} from "@/lib/masters/schemas/shippers";

export type ShipperRow = BaseRow & {
  code: string;
  name: string;
  customer_id: string | null;
  customer_name: string | null;
  mobile: string;
  email: string | null;
  address: string | null;
  pin_code: string | null;
  city: string | null;
  state_id: string | null;
  country_id: string | null;
  status: "ACTIVE" | "INACTIVE";
};

export const shippersResource: MasterResource<ShipperRow, ShipperCreate, ShipperUpdate> = {
  key: "shippers",
  table: "shippers",
  master: "shippers",
  permission: SIMPLE_PARTY_MASTER_PERMISSIONS.shippers,
  label: { singular: "Shipper", plural: "Shippers" },
  columns:
    "id, tenant_id, code, name, customer_id, customer_name, mobile, email, address, pin_code, city, state_id, country_id, status, created_at, created_by, updated_at, updated_by, deleted_at, row_version",
  searchColumns: ["code", "name", "customer_name", "mobile", "city"],
  orderBy: "name",
  ascending: true,
  importColumns: [
    "code",
    "name",
      "customer_code",
      "customer",
    "mobile",
    "email",
    "address",
    "pin_code",
    "city",
    "state_code",
    "country_code",
    "status",
  ],
  lookupKey: "shipper",
  createSchema: shipperCreateSchema,
  updateSchema: shipperUpdateSchema,
};
