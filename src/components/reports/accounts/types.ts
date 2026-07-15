/**
 * Shared form state for CourierWala Accounts (AR) reports.
 */
export type ArLookupPair = { code: string; name: string };

export type AccountsReportForm = {
  reportType: string;
  fromDate: string;
  toDate: string;
  customer: ArLookupPair;
  serviceCenter: ArLookupPair;
  salesExecutive: ArLookupPair;
  fieldExecutive: ArLookupPair;
  type: string;
  transactionType: string;
  asOnDate: boolean;
  withZero: boolean;
  addToJobQueue: boolean;
};

export type ArFilterProps = {
  value: AccountsReportForm;
  onChange: (patch: Partial<AccountsReportForm>) => void;
};

export const emptyArPair = (): ArLookupPair => ({ code: "", name: "" });

export const todayIso = () => new Date().toISOString().slice(0, 10);

export function emptyAccountsForm(reportType = ""): AccountsReportForm {
  const today = todayIso();
  return {
    reportType,
    fromDate: today,
    toDate: today,
    customer: emptyArPair(),
    serviceCenter: emptyArPair(),
    salesExecutive: emptyArPair(),
    fieldExecutive: emptyArPair(),
    type: "Details",
    transactionType: "",
    asOnDate: false,
    withZero: false,
    addToJobQueue: false,
  };
}

export function daysBetween(from: string, to: string): number {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}
