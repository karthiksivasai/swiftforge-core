import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { CATALOG_MASTER_PERMISSIONS } from "@/lib/permissions";
import {
  flightCreateSchema,
  flightUpdateSchema,
  type FlightCreate,
  type FlightUpdate,
} from "@/lib/masters/schemas/flights";

export type FlightRow = BaseRow & {
  code: string;
  name: string;
  flight_type: "PRIME" | "GCR";
};

export const flightsResource: MasterResource<FlightRow, FlightCreate, FlightUpdate> = {
  key: "flights",
  table: "flights",
  master: "flights",
  permission: CATALOG_MASTER_PERMISSIONS.flights,
  label: { singular: "Flight", plural: "Flights" },
  columns:
    "id, tenant_id, code, name, flight_type, created_at, created_by, updated_at, updated_by, deleted_at, row_version",
  searchColumns: ["code", "name"],
  orderBy: "name",
  ascending: true,
  importColumns: ["code", "name", "flight_type"],
  createSchema: flightCreateSchema,
  updateSchema: flightUpdateSchema,
};
