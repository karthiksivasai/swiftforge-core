import type { FormFieldConfig } from "@/lib/utility-setup/types";

export const FORM_SETUP_MODULES = [
  "AWB Entry",
  "Manifest",
  "Scan",
  "PickUp Inscan",
  "AWB Query",
  "DRS Scan",
  "PickUp",
  "RCP Entry",
] as const;

export type FormSetupModuleKey = (typeof FORM_SETUP_MODULES)[number];

function field(
  name: string,
  type: "checkbox" | "text",
  enabled: boolean,
  value = "",
): FormFieldConfig {
  return { name, type, enabled, value };
}

function checks(rows: Array<[string, boolean]>): FormFieldConfig[] {
  return rows.map(([name, enabled]) => field(name, "checkbox", enabled));
}

const formSetupDefinitions: Record<FormSetupModuleKey, FormFieldConfig[]> = {
  "AWB Entry": [
    field("SHIPMENT HOLD", "checkbox", false),
    field("VOLUMETRIC ACTUAL WEIGHT ONCE", "checkbox", true),
    field("NOVALIDATION INSCAN", "checkbox", true),
    field("MTS", "checkbox", true),
    field("COD AND TOPAY RECEIPT", "checkbox", false),
    field("ADDITIONAL TAT", "text", false),
    field("DEFAULT_SERVICE", "text", false),
    field("CUSTOMER VOLUMETRIC WEIGHT", "checkbox", false),
    field("LOCK_STOCK", "text", false),
    field("FUELSURCHARGEWEIGHT", "checkbox", false),
    field("VOLUMEDISCOUNT", "checkbox", false),
    field("AWB CHARGES CODE", "text", false),
    field("ODA PIN CHARGE CODE", "text", false),
    field("NEW EXCEL RATE", "checkbox", true),
    field("NON SERVICE PIN CHARGES", "checkbox", false),
    field("EMAIL ON BOOKING", "text", false),
    field("SMS ON BOOKING", "text", false),
    field("SMS TO CONSIGNEE ON BOOKING", "checkbox", false),
    field("BOOKING PROGRESS", "checkbox", false),
    field("BOOKING PROGRESS TEXT", "text", false),
    field("COMPANY BILLING", "checkbox", false),
    field("POST SELF", "checkbox", false),
    field("REMOTE PINCODE", "checkbox", false),
    field("CUSTINVFORMATO", "checkbox", true),
  ],
  Manifest: [
    field("TRANSIT TIME", "checkbox", false),
    field("BAGMODULE", "text", false),
    field("LOCATION CAPTION", "text", false, "Service Centre"),
    field("Awbtype", "text", false, "C"),
    field("MANIFEST EXCEL MERGING", "checkbox", false),
    field("BRANCH MANIFEST", "checkbox", true),
    field("EMAIL ON PROGRESS", "text", false),
    field("PREALERT VIEW", "checkbox", false),
    field("COD RETAIL", "checkbox", false),
    field("LOCATION MANIFEST", "checkbox", false),
    field("PIECES RATE", "checkbox", false),
    field("BAG LABLE PRINT", "checkbox", false),
    field("SPLIT AWB GENERATION", "checkbox", false),
    field("MANIFEST AWB CD FOLDER", "text", false),
    field("MANIFEST VENDOR UPDATE", "checkbox", true),
    field("MANIFEST PRODUCT UPDATE", "checkbox", false),
    field("ALLOW DELIVERED MANIFEST DRS", "checkbox", false),
    field("BAGGING CLUSTER", "checkbox", false),
    field("TRANSIT TIME HITMISS", "checkbox", false),
    field("POSTING", "checkbox", false),
  ],
  Scan: [
    field("BAGWITHMANI", "checkbox", false),
    field("PCSEXPORTSCAN", "checkbox", false),
    field("VENDAWBEXPORTSCAN", "checkbox", true),
    field("DESTEXPORTSCAN", "checkbox", false),
    field("PRODEXPORTSCAN", "checkbox", false),
    field("INSTEXPORTSCAN", "checkbox", false),
    field("MULTI MANIFESTSCAN", "checkbox", false),
    field("ENTRYONINSCAN", "checkbox", false),
    field("EXPORTSCANADDAWB", "checkbox", false),
    field("VALIDDESTEXPORTSCAN", "checkbox", false),
    field("NOVALIDATION INSCAN", "checkbox", true),
    field("REQ INSCAN WEIGHT", "checkbox", false),
    field("PICKUPINSCAN2 ADD AWB", "checkbox", false),
    field("INSCAN DESTINATION UPDATE", "checkbox", false),
  ],
  "PickUp Inscan": [
    field("MANIFEST INSCAN DATE ENABLE", "checkbox", false),
    field("SHIPMENT HOLD", "checkbox", false),
    field("INSCAN PCS DETAIL", "checkbox", false),
    field("STOCK", "checkbox", false),
    field("FRANCHISE BILLING", "checkbox", false),
    field("COMPANY ENTRY", "checkbox", false),
    field("INSCANADENTRYPROD", "checkbox", false),
    field("INSCANDEST", "checkbox", false),
    field("Awbtype", "text", false, "C"),
    field("CUSTOMER VOLUMETRIC WEIGHT", "checkbox", false),
    field("VOLUMETRIC ACTUAL WEIGHT ONCE", "checkbox", true),
    field("MANIINSCANCUST", "checkbox", false),
    field("PICKUP MODULE", "checkbox", false),
    field("INSCANPAY", "checkbox", false),
    field("INSCAN SERVICE", "checkbox", true),
    field("INSCAN VENDOR", "checkbox", false),
    field("AIRLINE SERVICE", "checkbox", true),
    field("INSCANPCS", "checkbox", false),
    field("INSCANADENTRYWEIGHT", "checkbox", false),
    field("INSCANAMOUNT", "checkbox", false),
    field("EAWB MODULE", "checkbox", false),
    field("VolumetricDivide_InCh", "text", false, "2000"),
    field("VOLUMETRICDIVIDE", "text", false, "5000"),
    field("COSTMODULE", "checkbox", false),
    field("IMPORTSCANNOMANIFEST", "checkbox", false),
    field("IMPORTSCANADENTRY", "checkbox", false),
    field("BAGMODULE", "text", false),
    field("PICKUPINSCAN2 ADD AWB", "text", false),
    field("INSCAN DESTINATION UPDATE", "checkbox", false),
  ],
  "AWB Query": [
    field("SMS ON DELIVERY URL", "text", false),
    field("NEW OBC MODULE", "checkbox", false),
    field("DRSSCANADAWB", "checkbox", false),
    field("NOVALIDATION INSCAN", "checkbox", true),
    field("ALLOW DELIVERED MANIFEST DRS", "checkbox", false),
    field("REDRS_PODVALIDATE", "checkbox", false),
    field("EMAIL ON PROGRESS", "text", false),
    field("USERS ACCESS GROUP", "checkbox", false),
    field("SMS ON PROGRESS", "text", false),
    field("SHIPPING PROGRESS NOCHECK INSCAN", "checkbox", true),
  ],
  "DRS Scan": [
    ...checks([
      ["DRS DATE ENABLE", false],
      ["DRS PCS DETAIL", false],
      ["DRS VENDOR", false],
      ["DRS SERVICE", true],
      ["DRS DESTINATION", false],
      ["DRS PRODUCT", false],
      ["ALLOW DELIVERED MANIFEST DRS", false],
      ["DRSSCANADAWB", false],
      ["REDRS_PODVALIDATE", false],
      ["NOVALIDATION INSCAN", true],
      ["POD ENTRY OK UPDATE", false],
      ["DRS EXCEL MERGING", false],
    ]),
    field("SMS ON DELIVERY URL", "text", false),
    field("EMAIL ON PROGRESS", "text", false),
    field("SMS ON PROGRESS", "text", false),
    field("SHIPPING PROGRESS NOCHECK INSCAN", "checkbox", true),
  ],
  PickUp: checks([
    ["PICKUP CENTER", false],
    ["PICKUP WEIGHT", false],
    ["PICKUP PRODUCT", false],
    ["PICKUP DIMENSION", false],
    ["NOTCOPYPICKUPSHIPTOCONS", false],
  ]),
  "RCP Entry": checks([
    ["RCPENTRY AREA", false],
    ["RCPENTRY PAY ACCOUNT", false],
    ["RCPENTRY DRAWN BANK", false],
    ["RCPENTRY CHEQUE DD/NO", true],
    ["RCPENTRY CHEQUE DATE", false],
    ["RCPENTRY BANK CASH", true],
  ]),
};

export function defaultFormSetup(module: FormSetupModuleKey): FormFieldConfig[] {
  return formSetupDefinitions[module].map((row) => ({ ...row }));
}

export function mergeFormSetup(
  module: FormSetupModuleKey,
  saved: FormFieldConfig[] | null | undefined,
): FormFieldConfig[] {
  const defaults = defaultFormSetup(module);
  if (!saved?.length) return defaults;
  const byName = new Map(saved.map((row) => [row.name, row]));
  return defaults.map((row) => {
    const match = byName.get(row.name);
    if (!match) return row;
    return {
      ...row,
      enabled: Boolean(match.enabled),
      value: match.value ?? row.value,
    };
  });
}
