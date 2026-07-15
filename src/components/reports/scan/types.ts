/**
 * Shared form state for CourierWala Scan reports.
 */
export type ScanLookupPair = { code: string; name: string };

export type ScanReportForm = {
  reportType: string;
  fromManifestDate: string;
  toManifestDate: string;
  fromDate: string;
  toDate: string;
  fromBookingDate: string;
  toBookingDate: string;
  manifestNo: string;
  bagNo: string;
  serviceCenter: ScanLookupPair;
  serviceType: ScanLookupPair;
  origin: ScanLookupPair;
  destination: ScanLookupPair;
  customer: ScanLookupPair;
  vendor: ScanLookupPair;
  forwardingVendor: ScanLookupPair;
  product: ScanLookupPair;
  exception: ScanLookupPair;
  status: string;
  formatType: string;
  csbType: string;
  awbNo: string;
  forwardingNo: string;
  invoiceNo: string;
  originalShipper: boolean;
  withClubAwbNo: boolean;
  type: string;
  addToJobQueue: boolean;
};

export type ScanFilterProps = {
  value: ScanReportForm;
  onChange: (patch: Partial<ScanReportForm>) => void;
};

export const emptyScanPair = (): ScanLookupPair => ({ code: "", name: "" });

export const todayIso = () => new Date().toISOString().slice(0, 10);

export function emptyScanForm(reportType = ""): ScanReportForm {
  const today = todayIso();
  return {
    reportType,
    fromManifestDate: today,
    toManifestDate: today,
    fromDate: today,
    toDate: today,
    fromBookingDate: today,
    toBookingDate: today,
    manifestNo: "",
    bagNo: "",
    serviceCenter: emptyScanPair(),
    serviceType: emptyScanPair(),
    origin: emptyScanPair(),
    destination: emptyScanPair(),
    customer: emptyScanPair(),
    vendor: emptyScanPair(),
    forwardingVendor: emptyScanPair(),
    product: emptyScanPair(),
    exception: emptyScanPair(),
    status: "All",
    formatType: "",
    csbType: "",
    awbNo: "",
    forwardingNo: "",
    invoiceNo: "",
    originalShipper: false,
    withClubAwbNo: false,
    type: "AWB No.",
    addToJobQueue: false,
  };
}

export function daysBetween(from: string, to: string): number {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}
