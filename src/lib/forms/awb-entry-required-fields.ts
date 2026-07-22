import { AWB_NAV } from "@/lib/forms/awb-entry-nav-order";

type LookupPair = { id?: string; code: string; name: string };

export const AWB_REQUIRED_NAV_ORDERS = new Set<number>([
  AWB_NAV.SHIPPER_ORIGIN,
  AWB_NAV.SHIPPER_COMPANY,
  AWB_NAV.CONSIGNEE_DESTINATION,
  AWB_NAV.CONSIGNEE_COMPANY,
  AWB_NAV.PRODUCT,
  AWB_NAV.SERVICE,
]);

export function isAwbLookupSelected(pair: LookupPair): boolean {
  return Boolean(pair.id || pair.code.trim());
}

export function validateAwbNavField(
  order: number,
  form: {
    shipper: { origin: LookupPair; companyName: LookupPair };
    consignee: { origin: LookupPair; companyName: LookupPair };
    product: LookupPair;
    service: LookupPair;
  },
  opts?: { consigneeNotRequired?: boolean },
): boolean {
  switch (order) {
    case AWB_NAV.SHIPPER_ORIGIN:
      return isAwbLookupSelected(form.shipper.origin);
    case AWB_NAV.SHIPPER_COMPANY:
      return isAwbLookupSelected(form.shipper.companyName);
    case AWB_NAV.CONSIGNEE_DESTINATION:
      if (opts?.consigneeNotRequired) return true;
      return isAwbLookupSelected(form.consignee.origin);
    case AWB_NAV.CONSIGNEE_COMPANY:
      if (opts?.consigneeNotRequired) return true;
      return isAwbLookupSelected(form.consignee.companyName);
    case AWB_NAV.PRODUCT:
      return Boolean(form.product.code.trim());
    case AWB_NAV.SERVICE:
      return isAwbLookupSelected(form.service);
    default:
      return true;
  }
}
