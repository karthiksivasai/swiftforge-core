import { AWB_NAV } from "@/lib/forms/awb-entry-nav-order";
import {
  AWB_FIELD_MESSAGES,
  awbFieldRequirements,
  type AwbFieldRequirements,
  type AwbFormSetupSettings,
} from "@/lib/forms/awb-form-setup";
import { consigneeBookingErrors } from "@/lib/transactions/awbEntryRules";

type LookupPair = { id?: string; code: string; name: string };

export const AWB_REQUIRED_NAV_ORDERS = new Set<number>([
  AWB_NAV.CLIENT,
  AWB_NAV.SHIPPER_ORIGIN,
  AWB_NAV.SHIPPER_COMPANY,
  AWB_NAV.CONSIGNEE_DESTINATION,
  AWB_NAV.CONSIGNEE_COMPANY,
  AWB_NAV.PRODUCT,
  AWB_NAV.VENDOR,
  AWB_NAV.AIRLINE,
  AWB_NAV.SERVICE,
]);

export type AwbRequirementOptions = {
  requirements?: AwbFieldRequirements;
};

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
  opts?: AwbRequirementOptions & { consigneeNotRequired?: boolean },
): string[] {
  const errors: string[] = [];
  const destinationRequired =
    opts?.requirements?.destination ?? !opts?.consigneeNotRequired;
  if (!isAwbLookupSelected(form.clientName)) {
    errors.push("Please fill Client Name before adding charges.");
  }
  if (destinationRequired && !isAwbLookupSelected(form.consignee.origin)) {
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
    clientName: LookupPair;
    shipper: { origin: LookupPair; companyName: LookupPair };
    consignee: { origin: LookupPair; companyName: LookupPair };
    product: LookupPair;
    vendor: LookupPair;
    service: LookupPair;
    airline?: string;
  },
  opts?: AwbRequirementOptions & { consigneeNotRequired?: boolean },
): boolean {
  const requirements = opts?.requirements;
  switch (order) {
    case AWB_NAV.CLIENT:
      return isAwbLookupSelected(form.clientName);
    case AWB_NAV.SHIPPER_ORIGIN:
      return isAwbLookupSelected(form.shipper.origin);
    case AWB_NAV.SHIPPER_COMPANY:
      return isAwbLookupSelected(form.shipper.companyName);
    case AWB_NAV.CONSIGNEE_DESTINATION:
      if (requirements ? !requirements.destination : opts?.consigneeNotRequired) return true;
      return isAwbLookupSelected(form.consignee.origin);
    case AWB_NAV.CONSIGNEE_COMPANY:
      if (requirements ? !requirements.consigneeCompany : opts?.consigneeNotRequired) return true;
      return isAwbLookupSelected(form.consignee.companyName);
    case AWB_NAV.PRODUCT:
      return Boolean(form.product.code.trim() || form.product.name.trim());
    case AWB_NAV.VENDOR:
      return isAwbLookupSelected(form.vendor);
    case AWB_NAV.AIRLINE:
      if (!requirements?.airline) return true;
      return Boolean((form.airline ?? "").trim());
    case AWB_NAV.SERVICE:
      return isAwbLookupSelected(form.service);
    default:
      return true;
  }
}

export function awbOptionalFieldErrors(
  input: {
    destination: LookupPair;
    consignee: {
      companyName?: string;
      address1?: string;
      city?: string;
      postcode?: string;
      country?: string;
      phone?: string;
    };
    airline?: string;
  },
  setup: Pick<AwbFormSetupSettings, "consigneeNotRequired" | "allowConsigneeNameBlank" | "airlineNotRequired">,
): string[] {
  const requirements = awbFieldRequirements(setup);
  const errors: string[] = [];
  if (requirements.destination && !isAwbLookupSelected(input.destination)) {
    errors.push(AWB_FIELD_MESSAGES.destination);
  }
  errors.push(...consigneeBookingErrors(input.consignee, requirements));
  if (requirements.airline && !(input.airline ?? "").trim()) {
    errors.push(AWB_FIELD_MESSAGES.airline);
  }
  return errors;
}
