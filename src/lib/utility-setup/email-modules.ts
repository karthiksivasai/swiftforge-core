/** Live Xpresion Setup → Module Name. Booking and delivery are not in this list. */
export const EMAIL_MODULE_OPTIONS = [
  "EMAIL ON FORWARDING",
  "EMAIL ON PROGRESS",
  "ESTATEMENT",
  "ESTATEMENT WEIGHT ALERT",
  "KYC XPRESION",
  "E-MAIL FOOTER",
] as const;

/**
 * Booking and delivery email stay a real feature. The live Setup dropdown does
 * not contain them; Utility → Notification edits these two configs.
 */
export const SHIPMENT_EMAIL_MODULES = ["EMAIL ON BOOKING", "EMAIL ON DELIVERY"] as const;

export type EmailModuleName =
  | (typeof EMAIL_MODULE_OPTIONS)[number]
  | (typeof SHIPMENT_EMAIL_MODULES)[number];

export const EMAIL_MODULE_CODES: Record<
  Exclude<EmailModuleName, "KYC XPRESION" | "E-MAIL FOOTER">,
  string
> = {
  "EMAIL ON BOOKING": "BOOKING",
  "EMAIL ON DELIVERY": "DELIVERY",
  "EMAIL ON FORWARDING": "FORWARDING",
  "EMAIL ON PROGRESS": "PROGRESS",
  ESTATEMENT: "ESTATEMENT",
  "ESTATEMENT WEIGHT ALERT": "WEIGHT_ALERT",
};

export type PrintField = {
  label: string;
  key: string;
  kind: "text" | "boolean" | "date" | "time";
};

export const MODULE_EXTRA_FIELDS: Partial<Record<EmailModuleName, PrintField[]>> = {
  "EMAIL ON BOOKING": [
    { label: "Weight Heading", key: "weightHeading", kind: "text" },
    { label: "Print Shipper", key: "printShipper", kind: "boolean" },
    { label: "Print Booking Time", key: "printBookingTime", kind: "boolean" },
    { label: "Print DOX/SPX", key: "printDoxSpx", kind: "boolean" },
    { label: "Print Weight", key: "printWeight", kind: "boolean" },
    { label: "Print Product Name", key: "printProductName", kind: "boolean" },
    { label: "Print Vol Weight", key: "printVolWeight", kind: "boolean" },
    { label: "Print Total Amount", key: "printTotalAmount", kind: "boolean" },
    { label: "Print Vendor AWB No.", key: "printVendorAwbNo", kind: "boolean" },
    { label: "Print Sender", key: "printSender", kind: "boolean" },
    { label: "Print Origin", key: "printOrigin", kind: "boolean" },
    { label: "Print Customer", key: "printCustomer", kind: "boolean" },
    { label: "Print Content", key: "printContent", kind: "boolean" },
  ],
  "EMAIL ON DELIVERY": [
    { label: "Print Ref No.", key: "printRefNo", kind: "boolean" },
    { label: "Print DOX/SPX", key: "printDoxSpx", kind: "boolean" },
    { label: "Print Pcs", key: "printPcs", kind: "boolean" },
    { label: "Print Weight", key: "printWeight", kind: "boolean" },
    { label: "Print Sender", key: "printSender", kind: "boolean" },
  ],
  "EMAIL ON FORWARDING": [
    { label: "Print DOX/SPX", key: "printDoxSpx", kind: "boolean" },
    { label: "Print Pcs", key: "printPcs", kind: "boolean" },
    { label: "Print Weight", key: "printWeight", kind: "boolean" },
    { label: "Print Vendor Name", key: "printVendorName", kind: "boolean" },
  ],
  ESTATEMENT: [
    { label: "Date", key: "statementDate", kind: "date" },
    { label: "Sending Time", key: "sendingTime", kind: "time" },
  ],
  "ESTATEMENT WEIGHT ALERT": [
    { label: "Print Sender", key: "printSender", kind: "boolean" },
    { label: "Origin", key: "printOrigin", kind: "boolean" },
    { label: "Consignee", key: "printConsignee", kind: "boolean" },
    { label: "Print Vendor AWB No", key: "printVendorAwbNo", kind: "boolean" },
    { label: "Print Vendor Name", key: "printVendorName", kind: "boolean" },
    { label: "Print PCS", key: "printPcs", kind: "boolean" },
  ],
};

export const DEFAULT_FOOTER_ROWS = [
  { controlName: "AWB Prefix", code: "" },
  { controlName: "E-MAIL Regards 1", code: "" },
  { controlName: "E-MAIL Regards 2", code: "" },
  { controlName: "E-MAIL Regards 3", code: "" },
  { controlName: "E-MAIL Regards 4", code: "" },
  { controlName: "E-MAIL Regards 5", code: "" },
  { controlName: "E-MAIL Regards 6", code: "" },
  { controlName: "E-MAIL Regards 7", code: "" },
];

export function emptyEmailConfig() {
  return {
    id: null as string | null,
    row_version: null as number | null,
    has_password: false,
    smtpServer: "",
    smtpPort: "",
    fromEmail: "",
    mailUserId: "",
    mailPassword: "",
    messageDear: "",
    messageSubject: "",
    messageBody: "",
    ssl: false,
    printFlags: {} as Record<string, boolean | string>,
  };
}

export function isSmtpModule(
  module: string,
): module is Exclude<EmailModuleName, "KYC XPRESION" | "E-MAIL FOOTER"> {
  return module in EMAIL_MODULE_CODES;
}
