export type StatementFieldKey =
  | "type"
  | "fromDate"
  | "toDate"
  | "customer"
  | "origin"
  | "serviceCenter"
  | "product"
  | "serviceType"
  | "vendor"
  | "destination"
  | "state"
  | "salesExecutive"
  | "paymentType"
  | "customerType"
  | "productType"
  | "businessChannel"
  | "status"
  | "summary"
  | "obc"
  | "filterType"
  | "obcReport"
  | "branchType"
  | "vendorType"
  | "flightType"
  | "secondaryReportType";

export type StatementReportDefinition = {
  id: string;
  label: string;
  fields: StatementFieldKey[];
  secondRowFields?: StatementFieldKey[];
  extraRows?: StatementFieldKey[][];
  colSpans?: Partial<Record<StatementFieldKey, number>>;
  /** Details/Summary, or Report/Details/Summary (CourierWala Destination Summary / OBC). */
  typeMode?: "detailsSummary" | "reportDetailsSummary";
  customerTypeOptions?: readonly string[];
  businessChannelOptions?: readonly string[];
  productTypeOptions?: readonly string[];
  statusOptions?: readonly string[];
  summaryOptions?: readonly string[];
  filterTypeOptions?: readonly string[];
  branchTypeOptions?: readonly string[];
  vendorTypeOptions?: readonly string[];
  flightTypeOptions?: readonly string[];
  secondaryReportTypeOptions?: readonly string[];
};

export const STATEMENT_CUSTOMER_TYPES = ["Customer", "Co-Courier", "Franchisee"] as const;

export const BUSINESS_CHANNELS = [
  "Direct party",
  "Regional Business partner",
  "Regional Network Partner",
  "whole Sales Partner",
] as const;

export const STATEMENT_PRODUCT_TYPES = ["Domestic", "International", "Local", "Import"] as const;

export const AWB_STOCK_STATUS = ["All", "Used", "Un-Used"] as const;

export const SUMMARY_OPTIONS = ["All", "Customer", "Service Center"] as const;

export const OBC_FILTER_TYPES = [
  "All",
  "OBC Vendor",
  "Delivery Vendor",
  "NFO",
  "NFO Single",
  "Non NFO",
  "Performace 1",
  "Performace 2",
  "AirLines Performace 1",
  "AirLines Performace 2",
] as const;

export const OBC_BRANCH_TYPES = ["All", "Branches", "Franchise", "Others"] as const;

export const OBC_PRODUCT_TYPES = ["Air", "Surface", "Train", "All"] as const;

export const OBC_VENDOR_TYPES = ["OBC", "Delivery", "Vendor", "Airline"] as const;

export const OBC_FLIGHT_TYPES = ["Prime", "GCR"] as const;

export const SALES_EXECUTIVE_REPORT_TYPES = ["Commission", "Sales", "Profit"] as const;

export const STATEMENT_DEFINITIONS: StatementReportDefinition[] = [
  {
    id: "cash-collection",
    label: "Cash Collection Report",
    fields: ["fromDate", "toDate", "origin"],
    secondRowFields: ["serviceCenter", "product", "destination"],
    extraRows: [["vendor"]],
  },
  {
    id: "customer-awb-stock",
    label: "Customer AWB Stock Report",
    fields: ["customer", "serviceCenter", "status"],
    secondRowFields: ["summary"],
    statusOptions: AWB_STOCK_STATUS,
    summaryOptions: SUMMARY_OPTIONS,
  },
  {
    id: "customer-register-profit",
    label: "Customer Register / Profit",
    fields: ["fromDate", "toDate", "customer"],
    secondRowFields: ["origin", "serviceCenter", "product", "vendor"],
    extraRows: [["destination", "paymentType", "customerType", "businessChannel"]],
    customerTypeOptions: STATEMENT_CUSTOMER_TYPES,
    businessChannelOptions: BUSINESS_CHANNELS,
  },
  {
    id: "customer-summary",
    label: "Customer Summary",
    fields: ["fromDate", "toDate", "origin"],
    secondRowFields: ["serviceCenter"],
  },
  {
    id: "daily-report",
    label: "Daily Report",
    fields: ["fromDate", "toDate", "customer"],
    secondRowFields: ["origin", "serviceCenter", "product", "vendor"],
    extraRows: [
      ["destination", "paymentType", "customerType", "businessChannel"],
      ["productType", "type"],
    ],
    typeMode: "detailsSummary",
    customerTypeOptions: STATEMENT_CUSTOMER_TYPES,
    businessChannelOptions: BUSINESS_CHANNELS,
    productTypeOptions: STATEMENT_PRODUCT_TYPES,
  },
  {
    id: "destination-summary",
    label: "Destination Summary Report",
    fields: ["fromDate", "toDate", "origin"],
    secondRowFields: ["serviceCenter", "type"],
    typeMode: "reportDetailsSummary",
  },
  {
    id: "location-summary",
    label: "Location Summary",
    fields: ["fromDate", "toDate", "origin"],
    secondRowFields: ["serviceCenter"],
  },
  {
    id: "obc-report-checklist",
    label: "OBC Report / Checklist",
    fields: ["fromDate", "toDate", "origin"],
    secondRowFields: ["serviceCenter", "product", "destination", "obc"],
    extraRows: [
      ["paymentType", "filterType", "type", "obcReport"],
      ["branchType", "productType", "vendorType", "flightType"],
    ],
    typeMode: "reportDetailsSummary",
    filterTypeOptions: OBC_FILTER_TYPES,
    branchTypeOptions: OBC_BRANCH_TYPES,
    productTypeOptions: OBC_PRODUCT_TYPES,
    vendorTypeOptions: OBC_VENDOR_TYPES,
    flightTypeOptions: OBC_FLIGHT_TYPES,
  },
  {
    id: "product-summary",
    label: "Product Summary",
    fields: ["fromDate", "toDate", "origin"],
    secondRowFields: ["serviceCenter"],
  },
  {
    id: "sales-executive-wise-sales",
    label: "Sales Executive Wise Sales Report",
    fields: ["fromDate", "toDate", "customer"],
    secondRowFields: ["origin", "serviceCenter", "product", "vendor"],
    extraRows: [["salesExecutive", "secondaryReportType", "type"]],
    typeMode: "detailsSummary",
    secondaryReportTypeOptions: SALES_EXECUTIVE_REPORT_TYPES,
  },
  {
    id: "tariff-rate",
    label: "Tariff Rate Report",
    fields: ["fromDate", "toDate", "customer"],
    secondRowFields: ["origin", "serviceCenter", "product", "vendor"],
    extraRows: [["destination", "paymentType", "type"]],
    typeMode: "detailsSummary",
  },
  {
    id: "tax-report",
    label: "Tax Report",
    fields: ["fromDate", "toDate", "customer"],
    secondRowFields: ["origin", "serviceCenter", "state"],
  },
  {
    id: "vendor-profit",
    label: "Vendor Profit Report",
    fields: ["fromDate", "toDate", "origin", "destination"],
    secondRowFields: ["serviceCenter", "serviceType", "product", "paymentType"],
    extraRows: [["customer", "vendor", "customerType", "businessChannel"]],
    customerTypeOptions: STATEMENT_CUSTOMER_TYPES,
    businessChannelOptions: BUSINESS_CHANNELS,
  },
];

export const STATEMENT_FIELD_LABELS: Record<StatementFieldKey, string> = {
  type: "Report",
  fromDate: "From Date",
  toDate: "To Date",
  customer: "Customer",
  origin: "Origin",
  serviceCenter: "Service Center",
  product: "Product",
  serviceType: "Service Type",
  vendor: "Vendor",
  destination: "Destination",
  state: "State",
  salesExecutive: "Sales Executive",
  paymentType: "Payment Type",
  customerType: "Customer Type",
  productType: "Product Type",
  businessChannel: "Business Channel",
  status: "Status",
  summary: "Summary",
  obc: "OBC",
  filterType: "Type",
  obcReport: "OBC Report",
  branchType: "Branch Type",
  vendorType: "Vendor Type",
  flightType: "Flight Type",
  secondaryReportType: "Report Type",
};

export const STATEMENT_LOOKUP_FIELDS: Partial<
  Record<
    StatementFieldKey,
    "customer" | "destination" | "product" | "vendor" | "serviceCentre" | "paymentType" | "salesExecutive" | "obc" | "state" | "serviceType"
  >
> = {
  customer: "customer",
  origin: "destination",
  serviceCenter: "serviceCentre",
  product: "product",
  serviceType: "serviceType",
  vendor: "vendor",
  destination: "destination",
  state: "state",
  salesExecutive: "salesExecutive",
  paymentType: "paymentType",
  obc: "obc",
};

export const statementHasDateRange = (definition: StatementReportDefinition) => {
  const all = [
    ...definition.fields,
    ...(definition.secondRowFields ?? []),
    ...(definition.extraRows?.flat() ?? []),
  ];
  return all.includes("fromDate");
};
