/**
 * Master resource registry.
 *
 * Central export point + a loosely-typed list/map for generic consumers (M6
 * screens, import pickers, nav building) that iterate over masters without
 * caring about each one's concrete row/schema types. Named generically because
 * the same framework will later register Customers, Vendors, Products, Charges,
 * Taxes, Fuel, Rates, and other master groups — not just geo.
 */
import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";

import { countriesResource } from "./countries";
import { zonesResource } from "./zones";
import { statesResource } from "./states";
import { destinationsResource } from "./destinations";
import { pincodesResource } from "./pincodes";
import { countryPincodesResource } from "./countryPincodes";
import { areasResource } from "./areas";
import { productTypesResource } from "./productTypes";
import { productsResource } from "./products";
import { banksResource } from "./banks";
import { industriesResource } from "./industries";
import { contentsResource } from "./contents";
import { instructionsResource } from "./instructions";
import { salesExecutivesResource } from "./salesExecutives";
import { flightsResource } from "./flights";
import { deliveryExceptionsResource } from "./deliveryExceptions";
import { chargesResource } from "./charges";
import { airlinesResource } from "./airlines";
import { serviceCentersResource } from "./serviceCenters";
import { fieldExecutivesResource } from "./fieldExecutives";
import { consigneesResource } from "./consignees";
import { shippersResource } from "./shippers";
import { customersResource } from "./customers";
import { customerRatesResource } from "./customerRates";
import { serviceMappingsResource } from "./serviceMappings";
import { vendorContractsResource } from "./vendorContracts";
import { localBranchesResource } from "./localBranches";
import { expenseHeadsResource } from "./expenseHeads";

// geo (Phase 3 — Geo Masters)
export * from "./countries";
export * from "./zones";
export * from "./states";
export * from "./destinations";
export * from "./pincodes";
export * from "./countryPincodes";
export * from "./areas";
// catalog (Phase 3 — Catalog Masters, Milestone 8)
export * from "./productTypes";
export * from "./products";
export * from "./banks";
export * from "./industries";
export * from "./contents";
export * from "./instructions";
export * from "./salesExecutives";
export * from "./flights";
export * from "./deliveryExceptions";
// catalog complex (Phase 3 — Catalog Masters, Milestone 9A)
export * from "./charges";
export * from "./airlines";
// catalog aggregate (Phase 3 — Catalog Masters, Milestone 9B)
export * from "./serviceCenters";
export * from "./fieldExecutives";
// party simple (Phase 3 — Party Masters, Milestone 10A)
export * from "./consignees";
export * from "./shippers";
// party aggregate (Phase 3 — Party Masters, Milestone 10B)
export * from "./customers";
export * from "./customerRates";
// operation masters (Phase 3 — Operation Masters)
export * from "./serviceMappings";
export * from "./vendorContracts";
export * from "./localBranches";
export * from "./expenseHeads";

/** Erased resource type for generic iteration. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyMasterResource = MasterResource<BaseRow, any, any>;

export const masterResources = [
  // geo
  countriesResource,
  zonesResource,
  statesResource,
  destinationsResource,
  pincodesResource,
  countryPincodesResource,
  areasResource,
  // catalog
  productTypesResource,
  productsResource,
  banksResource,
  industriesResource,
  contentsResource,
  instructionsResource,
  salesExecutivesResource,
  flightsResource,
  deliveryExceptionsResource,
  // catalog complex
  chargesResource,
  airlinesResource,
  // catalog aggregate
  serviceCentersResource,
  fieldExecutivesResource,
  // party simple
  consigneesResource,
  shippersResource,
  customersResource,
  customerRatesResource,
  // operation
  serviceMappingsResource,
  vendorContractsResource,
  localBranchesResource,
  expenseHeadsResource,
] as unknown as AnyMasterResource[];

export const masterResourceByKey: Record<string, AnyMasterResource> = Object.fromEntries(
  masterResources.map((r) => [r.key, r]),
);
