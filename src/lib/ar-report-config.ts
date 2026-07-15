export type ArFieldKey =
  | "fromDate"
  | "toDate"
  | "customer"
  | "serviceCenter"
  | "salesExecutive"
  | "fieldExecutive"
  | "type"
  | "transactionType"
  | "asOnDate"
  | "withZero";

export type ArReportDefinition = {
  id: string;
  label: string;
  fields: ArFieldKey[];
  secondRowFields?: ArFieldKey[];
  extraRows?: ArFieldKey[][];
  typeMode?: "detailsSummary";
  transactionTypeOptions?: readonly string[];
};

export const AR_TRANSACTION_TYPES = ["Select", "Debit", "Credit"] as const;

export const AR_REPORT_DEFINITIONS: ArReportDefinition[] = [
  {
    id: "ledger-ageing",
    label: "Ledger Ageing Report",
    fields: ["fromDate", "toDate", "customer"],
    secondRowFields: ["serviceCenter", "type"],
    typeMode: "detailsSummary",
  },
  {
    id: "ledger-details",
    label: "Ledger Details Report",
    fields: ["fromDate", "toDate", "customer"],
    secondRowFields: ["serviceCenter", "transactionType"],
    transactionTypeOptions: AR_TRANSACTION_TYPES,
  },
  {
    id: "ledger-outstanding",
    label: "Ledger Outstanding Report",
    fields: ["fromDate", "toDate", "customer"],
    secondRowFields: ["serviceCenter", "salesExecutive", "fieldExecutive", "type"],
    extraRows: [["asOnDate", "withZero"]],
    typeMode: "detailsSummary",
  },
];

export const AR_FIELD_LABELS: Record<ArFieldKey, string> = {
  fromDate: "From Date",
  toDate: "To Date",
  customer: "Customer",
  serviceCenter: "Service Centre",
  salesExecutive: "Sales Executive",
  fieldExecutive: "Field Executive",
  type: "Type",
  transactionType: "Debit/Credit Transaction",
  asOnDate: "As on Date",
  withZero: "With Zero",
};

export const AR_LOOKUP_FIELDS: Partial<
  Record<ArFieldKey, "customer" | "serviceCentre" | "salesExecutive" | "fieldExecutive">
> = {
  customer: "customer",
  serviceCenter: "serviceCentre",
  salesExecutive: "salesExecutive",
  fieldExecutive: "fieldExecutive",
};

export const arHasDateRange = (definition: ArReportDefinition) => {
  const fields = [
    ...definition.fields,
    ...(definition.secondRowFields ?? []),
    ...(definition.extraRows?.flat() ?? []),
  ];
  return fields.includes("fromDate");
};

export const arShowsUnbilledAmount = (definition: ArReportDefinition) =>
  definition.id === "ledger-details";
