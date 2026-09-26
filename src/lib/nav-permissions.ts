import { NAVIGATION, type NavSection } from "@/lib/navigation";
import type { PermissionAction } from "@/lib/permissions";

/**
 * Nav path → existing permission_modules.slug.
 * Slugs are the Access Rights keys. Do not invent a second catalog.
 * A path may accept any one of several slugs (the landing dashboard).
 */
export const NAV_PERMISSION_BY_PATH: Record<string, string | readonly string[]> = {
  "/dashboard": ["txn.opertation-dashboard", "txn.sales-dashboard"],

  "/master/sales/product": "mst.product-master",
  "/master/sales/product-master": "mst.product-master",
  "/master/sales/zone": "mst.zone-master",
  "/master/sales/country": "mst.country-master",
  "/master/sales/destination": "mst.destination-master",
  "/master/sales/service-center": "mst.service-center-master",
  "/master/sales/state": "mst.state-master",
  "/master/sales/sales-executive": "mst.sales-executive-master",
  "/master/sales/industry": "mst.industry-master",
  "/master/sales/flight": "mst.flight-no-master",
  "/master/sales/product-type": "mst.product-type",
  "/master/sales/content": "mst.content-master",
  "/master/sales/instruction": "mst.instruction-master",
  "/master/sales/local-branch": "mst.local-branch-master",
  "/master/sales/charges-master": "mst.charge-master",
  "/master/sales/bank-master": "mst.bank-master",

  "/master/customer/customer": "mst.customer-master",
  "/master/customer/customer-rate": "mst.customer-contract-master",
  "/master/customer/consignee": "mst.consignee-master",
  "/master/customer/shipper": "mst.shipper-master",
  "/master/customer/expense": "mst.expense-master",

  "/master/vendor/vendor": "mst.vendor-master",
  "/master/vendor/vendor-contract": "mst.vendor-contract-master",

  "/master/operation/service-mapping": "mst.service-mapping",
  "/master/operation/field-executive": "mst.field-executive-master",
  "/master/operation/exception": "mst.delivery-exception-master",
  "/master/operation/airline": "mst.airlines",
  "/master/operation/country-pincodes": "mst.country-pincodes",

  "/transaction/pickup": "txn.pickup",
  "/transaction/pickup-inscan": "txn.pickup-insacn",
  "/transaction/awb-entry": "txn.awb-entry",
  "/transaction/manifest-scan": "txn.manifest-scan",
  "/transaction/manifest-in-scan": "txn.manifest-in-scan",
  "/transaction/manifest-view": "txn.update-manifest",
  "/transaction/drs-scan": "txn.drs-scan",
  "/transaction/un-delivery-scan": "txn.un-delivery-scan",
  "/transaction/bagging": "txn.bagging",
  "/transaction/transfer-run": "txn.transfer-run",
  "/transaction/miss-route-scan": "txn.miss-route-scan",
  "/transaction/out-scan/obc-entry": "txn.obc-entry",
  "/transaction/tracking/awb-query": "txn.awb-query",
  "/transaction/tracking/forwarding-updation": "txn.forwarding-updation",
  "/transaction/tracking/progress-comment": "txn.progress-comments-update",
  "/transaction/tracking/kyc-tracking": "txn.kyc-tracking",
  "/transaction/tracking/update-entry": "txn.update-record",
  "/transaction/receipt/expense-authorize": "txn.expense-authorize",
  "/transaction/receipt/receipt-entry": "txn.receipt-entry",
  "/transaction/receipt/expense-entry": "txn.expense-entry",
  "/transaction/receipt/debit-note": "txn.debit-note",
  "/transaction/receipt/credit-note": "txn.credit-note",
  "/transaction/receipt/customer-payment": "txn.customer-pay",
  "/transaction/bulk-import/pod-to-excel": "txn.pod-to-excel",
  "/transaction/rate-compare/vendor-rate-compare": "txn.vendor-rate-compare",
  "/transaction/rate-compare/customer-rate-compare": "txn.customerratecompare",

  "/reports/operations": "rpt.operation-report",
  "/reports/statements": "rpt.statement-report",
  "/reports/awb": "rpt.awb-report",
  "/reports/scan": "rpt.scan-report",
  "/reports/ar-report": "rpt.ar-report",

  "/utility/serviceable-pincode": "utl.serviceable-pincode",
  "/utility/notification": "utl.notification",
  "/utility/integration-configuration": "mst.vendor-master",
  "/utility/users/user-setup": ["utl.user-setup", "utility.user_setup"],
  "/utility/users/access-rights": "utl.access-rights",
  "/utility/users/loggedin-users": "utl.loggedin-users",
  "/utility/excel-import/awb-merging": "utl.awb-merging",
  "/utility/excel-import/pod-merging": "utl.pod-merging",
  "/utility/excel-import/forwarding-merging": "utl.forwarding-merging",
  "/utility/excel-import/data-import": "utl.data-import",
  "/utility/excel-import/data-updation": "utl.data-updation",
  "/utility/tax-charges-setup/fuel-setup": "utl.fuel-setup",
  "/utility/tax-charges-setup/tax-setup": "utl.tax-surcharge-setup",
  "/utility/tax-charges-setup/setup": "utl.xpresion-setup",
  "/utility/rate-zone-update/rate-update": "utl.rate-update",
  "/utility/rate-zone-update/zone-update": "utl.zone-update",
  "/utility/rate-zone-update/rate-import": "utl.rate-import",
};

type Can = (slug: string, action: PermissionAction) => boolean;

function slugsFor(pathname: string): string[] | null {
  if (NAV_PERMISSION_BY_PATH[pathname]) {
    const value = NAV_PERMISSION_BY_PATH[pathname];
    return typeof value === "string" ? [value] : [...value];
  }
  const prefix = Object.keys(NAV_PERMISSION_BY_PATH)
    .filter((path) => pathname.startsWith(`${path}/`))
    .sort((left, right) => right.length - left.length)[0];
  if (!prefix) return null;
  const value = NAV_PERMISSION_BY_PATH[prefix];
  return typeof value === "string" ? [value] : [...value];
}

/** True when this path is a screen the signed-in group may open. */
export function canOpenPath(pathname: string, hasPermission: Can, isAdmin: boolean): boolean {
  const slugs = slugsFor(pathname);
  if (slugs) return slugs.some((slug) => hasPermission(slug, "list") || hasPermission(slug, "search"));
  const appScreen =
    pathname === "/dashboard" ||
    pathname.startsWith("/master/") ||
    pathname.startsWith("/transaction/") ||
    pathname.startsWith("/reports/") ||
    pathname.startsWith("/utility/");
  return appScreen ? isAdmin : true;
}

export function filterNavigation(hasPermission: Can, isAdmin: boolean): NavSection[] {
  return NAVIGATION.flatMap((section) => {
    if (section.standalone && section.path) {
      return canOpenPath(section.path, hasPermission, isAdmin) ? [section] : [];
    }
    const items = section.items?.filter((leaf) => canOpenPath(leaf.path, hasPermission, isAdmin));
    const groups = section.groups
      ?.map((group) => ({
        ...group,
        items: group.items.filter((leaf) => canOpenPath(leaf.path, hasPermission, isAdmin)),
      }))
      .filter((group) => group.items.length > 0);
    if ((!items || items.length === 0) && (!groups || groups.length === 0)) return [];
    return [{ ...section, items, groups }];
  });
}
