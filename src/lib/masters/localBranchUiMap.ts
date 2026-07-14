import type { LocalBranchRow } from "@/lib/masters/resources/localBranches";

export type LocalBranchCompanyDetails = {
  branchCode: string;
  companyName: string;
  name: string;
  address1: string;
  address2: string;
  pinCode: string;
  city: string;
  state: string;
  serviceCenter: string;
  telephone1: string;
  telephone2: string;
  fax: string;
  website: string;
  email: string;
  panNo: string;
  serviceTaxNo: string;
  billingState: string;
  billingStateCode: string;
  gstNo: string;
  service: string;
  registrationNo: string;
};

export type LocalBranchTerms = Record<string, string>;

export type LocalBranchBankDetails = {
  bankName: string;
  accountNo: string;
  accountName: string;
  bankAddress: string;
  ifsc: string;
  micr: string;
};

export type LocalBranchVoucher = {
  lastInvoiceNo: string;
  invoicePrefix: string;
  invoiceSuffix: string;
  lastFreeFormInvoiceNo: string;
  freeFormPrefix: string;
  freeFormSuffix: string;
  debitNotePrefix: string;
  debitNoteLastInvoiceNo: string;
  debitNoteSuffix: string;
  creditNotePrefix: string;
  creditNoteLastInvoiceNo: string;
  creditNoteSuffix: string;
  rcpLastNo: string;
};

export type LocalBranchFinYearRow = {
  id: string;
  finYear: string;
  fromDate: string;
  toDate: string;
};

export type LocalBranchFormState = {
  company: LocalBranchCompanyDetails;
  terms: LocalBranchTerms;
  bank: LocalBranchBankDetails;
  voucher: LocalBranchVoucher;
  finYears: LocalBranchFinYearRow[];
  companyLogo: string;
  signatoryLogo: string;
  stateId: string;
  billingStateId: string;
  branchId: string;
  serviceablePincodes: string[];
};

type Extras = Record<string, unknown>;

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function obj(v: unknown): Extras {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Extras) : {};
}

export function rowToLocalBranchForm(
  r: LocalBranchRow & Record<string, unknown>,
): LocalBranchFormState {
  const extras = obj(r.wizard_extras);
  const termsRaw = obj(extras.terms);
  const bankRaw = obj(extras.bank);
  const voucherRaw = obj(extras.voucher);
  const finYearsRaw = Array.isArray(extras.financial_years) ? extras.financial_years : [];

  return {
    company: {
      branchCode: r.code,
      companyName: str(extras.company_name),
      name: r.name,
      address1: r.address1 ?? "",
      address2: r.address2 ?? "",
      pinCode: r.pin_code ?? "",
      city: r.city ?? "",
      state: (r.state_name as string) ?? str(extras.state_label),
      serviceCenter: (r.branch_name as string) ?? str(extras.service_center_label),
      telephone1: r.phone ?? "",
      telephone2: str(extras.telephone2),
      fax: str(extras.fax),
      website: str(extras.website),
      email: r.email ?? "",
      panNo: str(extras.pan_no),
      serviceTaxNo: str(extras.service_tax_no),
      billingState: (r.billing_state_name as string) ?? str(extras.billing_state_label),
      billingStateCode: str(extras.billing_state_code),
      gstNo: r.gst_no ?? "",
      service: str(extras.service),
      registrationNo: str(extras.registration_no),
    },
    terms: Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`t${i + 1}`, str(termsRaw[`t${i + 1}`])]),
    ),
    bank: {
      bankName: str(bankRaw.bank_name),
      accountNo: str(bankRaw.account_no),
      accountName: str(bankRaw.account_name),
      bankAddress: str(bankRaw.bank_address),
      ifsc: str(bankRaw.ifsc),
      micr: str(bankRaw.micr),
    },
    voucher: {
      lastInvoiceNo: str(voucherRaw.last_invoice_no),
      invoicePrefix: str(voucherRaw.invoice_prefix),
      invoiceSuffix: str(voucherRaw.invoice_suffix),
      lastFreeFormInvoiceNo: str(voucherRaw.last_free_form_invoice_no),
      freeFormPrefix: str(voucherRaw.free_form_prefix),
      freeFormSuffix: str(voucherRaw.free_form_suffix),
      debitNotePrefix: str(voucherRaw.debit_note_prefix),
      debitNoteLastInvoiceNo: str(voucherRaw.debit_note_last_invoice_no),
      debitNoteSuffix: str(voucherRaw.debit_note_suffix),
      creditNotePrefix: str(voucherRaw.credit_note_prefix),
      creditNoteLastInvoiceNo: str(voucherRaw.credit_note_last_invoice_no),
      creditNoteSuffix: str(voucherRaw.credit_note_suffix),
      rcpLastNo: str(voucherRaw.rcp_last_no),
    },
    finYears: finYearsRaw.map((row, idx) => {
      const fy = obj(row);
      return {
        id: str(fy.id, String(idx + 1)),
        finYear: str(fy.fin_year),
        fromDate: str(fy.from_date),
        toDate: str(fy.to_date),
      };
    }),
    companyLogo: str(extras.company_logo),
    signatoryLogo: str(extras.signatory_logo),
    stateId: r.state_id ?? "",
    billingStateId: r.billing_state_id ?? "",
    branchId: r.branch_id ?? "",
    serviceablePincodes: Array.isArray(r.serviceable_pincodes) ? r.serviceable_pincodes : [],
  };
}

export function localBranchFormToPayload(form: LocalBranchFormState) {
  return {
    code: form.company.branchCode.trim(),
    name: form.company.name.trim(),
    branch_id: form.branchId || null,
    address1: form.company.address1 || null,
    address2: form.company.address2 || null,
    city: form.company.city || null,
    pin_code: form.company.pinCode || null,
    state_id: form.stateId || null,
    billing_state_id: form.billingStateId || null,
    gst_no: form.company.gstNo || null,
    phone: form.company.telephone1 || null,
    email: form.company.email || null,
    serviceable_pincodes: form.serviceablePincodes,
    wizard_extras: {
      company_name: form.company.companyName || null,
      telephone2: form.company.telephone2 || null,
      fax: form.company.fax || null,
      website: form.company.website || null,
      pan_no: form.company.panNo || null,
      service_tax_no: form.company.serviceTaxNo || null,
      billing_state_code: form.company.billingStateCode || null,
      billing_state_label: form.company.billingState || null,
      state_label: form.company.state || null,
      service_center_label: form.company.serviceCenter || null,
      service: form.company.service || null,
      registration_no: form.company.registrationNo || null,
      company_logo: form.companyLogo || null,
      signatory_logo: form.signatoryLogo || null,
      terms: form.terms,
      bank: {
        bank_name: form.bank.bankName || null,
        account_no: form.bank.accountNo || null,
        account_name: form.bank.accountName || null,
        bank_address: form.bank.bankAddress || null,
        ifsc: form.bank.ifsc || null,
        micr: form.bank.micr || null,
      },
      voucher: {
        last_invoice_no: form.voucher.lastInvoiceNo || null,
        invoice_prefix: form.voucher.invoicePrefix || null,
        invoice_suffix: form.voucher.invoiceSuffix || null,
        last_free_form_invoice_no: form.voucher.lastFreeFormInvoiceNo || null,
        free_form_prefix: form.voucher.freeFormPrefix || null,
        free_form_suffix: form.voucher.freeFormSuffix || null,
        debit_note_prefix: form.voucher.debitNotePrefix || null,
        debit_note_last_invoice_no: form.voucher.debitNoteLastInvoiceNo || null,
        debit_note_suffix: form.voucher.debitNoteSuffix || null,
        credit_note_prefix: form.voucher.creditNotePrefix || null,
        credit_note_last_invoice_no: form.voucher.creditNoteLastInvoiceNo || null,
        credit_note_suffix: form.voucher.creditNoteSuffix || null,
        rcp_last_no: form.voucher.rcpLastNo || null,
      },
      financial_years: form.finYears.map((fy) => ({
        id: fy.id,
        fin_year: fy.finYear,
        from_date: fy.fromDate,
        to_date: fy.toDate,
      })),
    },
    status: "ACTIVE" as const,
  };
}
