import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { GEO_MASTER_PERMISSIONS } from "@/lib/permissions";
import {
  countryPincodeCreateSchema,
  countryPincodeUpdateSchema,
  type CountryPincodeCreate,
  type CountryPincodeUpdate,
} from "@/lib/masters/schemas/countryPincodes";

export type CountryPincodeRow = BaseRow & {
  country_id: string;
  pin_code: string;
  city_name: string;
  state_name: string | null;
};

export const countryPincodesResource: MasterResource<
  CountryPincodeRow,
  CountryPincodeCreate,
  CountryPincodeUpdate
> = {
  key: "country_pincodes",
  table: "country_pincodes",
  master: "country_pincodes",
  permission: GEO_MASTER_PERMISSIONS.country_pincodes,
  label: { singular: "Country Pincode", plural: "Country Pincodes" },
  columns:
    "id, tenant_id, country_id, pin_code, city_name, state_name, created_at, created_by, updated_at, updated_by, deleted_at, row_version",
  searchColumns: ["pin_code", "city_name"],
  orderBy: "pin_code",
  ascending: true,
  importColumns: ["country_code", "pin_code", "city_name", "state_name"],
  lookupKey: "country-pincode",
  createSchema: countryPincodeCreateSchema,
  updateSchema: countryPincodeUpdateSchema,
};
