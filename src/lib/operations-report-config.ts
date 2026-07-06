export type ReportFieldKey =
  | "type"
  | "fromDate"
  | "toDate"
  | "customer"
  | "origin"
  | "serviceCenter"
  | "product"
  | "vendor"
  | "destination"
  | "zone"
  | "fieldExecutive"
  | "exception"
  | "paymentType"
  | "serviceType"
  | "fromAwb"
  | "toAwb"
  | "manifestNo"
  | "formatType"
  | "copies"
  | "csbType"
  | "printingForwardNo"
  | "comment"
  | "userType"
  | "user"
  | "logType"
  | "customerType"
  | "productType"
  | "branchType"
  | "status"
  | "secondaryReportType"
  | "forwardingLabelNotGenerated"
  | "awbNo";

export type ReportAction = "search" | "download";

export type TypeFieldMode = "detailsSummary" | "awbPrint";

export type ReportDefinition = {
  id: string;
  label: string;
  fields: ReportFieldKey[];
  action: ReportAction;
  typeMode?: TypeFieldMode;
  /** Fields that render on a second row spanning fewer columns */
  secondRowFields?: ReportFieldKey[];
  /** Additional field rows (third row onward) */
  extraRows?: ReportFieldKey[][];
  /** Grid column span overrides (4-column grid) */
  colSpans?: Partial<Record<ReportFieldKey, number>>;
  /** Options for the secondary Report Type dropdown (Action Log sub-reports) */
  secondaryReportTypeOptions?: readonly string[];
  /** Options for Log Type dropdown — varies by report */
  logTypeOptions?: readonly string[];
  /** Options for Customer Type dropdown — varies by report */
  customerTypeOptions?: readonly string[];
  /** Options for Status dropdown — varies by report */
  statusOptions?: readonly string[];
  /** Options for User Type dropdown — varies by report */
  userTypeOptions?: readonly string[];
  /** Options for User dropdown — varies by report */
  userOptions?: readonly string[];
  /** Options for Product Type dropdown — varies by report */
  productTypeOptions?: readonly string[];
  /** Options for Branch Type dropdown — varies by report */
  branchTypeOptions?: readonly string[];
};

export const ACTION_LOG_TYPES = ["All", "Add", "Modify", "Delete"] as const;

export const USER_ENTRY_LOG_TYPES = ["All", "Login", "Logout", "Entry", "Update"] as const;

export const ACTION_LOG_REPORT_TYPES = [
  "AWB Entry log Report",
  "Customer Master Log Report",
  "Customer Master Status Entry Log",
  "Vendor Master Log Report",
  "Product Master Report",
  "Destination Master Report",
  "Location Master Report",
  "Country Master Report",
  "Zone Master Report",
  "Shipper Master Report",
  "Consignee Master Report",
  "Exception Master Report",
  "Route Master Report",
  "PickUp/Delivery Master Report",
  "Instruction Master Report",
  "Content Master Report",
  "Flight Master Report",
  "Sales Executive Master Report",
  "Invoice Log Report",
  "Customer Master Contract Entry Log Report",
  "Job allocation log report",
  "Receipt Entry Log Report",
  "Charges Master Log Report",
  "Adjustment Log Report",
  "Manifest Awb Entry Log",
  "Manifest Entry Log",
  "Audit Report",
  "Debit Note Entry Log",
  "Credit Note Entry Log",
  "Invoice Charges Log Report",
  "PickUp Module Report",
  "OBC Entry Log Report",
] as const;

/** Action Log sub-report that shows the AWB No. filter field */
export const ACTION_LOG_AWB_ENTRY_REPORT = "AWB Entry log Report" as const;

export const REPORT_USERS = [
  "admin",
  "AKSHITH",
  "ARUNV",
  "ASHOKU",
  "BHAVS",
  "BILLING",
  "CHINNU",
  "DINESH",
  "GAKHIL",
  "KRUPA",
  "MAHI",
  "PRAMOD",
  "PRAVEENV",
  "SATYA",
  "SKOKHIL",
  "SONTI",
  "SRAV",
  "SURYAA",
] as const;

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    id: "action-log",
    label: "Action Log",
    fields: ["fromDate", "toDate", "customer"],
    secondRowFields: ["origin", "serviceCenter", "secondaryReportType", "logType"],
    action: "search",
    secondaryReportTypeOptions: ACTION_LOG_REPORT_TYPES,
    logTypeOptions: ACTION_LOG_TYPES,
  },
  {
    id: "awb-printing",
    label: "AWB Printing",
    fields: ["type", "customer", "origin"],
    secondRowFields: ["serviceCenter", "product", "destination", "fromAwb"],
    extraRows: [
      ["toAwb", "manifestNo", "formatType", "copies"],
      ["csbType", "printingForwardNo"],
    ],
    action: "download",
    typeMode: "awbPrint",
  },
  {
    id: "comment-view",
    label: "Comment View Report",
    fields: ["fromDate", "toDate", "origin"],
    secondRowFields: ["serviceCenter", "comment"],
    colSpans: { comment: 3 },
    action: "search",
  },
  {
    id: "drs-report",
    label: "DRS Report",
    fields: ["fromDate", "toDate", "customer"],
    secondRowFields: ["origin", "serviceCenter", "fieldExecutive", "type"],
    action: "search",
    typeMode: "detailsSummary",
  },
  {
    id: "forwarding-no-missing",
    label: "Forwarding No Missing Report",
    fields: ["fromDate", "toDate", "customer"],
    secondRowFields: ["origin", "serviceCenter", "product", "vendor"],
    extraRows: [["destination", "customerType", "status", "forwardingLabelNotGenerated"]],
    action: "search",
    customerTypeOptions: ["Customer", "Co-Courier", "Franchisee"],
    statusOptions: ["All", "Delivered", "Pending"],
  },
  {
    id: "login-log",
    label: "Login Log",
    fields: ["fromDate", "toDate", "origin"],
    secondRowFields: ["serviceCenter", "userType", "user"],
    action: "search",
    userTypeOptions: ["Customer", "User"],
    userOptions: REPORT_USERS,
  },
  {
    id: "manifest-pod",
    label: "Manifest POD Report",
    fields: ["fromDate", "toDate", "origin"],
    secondRowFields: ["serviceCenter", "manifestNo", "type", "status"],
    action: "search",
    typeMode: "detailsSummary",
    statusOptions: ["All", "Delivered", "Pending"],
  },
  {
    id: "manifest-report",
    label: "Manifest Report",
    fields: ["fromDate", "toDate", "origin"],
    secondRowFields: ["serviceCenter", "vendor", "destination", "type"],
    action: "search",
    typeMode: "detailsSummary",
  },
  {
    id: "mis-report",
    label: "MIS Report",
    fields: ["fromDate", "toDate", "customer"],
    secondRowFields: ["origin", "serviceCenter", "product", "zone"],
    extraRows: [["destination", "secondaryReportType", "productType"]],
    action: "search",
    secondaryReportTypeOptions: ["All", "Delivered", "Un Delivered", "Pending", "RTO"],
    productTypeOptions: ["Domestic", "International", "Local", "Import"],
  },
  {
    id: "ok-delivery",
    label: "OK Delivery",
    fields: ["fromDate", "toDate", "exception"],
    secondRowFields: ["customer", "origin", "serviceCenter", "product"],
    extraRows: [
      ["vendor", "destination", "paymentType", "productType"],
      ["user", "customerType", "branchType", "status"],
    ],
    action: "search",
    userOptions: REPORT_USERS,
    customerTypeOptions: ["Customer", "Co-Courier", "Franchisee"],
    branchTypeOptions: ["All", "Branches", "Franchise", "Others"],
    productTypeOptions: ["Domestic", "International", "Local", "Import"],
    statusOptions: ["All", "Delivered", "Pending"],
  },
  {
    id: "scan-report",
    label: "Scan Report",
    fields: ["fromDate", "toDate", "customer"],
    secondRowFields: ["origin", "serviceCenter", "product", "destination"],
    extraRows: [["paymentType", "secondaryReportType"]],
    colSpans: { secondaryReportType: 3 },
    action: "search",
    secondaryReportTypeOptions: ["Entry v/s Scan", "Scan v/s Entry", "Pickup V/s In Scan"],
  },
  {
    id: "unassigned-drs",
    label: "Unassigned DRS Report",
    fields: ["fromDate", "toDate", "customer"],
    secondRowFields: ["origin", "serviceCenter", "product", "vendor"],
    extraRows: [["destination", "paymentType", "customerType", "status"]],
    action: "search",
    customerTypeOptions: ["Customer", "Co-Courier", "Franchisee"],
    statusOptions: ["All", "Delivered", "Pending"],
  },
  {
    id: "unassigned-manifest",
    label: "Unassigned Manifest Report",
    fields: ["fromDate", "toDate", "customer"],
    secondRowFields: ["origin", "serviceCenter", "product", "vendor"],
    extraRows: [
      ["destination", "serviceType", "paymentType", "customerType"],
      ["branchType", "type"],
    ],
    action: "search",
    typeMode: "detailsSummary",
    customerTypeOptions: ["Customer", "Co-Courier", "Franchisee"],
    branchTypeOptions: ["All", "Branches", "Franchise", "Others"],
  },
  {
    id: "unassigned-obc",
    label: "Unassigned OBC Report",
    fields: ["fromDate", "toDate", "customer"],
    secondRowFields: ["origin", "serviceCenter", "product", "vendor"],
    extraRows: [["destination", "customerType", "branchType"]],
    action: "search",
    customerTypeOptions: ["Customer", "Co-Courier", "Franchisee"],
    branchTypeOptions: ["All", "Branches", "Franchise", "Others"],
  },
  {
    id: "undelivery",
    label: "Undelivery Report",
    fields: ["fromDate", "toDate", "customer"],
    secondRowFields: ["origin", "serviceCenter", "product", "vendor"],
    extraRows: [["destination", "paymentType", "productType", "customerType"]],
    action: "search",
    productTypeOptions: ["Domestic", "International", "Local", "Import"],
    customerTypeOptions: ["Customer", "Co-Courier", "Franchisee"],
  },
  {
    id: "user-analysis",
    label: "User Analysis Report",
    fields: ["fromDate", "toDate", "origin"],
    secondRowFields: ["serviceCenter", "user"],
    action: "search",
    userOptions: REPORT_USERS,
  },
  {
    id: "user-entry-log",
    label: "User Entry Log Report",
    fields: ["fromDate", "toDate", "userType"],
    secondRowFields: ["logType"],
    action: "search",
    userTypeOptions: ["Branch User", "Customer", "Customer User"],
    logTypeOptions: ACTION_LOG_TYPES,
  },
];

export const AWB_PRINT_TYPES = ["AWB No. wise", "Date wise", "Invoice wise"] as const;
export const FORMAT_TYPES = ["Label", "PDF", "Excel"] as const;
export const CSB_TYPES = [
  "CSB 4",
  "CSB 5",
  "COMMERCIAL",
  "ECM DOX",
  "ECM SPX",
  "CBE XII",
  "CBE XIII",
] as const;
export const USER_TYPES = ["Branch User", "Admin User", "Customer User"] as const;
export const LOG_TYPES = USER_ENTRY_LOG_TYPES;
export const CUSTOMER_TYPES = ["B2B", "B2C", "Corporate", "Retail"] as const;
export const PRODUCT_TYPES = ["DOX", "SPX", "NDOX", "ENV"] as const;
export const BRANCH_TYPES = ["All", "Own", "Franchise", "Agent"] as const;
export const STATUS_OPTIONS = ["All", "Pending", "Completed", "In Progress", "Cancelled"] as const;
export const SECONDARY_REPORT_TYPES = ["Summary", "Detailed", "Consolidated"] as const;
export const DEMO_USERS = ["SURYAA", "ADMIN", "BRANCH01", "OPSUSER"] as const;

export const FIELD_LABELS: Record<ReportFieldKey, string> = {
  type: "Type",
  fromDate: "From Date",
  toDate: "To Date",
  customer: "Customer",
  origin: "Origin",
  serviceCenter: "Service Center",
  product: "Product",
  vendor: "Vendor",
  destination: "Destination",
  zone: "Zone",
  fieldExecutive: "Field Executive",
  exception: "Exception",
  paymentType: "Payment Type",
  serviceType: "Service Type",
  fromAwb: "From AWB No.",
  toAwb: "To AWB No.",
  manifestNo: "Manifest No.",
  formatType: "Format Type",
  copies: "Copies",
  csbType: "CSB Type",
  printingForwardNo: "Printing Forward No.",
  comment: "Comment",
  userType: "User Type",
  user: "User",
  logType: "Log Type",
  customerType: "Customer Type",
  productType: "Product Type",
  branchType: "Branch Type",
  status: "Status",
  secondaryReportType: "Report Type",
  forwardingLabelNotGenerated: "Forwarding Label not Generated",
  awbNo: "AWB No.",
};

export const LOOKUP_FIELDS: Partial<Record<ReportFieldKey, "customer" | "destination" | "product" | "vendor" | "zone" | "fieldExecutive" | "exception" | "serviceCentre">> = {
  customer: "customer",
  origin: "destination",
  serviceCenter: "serviceCentre",
  product: "product",
  vendor: "vendor",
  destination: "destination",
  zone: "zone",
  fieldExecutive: "fieldExecutive",
  exception: "exception",
};
