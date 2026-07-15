/**
 * Shared form state for CourierWala Operations Reports.
 */
export type OpsLookupPair = { code: string; name: string };

export type OperationsReportForm = {
  reportType: string;
  type: string;
  fromDate: string;
  toDate: string;
  customer: OpsLookupPair;
  origin: OpsLookupPair;
  serviceCenter: OpsLookupPair;
  product: OpsLookupPair;
  vendor: OpsLookupPair;
  destination: OpsLookupPair;
  zone: OpsLookupPair;
  fieldExecutive: OpsLookupPair;
  exception: OpsLookupPair;
  paymentType: OpsLookupPair;
  serviceType: OpsLookupPair;
  fromAwb: string;
  toAwb: string;
  manifestNo: string;
  formatType: string;
  copies: string;
  csbType: string;
  printingForwardNo: string;
  comment: string;
  userType: string;
  user: string;
  logType: string;
  customerType: string;
  productType: string;
  branchType: string;
  status: string;
  secondaryReportType: string;
  forwardingLabelNotGenerated: boolean;
  awbNo: string;
  addToJobQueue: boolean;
};

export type OpsFilterProps = {
  value: OperationsReportForm;
  onChange: (patch: Partial<OperationsReportForm>) => void;
  /** When Action Log secondary type is AWB Entry, show AWB No. */
  showAwbNo?: boolean;
};

export const emptyOpsPair = (): OpsLookupPair => ({ code: "", name: "" });

export const todayIso = () => new Date().toISOString().slice(0, 10);

export function emptyOperationsForm(reportType = ""): OperationsReportForm {
  const today = todayIso();
  return {
    reportType,
    type: "Details",
    fromDate: today,
    toDate: today,
    customer: emptyOpsPair(),
    origin: emptyOpsPair(),
    serviceCenter: emptyOpsPair(),
    product: emptyOpsPair(),
    vendor: emptyOpsPair(),
    destination: emptyOpsPair(),
    zone: emptyOpsPair(),
    fieldExecutive: emptyOpsPair(),
    exception: emptyOpsPair(),
    paymentType: emptyOpsPair(),
    serviceType: emptyOpsPair(),
    fromAwb: "",
    toAwb: "",
    manifestNo: "",
    formatType: "",
    copies: "",
    csbType: "",
    printingForwardNo: "",
    comment: "",
    userType: "",
    user: "",
    logType: "All",
    customerType: "",
    productType: "",
    branchType: "All",
    status: "All",
    secondaryReportType: "",
    forwardingLabelNotGenerated: false,
    awbNo: "",
    addToJobQueue: false,
  };
}

export function daysBetween(from: string, to: string): number {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}
