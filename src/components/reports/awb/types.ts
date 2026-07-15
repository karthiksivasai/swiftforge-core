/**
 * Shared form state for CourierWala AWB reports.
 */
export type AwbLookupPair = { code: string; name: string };

export type AwbReportForm = {
  reportType: string;
  type: string;
  reportFor: string;
  fromDate: string;
  toDate: string;
  customer: AwbLookupPair;
  origin: AwbLookupPair;
  serviceCenter: AwbLookupPair;
  product: AwbLookupPair;
  vendor: AwbLookupPair;
  serviceType: AwbLookupPair;
  destination: AwbLookupPair;
  paymentType: AwbLookupPair;
  contractHead: AwbLookupPair;
  awbNo: string;
  instruction: string;
  manifestNo: string;
  fromManifestNo: string;
  toManifestNo: string;
  invoiceNo: string;
  customerType: string;
  formatType: string;
  businessChannel: string;
  chargeType: string;
  productType: string;
  tax: string;
  lockType: string;
  registerType: string;
  billed: boolean;
  unBilled: boolean;
  summary: boolean;
  otherCharges: boolean;
  addToJobQueue: boolean;
};

export type AwbFilterProps = {
  value: AwbReportForm;
  onChange: (patch: Partial<AwbReportForm>) => void;
};

export const emptyAwbPair = (): AwbLookupPair => ({ code: "", name: "" });

export const todayIso = () => new Date().toISOString().slice(0, 10);

export function emptyAwbForm(reportType = ""): AwbReportForm {
  const today = todayIso();
  return {
    reportType,
    type: "",
    reportFor: "Customer",
    fromDate: today,
    toDate: today,
    customer: emptyAwbPair(),
    origin: emptyAwbPair(),
    serviceCenter: emptyAwbPair(),
    product: emptyAwbPair(),
    vendor: emptyAwbPair(),
    serviceType: emptyAwbPair(),
    destination: emptyAwbPair(),
    paymentType: emptyAwbPair(),
    contractHead: emptyAwbPair(),
    awbNo: "",
    instruction: "",
    manifestNo: "",
    fromManifestNo: "",
    toManifestNo: "",
    invoiceNo: "",
    customerType: "",
    formatType: "",
    businessChannel: "",
    chargeType: "All",
    productType: "",
    tax: "",
    lockType: "All",
    registerType: "",
    billed: false,
    unBilled: false,
    summary: false,
    otherCharges: false,
    addToJobQueue: false,
  };
}

export function daysBetween(from: string, to: string): number {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}
