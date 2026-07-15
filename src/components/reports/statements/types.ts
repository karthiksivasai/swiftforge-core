/**
 * Shared form state for CourierWala Statements reports.
 */
export type StmtLookupPair = { code: string; name: string };

export type StatementsReportForm = {
  reportType: string;
  type: string;
  fromDate: string;
  toDate: string;
  customer: StmtLookupPair;
  origin: StmtLookupPair;
  serviceCenter: StmtLookupPair;
  product: StmtLookupPair;
  serviceType: StmtLookupPair;
  vendor: StmtLookupPair;
  destination: StmtLookupPair;
  state: StmtLookupPair;
  salesExecutive: StmtLookupPair;
  paymentType: StmtLookupPair;
  customerType: string;
  productType: string;
  businessChannel: string;
  status: string;
  summary: string;
  obc: StmtLookupPair;
  filterType: string;
  obcReport: boolean;
  branchType: string;
  vendorType: string;
  flightType: string;
  secondaryReportType: string;
  addToJobQueue: boolean;
};

export type StmtFilterProps = {
  value: StatementsReportForm;
  onChange: (patch: Partial<StatementsReportForm>) => void;
};

export const emptyStmtPair = (): StmtLookupPair => ({ code: "", name: "" });

export const todayIso = () => new Date().toISOString().slice(0, 10);

export function emptyStatementsForm(reportType = ""): StatementsReportForm {
  const today = todayIso();
  return {
    reportType,
    type: "Details",
    fromDate: today,
    toDate: today,
    customer: emptyStmtPair(),
    origin: emptyStmtPair(),
    serviceCenter: emptyStmtPair(),
    product: emptyStmtPair(),
    serviceType: emptyStmtPair(),
    vendor: emptyStmtPair(),
    destination: emptyStmtPair(),
    state: emptyStmtPair(),
    salesExecutive: emptyStmtPair(),
    paymentType: emptyStmtPair(),
    customerType: "",
    productType: "",
    businessChannel: "",
    status: "All",
    summary: "",
    obc: emptyStmtPair(),
    filterType: "All",
    obcReport: false,
    branchType: "All",
    vendorType: "",
    flightType: "",
    secondaryReportType: "",
    addToJobQueue: false,
  };
}

export function daysBetween(from: string, to: string): number {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}
