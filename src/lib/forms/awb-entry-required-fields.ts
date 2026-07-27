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
  return Boolean(pair.id || pair.code.trim() || pair.name.trim());
}

export function getVendorChargePrerequisiteErrors(
  form: {
    clientName: LookupPair;
    consignee: { origin: LookupPair };
    product: LookupPair;
    service: LookupPair;
    vendor: LookupPair;
  },
  opts?: { consigneeNotRequired?: boolean },
): string[] {
  const errors: string[] = [];
  if (!isAwbLookupSelected(form.clientName)) {
    errors.push("Please fill Client Name before adding charges.");
  }
  if (!opts?.consigneeNotRequired && !isAwbLookupSelected(form.consignee.origin)) {
    errors.push("Please fill Destination before adding charges.");
  }
  if (!form.product.code.trim() && !form.product.name.trim()) {
    errors.push("Please fill Product before adding charges.");
  }
  if (!isAwbLookupSelected(form.service)) {
    errors.push("Please fill Service before adding charges.");
  }
  if (!isAwbLookupSelected(form.vendor)) {
    errors.push("Please fill Vendor before adding charges.");
  }
  return errors;
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
      return Boolean(form.product.code.trim() || form.product.name.trim());
    case AWB_NAV.SERVICE:
      return isAwbLookupSelected(form.service);
    default:
      return true;
  }
}
