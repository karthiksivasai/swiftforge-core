/**
 * Centralized permission model (client-side gating only).
 *
 * The database is the real boundary — RLS + SECURITY DEFINER functions
 * (migrations 0009/0011/0015) evaluate `app.user_has_permission(...)` on every
 * write. These helpers exist purely so the UI can hide/disable actions the user
 * can't perform, and so non-React modules (the master resource layer) can reason
 * about permissions without importing the auth React context.
 *
 * `slug` values must match `permission_modules.slug` seeded in the backend.
 */

export type PermissionAction = "add" | "modify" | "delete" | "list" | "search";

export type PermissionActions = {
  all_access: boolean;
  can_add: boolean;
  can_modify: boolean;
  can_delete: boolean;
  can_list: boolean;
  can_search: boolean;
};

/** A tenant's resolved permission set, keyed by module slug. */
export type PermissionMap = Record<string, PermissionActions>;

/** Pure check against a single resolved action set (`all_access` wins). */
export function can(actions: PermissionActions | undefined, action: PermissionAction): boolean {
  if (!actions) return false;
  if (actions.all_access) return true;
  switch (action) {
    case "add":
      return actions.can_add;
    case "modify":
      return actions.can_modify;
    case "delete":
      return actions.can_delete;
    case "list":
      return actions.can_list;
    case "search":
      return actions.can_search;
    default:
      return false;
  }
}

/** Pure check against a whole permission map by slug. */
export function canDo(map: PermissionMap, slug: string, action: PermissionAction): boolean {
  return can(map[slug], action);
}

/** Resolve every action flag for a slug at once (handy for UI toolbars). */
export function resolveActions(map: PermissionMap, slug: string) {
  return {
    canAdd: canDo(map, slug, "add"),
    canModify: canDo(map, slug, "modify"),
    canDelete: canDo(map, slug, "delete"),
    canList: canDo(map, slug, "list"),
    canSearch: canDo(map, slug, "search"),
  };
}

export type ResolvedActions = ReturnType<typeof resolveActions>;

/**
 * Geo master permission slugs (Phase 3). Single source of truth so resource
 * definitions and screens never hardcode slug strings.
 */
export const GEO_MASTER_PERMISSIONS = {
  countries: "mst.country-master",
  zones: "mst.zone-master",
  states: "mst.state-master",
  destinations: "mst.destination-master",
  pincodes: "mst.pincode-master",
  country_pincodes: "mst.country-pincodes",
  areas: "mst.area-master",
} as const;

export type GeoMasterKey = keyof typeof GEO_MASTER_PERMISSIONS;

/**
 * Catalog master permission slugs (Phase 3 — Catalog Masters, Milestone 8).
 * All slugs are seeded in the base permission set (migration 0010).
 */
export const CATALOG_MASTER_PERMISSIONS = {
  product_types: "mst.product-type",
  products: "mst.product-master",
  banks: "mst.bank-master",
  industries: "mst.industry-master",
  contents: "mst.content-master",
  instructions: "mst.instruction-master",
  sales_executives: "mst.sales-executive-master",
  flights: "mst.flight-no-master",
  delivery_exceptions: "mst.delivery-exception-master",
} as const;

export type CatalogMasterKey = keyof typeof CATALOG_MASTER_PERMISSIONS;

/**
 * Complex catalog master permission slugs (Phase 3 — Catalog Masters,
 * Milestone 9A). All slugs are seeded in the base permission set (migration
 * 0010): `mst.charge-master`, `mst.airlines`.
 */
export const COMPLEX_CATALOG_MASTER_PERMISSIONS = {
  charges: "mst.charge-master",
  airlines: "mst.airlines",
} as const;

export type ComplexCatalogMasterKey = keyof typeof COMPLEX_CATALOG_MASTER_PERMISSIONS;

/**
 * Aggregate catalog master permission slugs (Phase 3 — Catalog Masters,
 * Milestone 9B). Each aggregate has its OWN dedicated module: `mst.service-center-master`
 * governs Service Centers and `mst.field-executive-master` governs Field
 * Executives. Both are seeded in the base set (migration 0010); migration 0021
 * renames the earlier borrowed modules and backfills TENANT_ADMIN / OPERATIONS.
 */
export const AGGREGATE_CATALOG_MASTER_PERMISSIONS = {
  service_centers: "mst.service-center-master",
  field_executives: "mst.field-executive-master",
} as const;

export type AggregateCatalogMasterKey = keyof typeof AGGREGATE_CATALOG_MASTER_PERMISSIONS;

/**
 * Simple party master permission slugs (Phase 3 — Party Masters, Milestone 10A).
 * Both slugs are seeded in the base permission set (migration 0010).
 */
export const SIMPLE_PARTY_MASTER_PERMISSIONS = {
  consignees: "mst.consignee-master",
  shippers: "mst.shipper-master",
} as const;

export type SimplePartyMasterKey = keyof typeof SIMPLE_PARTY_MASTER_PERMISSIONS;

/**
 * Customer aggregate permission slug (Phase 3 — Party Masters, Milestone 10B).
 * Seeded in migration 0010 as `mst.customer-master`.
 */
export const CUSTOMER_AGGREGATE_PERMISSIONS = {
  customers: "mst.customer-master",
} as const;

export type CustomerAggregateKey = keyof typeof CUSTOMER_AGGREGATE_PERMISSIONS;

/**
 * Vendor aggregate permission slug (Phase 3 — Party Masters, Milestone 11B).
 * Seeded in migration 0010 as `mst.vendor-master`.
 */
export const VENDOR_AGGREGATE_PERMISSIONS = {
  vendors: "mst.vendor-master",
} as const;

export type VendorAggregateKey = keyof typeof VENDOR_AGGREGATE_PERMISSIONS;

/**
 * Integration framework permission (Phase 7 — Milestone 7A).
 * Reuses vendor-master — no new RBAC slug.
 */
export const INTEGRATION_PERMISSIONS = {
  credentials: "mst.vendor-master",
} as const;

/**
 * Service mapping master permission slug (Phase 3 — Operation Masters).
 * Seeded in migration 0010 as `mst.service-mapping`.
 */
export const SERVICE_MAPPING_PERMISSIONS = {
  service_mappings: "mst.service-mapping",
} as const;

export type ServiceMappingKey = keyof typeof SERVICE_MAPPING_PERMISSIONS;

/**
 * Vendor contract aggregate permission slug (Phase 3 — Operation Masters).
 * Seeded in migration 0010 as `mst.vendor-contract-master`.
 */
export const VENDOR_CONTRACT_PERMISSIONS = {
  vendor_contracts: "mst.vendor-contract-master",
} as const;

export type VendorContractKey = keyof typeof VENDOR_CONTRACT_PERMISSIONS;

/**
 * Local branch master permission slug (Phase 3 — Sales Masters).
 * Seeded in migration 0010 as `mst.local-branch-master`.
 */
export const LOCAL_BRANCH_PERMISSIONS = {
  local_branches: "mst.local-branch-master",
} as const;

export type LocalBranchKey = keyof typeof LOCAL_BRANCH_PERMISSIONS;

/**
 * Pickup transaction permission slugs (Phase 4 — Milestone 2).
 * Seeded in migration 0010 as `txn.pickup` / `txn.pickup-cancel`.
 */
export const PICKUP_PERMISSIONS = {
  pickups: "txn.pickup",
  pickup_cancel: "txn.pickup-cancel",
} as const;

export type PickupPermissionKey = keyof typeof PICKUP_PERMISSIONS;

/**
 * Shipment / AWB Entry permission slugs (Phase 4 — Milestone 3A).
 * Seeded in migration 0010.
 */
export const SHIPMENT_PERMISSIONS = {
  shipments: "txn.awb-entry",
  void_cancel: "txn.awb-entry-void-cancel",
} as const;

export type ShipmentPermissionKey = keyof typeof SHIPMENT_PERMISSIONS;

/**
 * Manifest Scan permission slugs (Phase 4 — Milestone 4A).
 * Seeded in migration 0010 as `txn.manifest-scan`.
 */
export const MANIFEST_PERMISSIONS = {
  manifests: "txn.manifest-scan",
  update: "txn.update-manifest",
  inscan: "txn.manifest-in-scan",
} as const;

export type ManifestPermissionKey = keyof typeof MANIFEST_PERMISSIONS;

/**
 * DRS Scan permission slugs (Phase 4 — Milestone 4C).
 * Seeded in migration 0010 as `txn.drs-scan`.
 */
export const DRS_PERMISSIONS = {
  drs: "txn.drs-scan",
} as const;

export type DrsPermissionKey = keyof typeof DRS_PERMISSIONS;

/**
 * POD Entry permission slugs (Phase 4 — Milestone 4E).
 * Seeded in migration 0010 as `txn.pod-entry-ok-update`.
 */
export const POD_PERMISSIONS = {
  podEntry: "txn.pod-entry-ok-update",
} as const;

export type PodPermissionKey = keyof typeof POD_PERMISSIONS;

/**
 * Tracking permission slugs (Phase 4 — Milestone 4F).
 * Seeded in migration 0010.
 */
export const TRACKING_PERMISSIONS = {
  awbQuery: "txn.awb-query",
  progressComment: "txn.progress-comments-update",
  hold: "txn.awb-hold-unhold",
} as const;

export type TrackingPermissionKey = keyof typeof TRACKING_PERMISSIONS;

/**
 * Finance permission slugs (Phase 4 — Milestone 4G).
 * Seeded in migration 0010.
 */
export const FINANCE_PERMISSIONS = {
  receiptEntry: "txn.receipt-entry",
  expenseEntry: "txn.expense-entry",
  expenseAuthorize: "txn.expense-authorize",
  customerPay: "txn.customer-pay",
  debitNote: "txn.debit-note",
  creditNote: "txn.credit-note",
  invoiceIrnGeneration: "doc.invoice-irn-generation",
  invoiceCancelAfterIrn: "doc.invoice-cancel-after-irn-generated",
} as const;

export type FinancePermissionKey = keyof typeof FINANCE_PERMISSIONS;

/**
 * Customs EDI / CSB export permission slugs (Phase 7 — Milestone 7F).
 * Seeded in migration 0010.
 */
export const CUSTOMS_EDI_PERMISSIONS = {
  ediCsbFiles: "rpt.edi-csb-files",
  bagging: "txn.bagging",
} as const;

export type CustomsEdiPermissionKey = keyof typeof CUSTOMS_EDI_PERMISSIONS;

/**
 * Utility tax/fuel setup permission slugs (Phase 6 — Milestone 6D).
 * Seeded in migration 0010.
 */
export const UTILITY_TAX_FUEL_PERMISSIONS = {
  fuelSetup: "utl.fuel-setup",
  taxSetup: "utl.tax-surcharge-setup",
} as const;

export type UtilityTaxFuelPermissionKey = keyof typeof UTILITY_TAX_FUEL_PERMISSIONS;

/**
 * Utility notification / email setup permission slugs (Phase 6 — Milestone 6E).
 * Seeded in migration 0010.
 */
export const UTILITY_NOTIFICATION_PERMISSIONS = {
  notification: "utl.notification",
  xpresionSetup: "utl.xpresion-setup",
} as const;

export type UtilityNotificationPermissionKey = keyof typeof UTILITY_NOTIFICATION_PERMISSIONS;

/**
 * Utility serviceable pincode permission slug (Phase 6 — Milestone 6F).
 * Seeded in migration 0010.
 */
export const UTILITY_SERVICEABLE_PINCODE_PERMISSION = "utl.serviceable-pincode" as const;
