export type AwbFieldKey =
  | "type"
  | "fromDate"
  | "toDate"
  | "reportFor"
  | "customer"
  | "origin"
  | "serviceCenter"
  | "product"
  | "vendor"
  | "serviceType"
  | "destination"
  | "awbNo"
  | "paymentType"
  | "instruction"
  | "contractHead"
  | "manifestNo"
  | "fromManifestNo"
  | "toManifestNo"
  | "invoiceNo"
  | "customerType"
  | "formatType"
  | "businessChannel"
  | "chargeType"
  | "productType"
  | "tax"
  | "lockType"
  | "registerType"
  | "billed"
  | "unBilled"
  | "summary"
  | "otherCharges";

export type AwbReportDefinition = {
  id: string;
  label: string;
  fields: AwbFieldKey[];
  secondRowFields?: AwbFieldKey[];
  extraRows?: AwbFieldKey[][];
  customerTypeOptions?: readonly string[];
  businessChannelOptions?: readonly string[];
  chargeTypeOptions?: readonly string[];
  productTypeOptions?: readonly string[];
  formatTypeOptions?: readonly string[];
  taxOptions?: readonly string[];
  lockTypeOptions?: readonly string[];
  registerTypeOptions?: readonly string[];
  reportForOptions?: readonly string[];
  typeOptions?: readonly string[];
  fieldLabels?: Partial<Record<AwbFieldKey, string>>;
};

export const AWB_CUSTOMER_TYPES = ["Customer", "Co-Courier", "Franchisee"] as const;

export const AWB_BUSINESS_CHANNELS = [
  "Direct party",
  "Regional Business partner",
  "Regional Network Partner",
  "whole Sales Partner",
] as const;

export const AWB_CHARGE_TYPES = ["All", "Manual", "System"] as const;

export const AWB_PRODUCT_TYPES = ["Domestic", "International", "Local", "Import"] as const;

export const AWB_FORMAT_TYPES = ["PDF", "Excel", "Summary"] as const;

export const AWB_TAX_TYPES = ["Tax", "Without Tax"] as const;

export const AWB_INVOICE_FORMAT_TYPES = ["Register", "GST Report"] as const;

export const AWB_LOCK_TYPES = ["All", "Locked", "Unlocked"] as const;

export const AWB_REGISTER_TYPES = ["B2B", "B2C", "SEZWP", "SEZWOP"] as const;

export const AWB_REPORT_FOR_TYPES = ["Customer", "Vendor"] as const;

export const AWB_ZERO_TYPES = ["All"] as const;

export const AWB_REPORT_DEFINITIONS: AwbReportDefinition[] = [
  {
    id: "billing",
    label: "Billing Report",
    fields: ["fromDate", "toDate", "customer"],
    secondRowFields: ["origin", "serviceCenter", "product", "vendor"],
    extraRows: [
      ["serviceType", "destination", "awbNo", "paymentType"],
      ["instruction", "contractHead", "fromManifestNo", "toManifestNo"],
      ["invoiceNo", "customerType", "formatType", "businessChannel"],
      ["chargeType", "productType", "tax"],
      ["billed", "unBilled", "summary", "otherCharges"],
    ],
    customerTypeOptions: AWB_CUSTOMER_TYPES,
    businessChannelOptions: AWB_BUSINESS_CHANNELS,
    chargeTypeOptions: AWB_CHARGE_TYPES,
    productTypeOptions: AWB_PRODUCT_TYPES,
    formatTypeOptions: AWB_FORMAT_TYPES,
    taxOptions: AWB_TAX_TYPES,
  },
  {
    id: "cod",
    label: "COD Report",
    fields: ["fromDate", "toDate", "vendor"],
    secondRowFields: ["manifestNo", "formatType"],
    formatTypeOptions: AWB_FORMAT_TYPES,
  },
  {
    id: "invoice",
    label: "Invoice Report",
    fields: ["fromDate", "toDate", "origin"],
    secondRowFields: ["serviceCenter", "formatType", "lockType", "customer"],
    extraRows: [["productType", "registerType"]],
    formatTypeOptions: AWB_INVOICE_FORMAT_TYPES,
    lockTypeOptions: AWB_LOCK_TYPES,
    productTypeOptions: AWB_PRODUCT_TYPES,
    registerTypeOptions: AWB_REGISTER_TYPES,
    fieldLabels: { formatType: "Format" },
  },
  {
    id: "void",
    label: "Void Report",
    fields: ["fromDate", "toDate", "origin"],
    secondRowFields: ["serviceCenter", "product", "vendor", "serviceType"],
    extraRows: [["destination", "awbNo", "paymentType", "customer"]],
  },
  {
    id: "zero",
    label: "Zero Report",
    fields: ["fromDate", "toDate", "reportFor"],
    secondRowFields: ["product", "vendor", "serviceType", "destination"],
    extraRows: [
      ["awbNo", "paymentType", "instruction", "contractHead"],
      ["type", "customer"],
    ],
    reportForOptions: AWB_REPORT_FOR_TYPES,
    typeOptions: AWB_ZERO_TYPES,
  },
];

export const AWB_FIELD_LABELS: Record<AwbFieldKey, string> = {
  type: "Type",
  fromDate: "From Date",
  toDate: "To Date",
  reportFor: "Report For",
  customer: "Customer",
  origin: "Origin",
  serviceCenter: "Service Centre",
  product: "Product",
  vendor: "Vendor",
  serviceType: "Service Type",
  destination: "Destination",
  awbNo: "AWB No",
  paymentType: "Payment Type",
  instruction: "Instruction",
  contractHead: "Contract Head",
  manifestNo: "Manifest No.",
  fromManifestNo: "From Manifest No",
  toManifestNo: "To Manifest No",
  invoiceNo: "Invoice No.",
  customerType: "Customer Type",
  formatType: "Format Type",
  businessChannel: "Business Channel",
  chargeType: "Charge Type",
  productType: "Product Type",
  tax: "Tax",
  lockType: "Lock Type",
  registerType: "Register Type",
  billed: "Billed",
  unBilled: "Un Billed",
  summary: "Summary",
  otherCharges: "Other Charges",
};

export const AWB_LOOKUP_FIELDS: Partial<
  Record<
    AwbFieldKey,
    "customer" | "destination" | "product" | "vendor" | "serviceCentre" | "paymentType" | "serviceType" | "contractHead"
  >
> = {
  customer: "customer",
  origin: "destination",
  serviceCenter: "serviceCentre",
  product: "product",
  vendor: "vendor",
  serviceType: "serviceType",
  destination: "destination",
  paymentType: "paymentType",
  contractHead: "contractHead",
};

export const awbHasDateRange = (definition: AwbReportDefinition) => {
  const fields = [
    ...definition.fields,
    ...(definition.secondRowFields ?? []),
    ...(definition.extraRows?.flat() ?? []),
  ];
  return fields.includes("fromDate");
};
