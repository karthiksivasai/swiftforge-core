import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { GEO_MASTER_PERMISSIONS } from "@/lib/permissions";
import {
  countryCreateSchema,
  countryUpdateSchema,
  type CountryCreate,
  type CountryUpdate,
} from "@/lib/masters/schemas/countries";

export type CountryRow = BaseRow & {
  code: string;
  name: string;
  weight_unit: "KGS" | "LBS" | null;
  currency: string | null;
  isd_code: string | null;
};

export const countriesResource: MasterResource<CountryRow, CountryCreate, CountryUpdate> = {
  key: "countries",
  table: "countries",
  master: "countries",
  permission: GEO_MASTER_PERMISSIONS.countries,
  label: { singular: "Country", plural: "Countries" },
  columns:
    "id, tenant_id, code, name, weight_unit, currency, isd_code, created_at, created_by, updated_at, updated_by, deleted_at, row_version",
  searchColumns: ["code", "name"],
  orderBy: "name",
  ascending: true,
  importColumns: ["code", "name", "weight_unit", "currency", "isd_code"],
  lookupKey: "country",
  createSchema: countryCreateSchema,
  updateSchema: countryUpdateSchema,
};
