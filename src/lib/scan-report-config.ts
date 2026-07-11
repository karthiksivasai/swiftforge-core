export type ScanFieldKey =
  | "fromManifestDate"
  | "toManifestDate"
  | "fromDate"
  | "toDate"
  | "fromBookingDate"
  | "toBookingDate"
  | "manifestNo"
  | "bagNo"
  | "serviceCenter"
  | "serviceType"
  | "origin"
  | "destination"
  | "customer"
  | "vendor"
  | "forwardingVendor"
  | "product"
  | "exception"
  | "status"
  | "formatType"
  | "csbType"
  | "awbNo"
  | "forwardingNo"
  | "invoiceNo"
  | "originalShipper"
  | "withClubAwbNo"
  | "type";

export type ScanAction = "print" | "search";

export type ScanTypeMode = "awbForwarding" | "detailsSummary";

export type ScanReportDefinition = {
  id: string;
  label: string;
  fields: ScanFieldKey[];
  action: ScanAction;
  secondRowFields?: ScanFieldKey[];
  extraRows?: ScanFieldKey[][];
  typeMode?: ScanTypeMode;
  statusOptions?: readonly string[];
};

export const SCAN_REPORT_DEFINITIONS: ScanReportDefinition[] = [
  {
    id: "bag-wise-detail-print",
    label: "Bag wise Detail Print",
    fields: ["manifestNo", "product", "formatType"],
    action: "print",
    secondRowFields: ["originalShipper", "withClubAwbNo", "type"],
    typeMode: "awbForwarding",
  },
  {
    id: "bagging",
    label: "Bagging Report",
    fields: ["fromManifestDate", "toManifestDate", "manifestNo"],
    action: "search",
    secondRowFields: ["bagNo", "type"],
    typeMode: "detailsSummary",
  },
  {
    id: "delivery-status",
    label: "Delivery Status Report",
    fields: ["fromDate", "toDate", "serviceCenter"],
    action: "search",
    secondRowFields: ["origin", "destination", "customer", "vendor"],
    extraRows: [["forwardingVendor", "product", "exception", "status"]],
    statusOptions: ["All", "Deliverd", "UnDeliverd"],
  },
  {
    id: "edi-csb-files",
    label: "EDI CSB Files",
    fields: ["manifestNo", "product", "csbType"],
    action: "search",
    secondRowFields: ["type"],
    typeMode: "awbForwarding",
  },
  {
    id: "forwarding",
    label: "Forwarding Report",
    fields: ["fromBookingDate", "toBookingDate", "customer"],
    action: "search",
    secondRowFields: ["serviceType", "awbNo", "forwardingNo", "forwardingVendor"],
  },
  {
    id: "volumetric-weight",
    label: "Volumetric Weight Report",
    fields: ["fromDate", "toDate", "customer"],
    action: "search",
    secondRowFields: ["invoiceNo"],
  },
];

export const SCAN_FORMAT_TYPES = ["Format1", "Format2", "Format3", "Format4"] as const;

export const SCAN_CSB_TYPES = ["CSB-III", "CSB-IV", "CSB-V"] as const;

export const SCAN_TYPE_OPTIONS = ["AWB No.", "Forwarding No."] as const;

export const SCAN_FIELD_LABELS: Record<ScanFieldKey, string> = {
  fromManifestDate: "From Manifest Date",
  toManifestDate: "To Manifest Date",
  fromDate: "From Date",
  toDate: "To Date",
  fromBookingDate: "From Booking Date",
  toBookingDate: "To Booking Date",
  manifestNo: "Manifest No.",
  bagNo: "Bag No.",
  serviceCenter: "Service Center",
  serviceType: "Service Type",
  origin: "Origin",
  destination: "Destination",
  customer: "Customer",
  vendor: "Vendor",
  forwardingVendor: "Forwarding Vendor",
  product: "Product",
  exception: "Exception",
  status: "Status",
  formatType: "Format",
  csbType: "Type",
  awbNo: "AWB No.",
  forwardingNo: "Forwarding No",
  invoiceNo: "Invoice No.",
  originalShipper: "Original Shipper",
  withClubAwbNo: "With Club AWB No",
  type: "Type",
};
