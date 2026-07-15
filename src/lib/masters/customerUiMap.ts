/**
 * Maps between the Customer master UI wizard shape and DB / RPC payloads.
 */
import type {
  CustomerAddressInput,
  CustomerFuelSurchargeInput,
  CustomerKycDocumentInput,
  CustomerOtherChargeInput,
  CustomerVolumetricInput,
} from "@/lib/masters/schemas/customers";
import type {
  CustomerRow as CustomerDbRow,
  CustomerChildren,
  DbCustomerAddress,
} from "@/lib/masters/resources/customers";

type Status = "Active" | "In-Active";

export type UiCustomerRow = {
  id: string;
  code: string;
  branch: string;
  serviceCentre: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  status: Status;
  contractHead: string;
  personal: {
    code: string;
    name: string;
    contactPerson: string;
    address1: string;
    address2: string;
    pinCode: string;
    city: string;
    state: string;
    stateId: string;
    tel1: string;
    tel2: string;
    emailId: string;
    mobile: string;
    faxNo: string;
    customerBillingState: string;
    billingStateId: string;
    serviceCentre: string;
    serviceCenterId: string;
    startDate: string;
    status: Status;
    origin: string;
    gstNo: string;
    aadharNo: string;
    dobOnAadhar: string;
    passportNo: string;
    panNo: string;
    tanNo: string;
    invoiceFormat: string;
    customerType: string;
    registerType: string;
  };
  billing: {
    paymentType: string;
    billingType: string;
    creditLimit: string;
    creditDays: string;
    registrationNo: string;
    instructions: string;
    creditPercent: string;
    closingBalance: string;
    unbilledAmount: string;
    contractHead: string;
    ledgerHead: string;
    contractOrigin: string;
    businessChannel: string;
    iecNo: string;
    bankAdCode: string;
    bankAccount: string;
    bankIfsc: string;
    firm: string;
    lutNumber: string;
    lutIssueDate: string;
    lutTillDate: string;
    shipperType: string;
    nfei: boolean;
    fuelSurcharge: boolean;
    tax: boolean;
    noTariff: boolean;
    inclusiveTax: boolean;
    allowLoginWithOtp: boolean;
  };
  contract: Record<string, unknown>;
  other: Record<string, unknown>;
  notification: Record<string, unknown>;
  fuelSurcharges: unknown[];
  otherCharges: unknown[];
  volumetrics: unknown[];
  kyc: unknown[];
  addresses: {
    id: string;
    customer: string;
    contactType: string;
    fromDate: string;
    name: string;
    designation: string;
    email: string;
    mobile: string;
    landline: string;
    extension: string;
    address1: string;
    address2: string;
    address3: string;
    pinCode: string;
    city: string;
    state: string;
    stateId: string;
    country: string;
    countryId: string;
    remark: string;
    passportNo: string;
    aadharNo: string;
    gstNo: string;
    panNo: string;
    defaultShipper: boolean;
    iecNo: string;
    adCode: string;
    lutNo: string;
    kycFileName: string;
  }[];
  row_version?: number;
};

function uiStatus(s: string): Status {
  return s === "INACTIVE" ? "In-Active" : "Active";
}

function dbStatus(s: Status): "ACTIVE" | "INACTIVE" {
  return s === "In-Active" ? "INACTIVE" : "ACTIVE";
}

function uiCustomerType(t: string): string {
  const m: Record<string, string> = { CUSTOMER: "Customer", VENDOR: "Vendor", AGENT: "Agent" };
  return m[t] ?? "Customer";
}

function dbCustomerType(t: string): "CUSTOMER" | "VENDOR" | "AGENT" {
  const s = t.trim().toLowerCase();
  if (s === "vendor") return "VENDOR";
  if (s === "agent") return "AGENT";
  return "CUSTOMER";
}

export function dbCustomerToUi(
  r: CustomerDbRow & Record<string, unknown>,
  children: CustomerChildren | DbCustomerAddress[] = [],
): UiCustomerRow {
  const normalized: CustomerChildren = Array.isArray(children)
    ? {
        addresses: children,
        fuelSurcharges: [],
        otherCharges: [],
        volumetrics: [],
        kycDocuments: [],
      }
    : children;
  const extras = (r.wizard_extras ?? {}) as Record<string, unknown>;
  const serviceCentreName = (r.service_center_name as string) ?? "";
  return {
    id: r.id,
    code: r.code,
    branch: r.branch ?? "",
    serviceCentre: serviceCentreName,
    name: r.name,
    contact: r.contact_person ?? "",
    phone: r.phone ?? r.mobile,
    email: r.email ?? "",
    status: uiStatus(r.status),
    contractHead: r.contract_head ?? "",
    personal: {
      code: r.code,
      name: r.name,
      contactPerson: r.contact_person ?? "",
      address1: r.address1 ?? "",
      address2: r.address2 ?? "",
      pinCode: r.pin_code ?? "",
      city: r.city ?? "",
      state: (r.state_name as string) ?? "",
      stateId: r.state_id ?? "",
      tel1: r.tel1 ?? "",
      tel2: r.tel2 ?? "",
      emailId: r.email ?? "",
      mobile: r.mobile,
      faxNo: r.fax ?? "",
      customerBillingState: (r.billing_state_name as string) ?? "",
      billingStateId: r.billing_state_id ?? "",
      serviceCentre: serviceCentreName,
      serviceCenterId: r.service_center_id ?? "",
      startDate: r.start_date ?? "",
      status: uiStatus(r.status),
      origin: r.origin ?? "",
      gstNo: r.gst_no ?? "",
      aadharNo: r.aadhar_no ?? "",
      dobOnAadhar: r.dob_on_aadhar ?? "",
      passportNo: r.passport_no ?? "",
      panNo: r.pan_no ?? "",
      tanNo: r.tan_no ?? "",
      invoiceFormat: r.invoice_format ?? "",
      customerType: uiCustomerType(r.customer_type),
      registerType: r.register_type,
    },
    billing: {
      paymentType: r.payment_type ?? "Credit",
      billingType: r.billing_cycle ?? "",
      creditLimit: r.credit_limit != null ? String(r.credit_limit) : "",
      creditDays: r.credit_days != null ? String(r.credit_days) : "",
      registrationNo: r.registration_no ?? "",
      instructions: r.instructions ?? "",
      creditPercent: r.credit_alert_pct != null ? String(r.credit_alert_pct) : "",
      closingBalance: r.closing_balance != null ? String(r.closing_balance) : "0",
      unbilledAmount: r.unbilled_amount != null ? String(r.unbilled_amount) : "",
      contractHead: r.contract_head ?? "",
      ledgerHead: r.ledger_head ?? "",
      contractOrigin: r.contract_origin ?? "",
      businessChannel: r.business_channel ?? "",
      iecNo: r.iec_no ?? "",
      bankAdCode: r.bank_ad_code ?? "",
      bankAccount: r.bank_account ?? "",
      bankIfsc: r.bank_ifsc ?? "",
      firm: r.firm ?? "",
      lutNumber: r.lut_number ?? "",
      lutIssueDate: r.lut_issue_date ?? "",
      lutTillDate: r.lut_till_date ?? "",
      shipperType: r.shipper_type ?? "",
      nfei: r.nfei,
      fuelSurcharge: r.fuel_surcharge,
      tax: r.tax,
      noTariff: r.no_tariff,
      inclusiveTax: r.inclusive_tax,
      allowLoginWithOtp: r.allow_login_with_otp,
    },
    contract: (extras.contract as Record<string, unknown>) ?? { fileName: "" },
    other: (extras.other as Record<string, unknown>) ?? {},
    notification: (extras.notification as Record<string, unknown>) ?? {},
    fuelSurcharges: normalized.fuelSurcharges.map((f, i) => ({
      id: `fuel-${i}`,
      entryCode: f.entry_code ?? "",
      fromDate: f.from_date ?? "",
      toDate: f.to_date ?? "",
      vendor: f.vendor ?? "",
      product: f.product ?? "",
      destination: f.destination ?? "",
      percentage: f.percentage != null ? String(f.percentage) : "",
    })),
    otherCharges: normalized.otherCharges.map((o, i) => ({
      id: `oc-${i}`,
      chargeType: o.charge_type ?? "",
      fromDate: o.from_date ?? "",
      toDate: o.to_date ?? "",
      vendor: o.vendor ?? "",
      service: o.service ?? "",
      product: o.product ?? "",
      origin: o.origin ?? "",
      destination: o.destination ?? "",
      amount: o.amount != null ? String(o.amount) : "",
      minimumValue: o.minimum_value != null ? String(o.minimum_value) : "",
    })),
    volumetrics: normalized.volumetrics.map((v, i) => ({
      id: `vol-${i}`,
      customerName: r.name,
      product: v.product ?? "",
      vendor: v.vendor ?? "",
      service: v.service ?? "",
      cmDivide: v.cm_divisor != null ? String(v.cm_divisor) : "",
      inchDivide: v.inch_divisor != null ? String(v.inch_divisor) : "",
      cft: v.cft != null ? String(v.cft) : "",
    })),
    kyc: normalized.kycDocuments.map((k, i) => ({
      id: `kyc-${i}`,
      type: k.kyc_type,
      fileName: k.file_name ?? "",
    })),
    addresses: normalized.addresses.map((a, i) => ({
      id: `addr-${i}`,
      customer: r.name,
      contactType: a.contact_type ?? "",
      fromDate: a.from_date ?? "",
      name: a.name ?? "",
      designation: a.designation ?? "",
      email: a.email ?? "",
      mobile: a.mobile ?? "",
      landline: a.landline ?? "",
      extension: a.extension ?? "",
      address1: a.address1 ?? "",
      address2: a.address2 ?? "",
      address3: a.address3 ?? "",
      pinCode: a.pin_code ?? "",
      city: a.city ?? "",
      state: "",
      stateId: a.state_id ?? "",
      country: "",
      countryId: a.country_id ?? "",
      remark: a.remark ?? "",
      passportNo: a.passport_no ?? "",
      aadharNo: a.aadhar_no ?? "",
      gstNo: a.gst_no ?? "",
      panNo: a.pan_no ?? "",
      defaultShipper: a.is_default_shipper ?? false,
      iecNo: a.iec_no ?? "",
      adCode: a.ad_code ?? "",
      lutNo: a.lut_no ?? "",
      kycFileName: a.kyc_file_name ?? "",
    })),
    row_version: r.row_version,
  };
}

export function uiCustomerToSavePayload(form: UiCustomerRow) {
  const p = form.personal;
  const b = form.billing;
  const fields = {
    code: p.code || form.code,
    name: p.name || form.name,
    branch: form.branch || null,
    contact_person: p.contactPerson || form.contact || null,
    phone: p.mobile || p.tel1 || form.phone || null,
    email: p.emailId || form.email || null,
    mobile: p.mobile,
    contract_head: b.contractHead || form.contractHead || null,
    address1: p.address1 || null,
    address2: p.address2 || null,
    pin_code: p.pinCode || null,
    city: p.city || null,
    state_id: p.stateId || null,
    billing_state_id: p.billingStateId || null,
    tel1: p.tel1 || null,
    tel2: p.tel2 || null,
    fax: p.faxNo || null,
    service_center_id: p.serviceCenterId || null,
    start_date: p.startDate || null,
    origin: p.origin || null,
    gst_no: p.gstNo || null,
    aadhar_no: p.aadharNo || null,
    dob_on_aadhar: p.dobOnAadhar || null,
    passport_no: p.passportNo || null,
    pan_no: p.panNo || null,
    tan_no: p.tanNo || null,
    invoice_format: p.invoiceFormat || null,
    customer_type: dbCustomerType(p.customerType),
    register_type: p.registerType === "B2C" ? "B2C" : "B2B",
    payment_type: b.paymentType || null,
    billing_cycle: b.billingType || null,
    credit_limit: b.creditLimit || null,
    credit_days: b.creditDays || null,
    registration_no: b.registrationNo || null,
    instructions: b.instructions || null,
    credit_alert_pct: b.creditPercent || null,
    closing_balance: b.closingBalance || "0",
    unbilled_amount: b.unbilledAmount || null,
    ledger_head: b.ledgerHead || null,
    contract_origin: b.contractOrigin || null,
    business_channel: b.businessChannel || null,
    iec_no: b.iecNo || null,
    bank_ad_code: b.bankAdCode || null,
    bank_account: b.bankAccount || null,
    bank_ifsc: b.bankIfsc || null,
    firm: b.firm || null,
    lut_number: b.lutNumber || null,
    lut_issue_date: b.lutIssueDate || null,
    lut_till_date: b.lutTillDate || null,
    shipper_type: b.shipperType || null,
    nfei: b.nfei,
    fuel_surcharge: b.fuelSurcharge,
    tax: b.tax,
    no_tariff: b.noTariff,
    inclusive_tax: b.inclusiveTax,
    allow_login_with_otp: b.allowLoginWithOtp,
    status: dbStatus(p.status),
  };

  const addresses: CustomerAddressInput[] = form.addresses.map((a) => ({
    contact_type: a.contactType || null,
    from_date: a.fromDate || null,
    name: a.name || null,
    designation: a.designation || null,
    email: a.email || null,
    mobile: a.mobile || null,
    landline: a.landline || null,
    extension: a.extension || null,
    address1: a.address1 || null,
    address2: a.address2 || null,
    address3: a.address3 || null,
    pin_code: a.pinCode || null,
    city: a.city || null,
    state_id: a.stateId || null,
    country_id: a.countryId || null,
    remark: a.remark || null,
    passport_no: a.passportNo || null,
    aadhar_no: a.aadharNo || null,
    gst_no: a.gstNo || null,
    pan_no: a.panNo || null,
    iec_no: a.iecNo || null,
    ad_code: a.adCode || null,
    lut_no: a.lutNo || null,
    is_default_shipper: a.defaultShipper,
    kyc_file_name: a.kycFileName || null,
  }));

  const wizardExtras = {
    contract: form.contract,
    other: form.other,
    notification: form.notification,
  };

  const fuelSurcharges: CustomerFuelSurchargeInput[] = (
    form.fuelSurcharges as {
      entryCode?: string;
      fromDate?: string;
      toDate?: string;
      vendor?: string;
      product?: string;
      destination?: string;
      percentage?: string;
    }[]
  ).map((f) => ({
    entry_code: f.entryCode || null,
    from_date: f.fromDate || null,
    to_date: f.toDate || null,
    vendor: f.vendor || null,
    product: f.product || null,
    destination: f.destination || null,
    percentage: f.percentage ? Number(f.percentage) : null,
  }));

  const otherCharges: CustomerOtherChargeInput[] = (
    form.otherCharges as {
      chargeType?: string;
      fromDate?: string;
      toDate?: string;
      vendor?: string;
      service?: string;
      product?: string;
      origin?: string;
      destination?: string;
      amount?: string;
      minimumValue?: string;
    }[]
  ).map((o) => ({
    charge_type: o.chargeType || null,
    from_date: o.fromDate || null,
    to_date: o.toDate || null,
    vendor: o.vendor || null,
    service: o.service || null,
    product: o.product || null,
    origin: o.origin || null,
    destination: o.destination || null,
    amount: o.amount || null,
    minimum_value: o.minimumValue || null,
  }));

  const volumetrics: CustomerVolumetricInput[] = (
    form.volumetrics as {
      product?: string;
      vendor?: string;
      service?: string;
      cmDivide?: string;
      inchDivide?: string;
      cft?: string;
    }[]
  ).map((v) => ({
    product: v.product || null,
    vendor: v.vendor || null,
    service: v.service || null,
    cm_divisor: v.cmDivide || null,
    inch_divisor: v.inchDivide || null,
    cft: v.cft || null,
  }));

  const kycDocuments: CustomerKycDocumentInput[] = (
    form.kyc as { type?: string; fileName?: string }[]
  ).map((k) => ({
    kyc_type: k.type?.trim() || "OTHER",
    file_name: k.fileName || null,
  }));

  return {
    fields,
    addresses,
    wizardExtras,
    fuelSurcharges,
    otherCharges,
    volumetrics,
    kycDocuments,
  };
}
