/**
 * World-First (Xpresion) AWB Booking Integration Service
 * Client proxy & helper functions — credentials reside strictly on the server.
 *
 * Supported vendors:
 *   - WFT  → World-First Transport  (/api/shipping/world-first/book)
 *   - UPS  → United Parcel Service   (/api/shipping/ups/book)
 */

export type WfClientConfig = {
  serverEndpoint: string;
  vendorCode: string;
};

export type WfDimension = {
  ActualWeight: string;
  Vol_WeightL: string;
  Vol_WeightW: string;
  Vol_WeightH: string;
};

export type WfPerformaLine = {
  BoxNo: string;
  Description: string;
  HSNCode: string;
  Quantity: string;
  Unit: string;
  Rate: string;
  Amount: string;
  Weight: string;
  PerformaIGST: string;
  PerformaIGSTAmount: string;
};

export type WfBookingPayload = {
  UserID?: string;
  Password?: string;
  CustomerCode?: string;
  CustomerRefNo: string;
  OriginName: string;
  DestinationName: string;

  // Shipper block
  ShipperName: string;
  ShipperContact: string;
  ShipperAdd1: string;
  ShipperAdd2: string;
  ShipperCity: string;
  ShipperState: string;
  ShipperPin: string;
  ShipperTelno: string;
  ShipperMobile: string;
  ShipperEmail: string;
  DocumentType: string;
  DocumentNumber: string;

  // Consignee block
  ConsigneeName: string;
  ConsigneeContact: string;
  ConsigneeAdd1: string;
  ConsigneeAdd2: string;
  ConsigneeCity: string;
  ConsigneeState: string;
  ConsigneePin: string;
  ConsigneeTelno: string;
  ConsigneeMobile: string;
  ConsigneeEmail: string;
  ConsigneeDocumentType: string;
  ConsigneeDocumentNumber: string;

  // Shipment block
  VendorName: string;
  ServiceName: string;
  ProductCode: string;
  Dox_Spx: "DOX" | "SPX" | string;
  Pieces: string;
  Weight: string;
  Content: string;
  Currency: string;
  ShipmentValue: string;
  CODAmount: string;
  CSBType: "CSB4" | "CSB5" | string;
  TermofInvoice: string;
  InvoiceNo: string;
  InvoiceDate: string;
  CompanyCode: string;

  // Flags
  IsCommercial: boolean | string;
  OTP: string;
  LSPType: string;
  RequiredPerforma: "y" | "n" | string;
  RequiredLable: "y" | "n" | string;

  // KYC block
  KYCDocumentType: string;
  KYCImage: string;
  ImageType: string;
  KYCImage1: string;
  ImageType1: string;
  ExportReason: string;

  // EAWB block
  EAWBNO: string;
  EAWBDate: string;
  EAWBExpDate: string;

  // Arrays & Nested objects
  Dimensions: WfDimension[];
  Performa: WfPerformaLine[];
  additionalInfo: WfAdditionalInfo;
  Buyerdetails: WfBuyerDetails;
  ManifestGstDetails: WfManifestGstDetails;
  fedexSpecial: WfFedexSpecial;
  upsSpecial: WfUpsSpecial;

  [key: string]: unknown;
};

export type WfBookingResponse = {
  /** e.g. "RT01" (success) or "TD01" (fail) */
  ResponseCode?: string;
  Status?: string;
  ErrorCode?: string | number;
  Message?: string;
  APIStatus?: string;
  APIError?: string;
  AWBNo?: string;
  RefNo?: string;
  LabelFileType?: string;
  Pdfdownload?: string;
  Performa?: string;
  Label?: string;
  BoxLabel?: string;
  AuxLbl?: string;
  /** Structured validation errors returned by Xpresion */
  Error?: Array<{ Description?: string; [key: string]: unknown }>;
  [key: string]: unknown;
};

export type WfDecodedDocument = {
  docType: "SHIPPING_LABEL" | "VENDOR_INVOICE" | "BOX_LABEL" | "AUX_LABEL" | "VENDOR_AWB";
  label: string;
  mimeType: string;
  dataUrl: string;
  contentB64: string;
};

export type WfBookingResult = {
  success: boolean;
  awbNo?: string;
  refNo?: string;
  message: string;
  apiError?: string;
  apiStatus?: string;
  documents: WfDecodedDocument[];
  rawResponse?: WfBookingResponse;
  noResponse?: boolean;
};

// ---------------------------------------------------------------------------
// Nested object types
// ---------------------------------------------------------------------------

export type WfAdditionalInfo = {
  discount?: string;
  Freight_Charges?: string;
  Insurance?: string;
  Other_charges?: string;
  SpecifyCharges?: string;
  [key: string]: unknown;
};

export type WfBuyerDetails = {
  DestinationCode?: string;
  Name?: string;
  Person?: string;
  Address1?: string;
  Address2?: string;
  PinCode?: string;
  City?: string;
  State?: string;
  Telephone?: string;
  Mobile?: string;
  Email?: string;
  countryCode?: string;
  IECNo?: string;
  [key: string]: unknown;
};

export type WfManifestGstDetails = {
  GST_Invoice?: string;
  LUTIGST?: string;
  TotalIGST?: string;
  Format?: string;
  BankADCode?: string;
  BankAccount?: string;
  BankIFSC?: string;
  LUTNumber?: string;
  ExchangeRate?: string;
  Firm?: string;
  NFEI?: string;
  PayofIGST?: string;
  ECommerce?: string;
  MEISScheme?: string;
  IECNo?: string;
  LUTIssueDate?: string;
  LUTTillDate?: string;
  [key: string]: unknown;
};

/** FedEx-specific fields — leave as empty object {} for non-FedEx vendors */
export type WfFedexSpecial = {
  chkDangerousgd?: string;
  Dangergd?: string;
  chkDryIce?: string;
  Totalwt?: string;
  chkSatdelv?: string;
  satddil?: string;
  chkAlcohol?: string;
  AlcoholPck?: string;
  AlcoholCnt?: string;
  FdxBillShipmentTo?: string;
  ShipmentChargesAccountNo?: string;
  fdxPaidBy?: string;
  DutiesPaymentAccountNo?: string;
  bsobroker?: {
    chkBSOBroker?: string;
    bsobrokername?: string;
    bsocontactname?: string;
    country_code?: string;
    bso_address1?: string;
    bso_statecode?: string;
    bso_city?: string;
    bso_postalcode?: string;
    bso_phoneno?: string;
  };
  [key: string]: unknown;
};

/** UPS-specific fields — required when VendorName = "UPS" */
export type WfUpsSpecial = {
  /** "1" to enable declared-value insurance coverage, "" to disable */
  chkInsuCvrg?: string;
  /** Declared insurance value in the shipment currency */
  Insurance_value?: string;
  /** Account number to bill shipment charges to (leave blank = shipper account) */
  UPSBillShipmentTo?: string;
  /** UPS account number for shipment charges */
  UPSShipmentChargesAccountNo?: string;
  /** Postal code of the UPS billing account holder */
  UPSPostalCode?: string;
  /** Two-letter ISO country code of the UPS billing account holder */
  UPSCountryCode?: string;
  [key: string]: unknown;
};

/** Default empty UPS special block (all fields blank = shipper-account billing, no insurance) */
export const DEFAULT_UPS_SPECIAL: WfUpsSpecial = {
  chkInsuCvrg: "",
  Insurance_value: "",
  UPSBillShipmentTo: "",
  UPSShipmentChargesAccountNo: "",
  UPSPostalCode: "",
  UPSCountryCode: "",
};

/** Default empty FedEx special block (use when carrier is NOT FedEx) */
export const DEFAULT_FEDEX_SPECIAL: WfFedexSpecial = {};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ALLOWED_TERMS_OF_INVOICE = [
  "FOB",
  "CIF",
  "CFR",
  "DAT",
  "DDP",
  "EXW",
  "FCA",
  "CIP",
  "CPT",
  "DAP",
] as const;

/** Vendor code for World Freight Transportation */
export const DEFAULT_WF_VENDOR_CODE = "WFT";

/** Vendor code for United Parcel Service (UPS) via Xpresion */
export const UPS_VENDOR_CODE = "UPS";

/** Valid UPS service names accepted by the Xpresion API */
export const UPS_SERVICE_NAMES = [
  "WORLDWIDE EXPRESS SAVER",
  "WORLDWIDE EXPRESS",
  "WORLDWIDE EXPEDITED",
  "UPS STANDARD",
  "DOCUMENT",
] as const;

export type UpsServiceName = (typeof UPS_SERVICE_NAMES)[number];

// Idempotency registry for CustomerRefNo
const IN_FLIGHT_REFS = new Set<string>();
const COMPLETED_BOOKINGS = new Map<string, WfBookingResult>();

/** Reset idempotency cache (used for unit tests) */
export function clearWfIdempotencyState(): void {
  IN_FLIGHT_REFS.clear();
  COMPLETED_BOOKINGS.clear();
}

/** Get in-flight count for unit tests */
export function getWfInFlightCount(): number {
  return IN_FLIGHT_REFS.size;
}

/**
 * Get client configuration (contains NO credentials or secrets).
 */
export function getWfClientConfig(overrides?: Partial<WfClientConfig>): WfClientConfig {
  return {
    serverEndpoint: overrides?.serverEndpoint || "/api/shipping/world-first/book",
    vendorCode: overrides?.vendorCode || DEFAULT_WF_VENDOR_CODE,
  };
}

/**
 * Client-side validation before sending request to server endpoint.
 */
export function validateWfBookingRequest(payload: Partial<WfBookingPayload>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  const req = (field: keyof WfBookingPayload, label: string) => {
    const val = String(payload[field] ?? "").trim();
    if (!val) errors.push(`${label} is required`);
  };

  req("CustomerRefNo", "CustomerRefNo");
  req("OriginName", "OriginName");
  req("DestinationName", "DestinationName");
  req("ShipperName", "ShipperName");
  req("ShipperAdd1", "ShipperAdd1");
  req("ShipperCity", "ShipperCity");
  req("ShipperPin", "ShipperPin");
  req("ShipperTelno", "ShipperTelno");
  req("ConsigneeName", "ConsigneeName");
  req("ConsigneeAdd1", "ConsigneeAdd1");
  req("ConsigneeCity", "ConsigneeCity");
  req("ConsigneePin", "ConsigneePin");
  req("ConsigneeTelno", "ConsigneeTelno");
  req("VendorName", "VendorName");
  req("ServiceName", "ServiceName");
  req("ProductCode", "ProductCode");
  req("Dox_Spx", "Dox_Spx");
  req("Pieces", "Pieces");

  const doxSpx = String(payload.Dox_Spx || "").toUpperCase();
  if (doxSpx && doxSpx !== "DOX" && doxSpx !== "SPX") {
    errors.push('Dox_Spx must be "DOX" or "SPX"');
  }

  // Conditional validation when Dox_Spx = "SPX"
  if (doxSpx === "SPX") {
    req("DocumentType", "DocumentType (required for SPX)");
    req("DocumentNumber", "DocumentNumber (required for SPX)");
    req("Currency", "Currency (required for SPX)");
    req("ShipmentValue", "ShipmentValue (required for SPX)");
    req("InvoiceNo", "InvoiceNo (required for SPX)");
    req("InvoiceDate", "InvoiceDate (required for SPX)");
  }

  // CSBType validation
  if (payload.CSBType) {
    const csb = String(payload.CSBType).toUpperCase();
    if (csb !== "CSB4" && csb !== "CSB5") {
      errors.push('CSBType must be "CSB4" or "CSB5"');
    }
  }

  // TermofInvoice validation
  if (payload.TermofInvoice) {
    const term = String(payload.TermofInvoice).toUpperCase();
    if (!ALLOWED_TERMS_OF_INVOICE.includes(term as (typeof ALLOWED_TERMS_OF_INVOICE)[number])) {
      errors.push(`TermofInvoice must be one of: ${ALLOWED_TERMS_OF_INVOICE.join(", ")}`);
    }
  }

  // Numeric format validations
  if (payload.Pieces) {
    const pNum = Number.parseInt(String(payload.Pieces), 10);
    if (!Number.isFinite(pNum) || pNum <= 0) {
      errors.push("Pieces must be a positive integer");
    }
  }

  if (payload.Weight) {
    const wNum = Number.parseFloat(String(payload.Weight));
    if (!Number.isFinite(wNum) || wNum <= 0) {
      errors.push("Weight must be a positive number");
    } else if (wNum > 100) {
      errors.push("Weight exceeds maximum allowed 100 kg");
    }
  }

  if (Array.isArray(payload.Dimensions)) {
    payload.Dimensions.forEach((dim, idx) => {
      const act = Number.parseFloat(dim.ActualWeight);
      if (Number.isFinite(act) && act > 100) {
        errors.push(`Dimension [${idx + 1}] ActualWeight exceeds maximum allowed 100 kg`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function formatPieces3(pcs: string | number): string {
  const n = typeof pcs === "number" ? pcs : Number.parseInt(String(pcs).trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return "001";
  return String(n).padStart(3, "0");
}

export function formatNum3(val: string | number, fallback = "001.000"): string {
  const n = typeof val === "number" ? val : Number.parseFloat(String(val).replace(/,/g, "").trim());
  if (!Number.isFinite(n)) return fallback;
  return n.toFixed(3).padStart(7, "0");
}

/**
 * Map AWB Entry form data into World-First JSON payload (NO credentials injected on client).
 */
export function buildWfBookingPayload(
  form: Record<string, unknown>,
  overrides?: Partial<WfBookingPayload>,
  configOverrides?: Partial<WfClientConfig>,
): WfBookingPayload {
  const config = getWfClientConfig(configOverrides);

  const getStr = (obj: unknown, key: string, fallback = ""): string => {
    if (!obj || typeof obj !== "object") return fallback;
    const val = (obj as Record<string, unknown>)[key];
    if (val == null) return fallback;
    if (typeof val === "object" && !Array.isArray(val)) {
      const rec = val as Record<string, unknown>;
      if ("name" in rec && rec.name) return String(rec.name).trim() || fallback;
      if ("code" in rec && rec.code) return String(rec.code).trim() || fallback;
    }
    return String(val).trim() || fallback;
  };

  const shipper = (form.shipper && typeof form.shipper === "object" ? form.shipper : {}) as Record<string, unknown>;
  const consignee = (form.consignee && typeof form.consignee === "object" ? form.consignee : {}) as Record<string, unknown>;
  const forwarding = (form.forwarding && typeof form.forwarding === "object" ? form.forwarding : {}) as Record<string, unknown>;
  const servicePair = (form.service && typeof form.service === "object" ? form.service : {}) as Record<string, unknown>;
  const productPair = (form.product && typeof form.product === "object" ? form.product : {}) as Record<string, unknown>;
  const vendorPair = (form.vendor && typeof form.vendor === "object" ? form.vendor : {}) as Record<string, unknown>;

  const doxSpx = getStr(form, "doxSpx", getStr(form, "shipmentType", "SPX")).toUpperCase() as "DOX" | "SPX";
  const piecesVal = getStr(form, "totalPieces", getStr(form, "pieces", "1"));
  const weightVal = getStr(form, "chargeWeight", getStr(form, "actualWeight", "1.000"));

  const piecesLines = Array.isArray(form.piecesLines) ? form.piecesLines : [];
  const dimensions: WfDimension[] =
    piecesLines.length > 0
      ? piecesLines.map((p: Record<string, unknown>) => ({
          ActualWeight: formatNum3(getStr(p, "actualWeight", weightVal)),
          Vol_WeightL: formatNum3(getStr(p, "length", "10.000")),
          Vol_WeightW: formatNum3(getStr(p, "breadth", "10.000")),
          Vol_WeightH: formatNum3(getStr(p, "height", "10.000")),
        }))
      : [
          {
            ActualWeight: formatNum3(weightVal),
            Vol_WeightL: "010.000",
            Vol_WeightW: "010.000",
            Vol_WeightH: "010.000",
          },
        ];

  const performaLinesRaw = Array.isArray(form.proformaLines) ? form.proformaLines : [];
  const contentVal = getStr(form, "content", getStr(form, "description", "GOODS"));
  const shipmentVal = getStr(form, "shipmentValue", getStr(form, "invoiceValue", "1.00"));

  const performa: WfPerformaLine[] =
    performaLinesRaw.length > 0
      ? performaLinesRaw.map((line: Record<string, unknown>, idx: number) => ({
          BoxNo: getStr(line, "boxNo", `Box-${idx + 1}`),
          Description: getStr(line, "description", contentVal),
          HSNCode: getStr(line, "hsnCode", getStr(line, "hsCode", "")),
          Quantity: getStr(line, "quantity", "1"),
          Unit: getStr(line, "unit", "PCS"),
          Rate: getStr(line, "rate", "1.00"),
          Amount: getStr(line, "amount", "1.00"),
          Weight: formatNum3(getStr(line, "weight", "1.000")),
          PerformaIGST: getStr(line, "igstPercent", "0"),
          PerformaIGSTAmount: getStr(line, "igstAmount", "0"),
        }))
      : [
          {
            BoxNo: "Box-1",
            Description: contentVal,
            HSNCode: "",
            Quantity: "1",
            Unit: "PCS",
            Rate: shipmentVal,
            Amount: shipmentVal,
            Weight: formatNum3(weightVal),
            PerformaIGST: "0",
            PerformaIGSTAmount: "0",
          },
        ];

  const customerRefNo =
    getStr(form, "bookingRef", "") ||
    getStr(form, "referenceNo", "") ||
    getStr(form, "awbNo", "") ||
    `REF-${Date.now()}`;

  const payload: WfBookingPayload = {
    CustomerRefNo: customerRefNo,
    OriginName: getStr(shipper, "originCity", getStr(form, "originBranch", "HYD")),
    DestinationName: getStr(consignee, "destinationCode", getStr(form, "destination", "US")),

    // Shipper block
    ShipperName: getStr(shipper, "companyName", getStr(shipper, "contactName", "Shipper")),
    ShipperContact: getStr(shipper, "contactName", "Shipper Contact"),
    ShipperAdd1: getStr(shipper, "address1", "Address 1"),
    ShipperAdd2: getStr(shipper, "address2", "Address 2"),
    ShipperCity: getStr(shipper, "city", "HYDERABAD"),
    ShipperState: getStr(shipper, "state", "TELANGANA"),
    ShipperPin: getStr(shipper, "pincode", "500001"),
    ShipperTelno: getStr(shipper, "telephone", getStr(shipper, "mobileNo", "9999999999")),
    ShipperMobile: getStr(shipper, "mobileNo", "9999999999"),
    ShipperEmail: getStr(shipper, "email", "shipper@example.com"),
    DocumentType: getStr(shipper, "documentType", "GSTIN"),
    DocumentNumber: getStr(shipper, "documentNo", "36AAAAA0000A1Z5"),

    // Consignee block
    ConsigneeName: getStr(consignee, "companyName", getStr(consignee, "contactName", "Consignee")),
    ConsigneeContact: getStr(consignee, "contactName", "Consignee Contact"),
    ConsigneeAdd1: getStr(consignee, "address1", "Address Line 1"),
    ConsigneeAdd2: getStr(consignee, "address2", "Address Line 2"),
    ConsigneeCity: getStr(consignee, "city", "NEW YORK"),
    ConsigneeState: getStr(consignee, "state", "NY"),
    ConsigneePin: getStr(consignee, "pincode", "10001"),
    ConsigneeTelno: getStr(consignee, "telephone", getStr(consignee, "mobileNo", "18005550199")),
    ConsigneeMobile: getStr(consignee, "mobileNo", "18005550199"),
    ConsigneeEmail: getStr(consignee, "email", "consignee@example.com"),
    ConsigneeDocumentType: getStr(consignee, "documentType", ""),
    ConsigneeDocumentNumber: getStr(consignee, "documentNo", ""),

    // Shipment block — VendorName defaults to WFT
    VendorName: config.vendorCode || getStr(vendorPair, "code", DEFAULT_WF_VENDOR_CODE),
    ServiceName: getStr(servicePair, "code", getStr(servicePair, "name", "EXPRESS")),
    ProductCode: getStr(productPair, "code", getStr(productPair, "name", "SPX")),
    Dox_Spx: doxSpx,
    Pieces: formatPieces3(piecesVal),
    Weight: formatNum3(weightVal),
    Content: contentVal,
    Currency: getStr(form, "currency", "USD"),
    ShipmentValue: shipmentVal,
    CODAmount: getStr(form, "codAmount", "0.00"),
    CSBType: (getStr(form, "csbType", "CSB5").toUpperCase() as "CSB4" | "CSB5"),
    TermofInvoice: getStr(form, "termOfInvoice", "FOB").toUpperCase(),
    InvoiceNo: getStr(form, "invoiceNo", `INV-${Date.now()}`),
    InvoiceDate: getStr(form, "invoiceDate", new Date().toISOString().slice(0, 10)),
    CompanyCode: getStr(form, "companyCode", "SWIFT"),

    // Flags
    IsCommercial: Boolean(form.isCommercial ?? true),
    OTP: getStr(form, "otp", ""),
    LSPType: getStr(form, "lspType", ""),
    RequiredPerforma: getStr(form, "requiredPerforma", "y") as "y" | "n",
    RequiredLable: getStr(form, "requiredLabel", "y") as "y" | "n",

    // KYC block
    KYCDocumentType: getStr(form, "kycDocumentType", ""),
    KYCImage: getStr(form, "kycImage", ""),
    ImageType: getStr(form, "imageType", "pdf"),
    KYCImage1: getStr(form, "kycImage1", ""),
    ImageType1: getStr(form, "imageType1", ""),
    ExportReason: getStr(form, "exportReason", "COMMERCIAL"),

    // EAWB block
    EAWBNO: getStr(forwarding, "eawbNo", ""),
    EAWBDate: getStr(forwarding, "eawbDate", ""),
    EAWBExpDate: getStr(forwarding, "eawbExpDate", ""),

    // Arrays & Nested objects
    Dimensions: dimensions,
    Performa: performa,
    additionalInfo: {},
    Buyerdetails: {},
    ManifestGstDetails: {},
    fedexSpecial: DEFAULT_FEDEX_SPECIAL,
    upsSpecial: DEFAULT_UPS_SPECIAL,

    ...(overrides || {}),
  };

  return payload;
}

export function decodeWfResponseDocuments(resp: WfBookingResponse): WfDecodedDocument[] {
  const docs: WfDecodedDocument[] = [];
  const fileType = (resp.LabelFileType || "pdf").toLowerCase();
  const mimeType = fileType === "pdf" ? "application/pdf" : `image/${fileType}`;

  const addDoc = (
    b64: string | undefined,
    docType: WfDecodedDocument["docType"],
    label: string,
  ) => {
    if (!b64 || typeof b64 !== "string") return;
    const cleanB64 = b64.replace(/^data:[^;]+;base64,/, "").trim();
    if (!cleanB64) return;
    docs.push({
      docType,
      label,
      mimeType,
      dataUrl: `data:${mimeType};base64,${cleanB64}`,
      contentB64: cleanB64,
    });
  };

  addDoc(resp.Label || resp.Pdfdownload, "SHIPPING_LABEL", "Shipping Label");
  addDoc(resp.Performa, "VENDOR_INVOICE", "Performa Invoice");
  addDoc(resp.BoxLabel, "BOX_LABEL", "Box Label");
  addDoc(resp.AuxLbl, "AUX_LABEL", "Auxiliary Label");

  return docs;
}

export function parseWfBookingResponse(data: WfBookingResponse): WfBookingResult {
  const status = String(data?.Status || "").trim();
  const errorCode = String(data?.ErrorCode ?? "").trim();

  const isSuccess =
    status.toLowerCase() === "success" && (errorCode === "0" || errorCode === "");

  const documents = isSuccess ? decodeWfResponseDocuments(data) : [];

  if (isSuccess) {
    return {
      success: true,
      awbNo: String(data.AWBNo || data.RefNo || "").trim(),
      refNo: String(data.RefNo || "").trim(),
      message: String(data.Message || "World-First AWB booking successful").trim(),
      documents,
      rawResponse: data,
    };
  }

  const apiError = String(data?.APIError || data?.Message || "World-First AWB booking failed").trim();
  const apiStatus = String(data?.APIStatus || data?.Status || "FAILED").trim();

  return {
    success: false,
    message: apiError,
    apiError,
    apiStatus,
    documents: [],
    rawResponse: data,
  };
}

/**
 * Call World-First AWB booking API via server API endpoint (/api/shipping/world-first/book).
 * Includes:
 * 1. CustomerRefNo idempotency guard (blocks duplicate active/completed submissions).
 * 2. Network-only retry (max 1 retry ONLY when NO HTTP response was received; NEVER retries HTTP responses).
 */
export async function callWorldFirstBookingApi(
  payload: WfBookingPayload,
  configOverrides?: Partial<WfClientConfig>,
): Promise<WfBookingResult> {
  const config = getWfClientConfig(configOverrides);
  const refNo = payload.CustomerRefNo;

  // 1. Idempotency check: if already completed, return existing result without calling server/WF
  if (refNo && COMPLETED_BOOKINGS.has(refNo)) {
    return COMPLETED_BOOKINGS.get(refNo)!;
  }

  // 2. Idempotency check: if currently in-flight, block duplicate call
  if (refNo && IN_FLIGHT_REFS.has(refNo)) {
    return {
      success: false,
      message: `A booking request for CustomerRefNo "${refNo}" is currently in-flight. Resubmission blocked.`,
      apiError: "Duplicate in-flight CustomerRefNo",
      apiStatus: "IDEMPOTENCY_BLOCKED",
      documents: [],
      noResponse: false,
    };
  }

  // Validate payload first
  const validation = validateWfBookingRequest(payload);
  if (!validation.valid) {
    return {
      success: false,
      message: `Validation failed: ${validation.errors.join("; ")}`,
      apiError: validation.errors.join("; "),
      apiStatus: "CLIENT_VALIDATION_ERROR",
      documents: [],
      noResponse: false,
    };
  }

  if (refNo) IN_FLIGHT_REFS.add(refNo);

  const executeCall = async (attempt: number): Promise<WfBookingResult> => {
    try {
      const authHeaders =
        typeof window === "undefined"
          ? {}
          : await (await import("@/lib/security/authorized-fetch")).browserAuthHeaders();
      const res = await fetch(config.serverEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        // An HTTP response WAS received from server -> DO NOT RETRY
        return {
          success: false,
          message: `Server HTTP ${res.status}: ${res.statusText}`,
          apiError: text || `HTTP ${res.status}`,
          apiStatus: `HTTP_${res.status}`,
          documents: [],
          noResponse: false,
        };
      }

      const result = (await res.json()) as WfBookingResult;
      // Result returned from server endpoint
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Client network error reaching server endpoint (NO response received)
      return {
        success: false,
        message: `Network error reaching server: ${msg}`,
        apiError: msg,
        apiStatus: "NETWORK_ERROR",
        documents: [],
        noResponse: true, // NO HTTP response was received
      };
    }
  };

  try {
    let outcome = await executeCall(1);

    // PROBLEM 3: Only retry when NO response was received (noResponse === true).
    // NEVER retry after an HTTP response is returned (even if 4xx/5xx).
    if (!outcome.success && outcome.noResponse === true) {
      console.warn(`[World-First Integration] Attempt 1 failed with no response. Retrying (attempt 2)...`);
      await new Promise((r) => setTimeout(r, 1000));
      outcome = await executeCall(2);
    }

    if (outcome.success && refNo) {
      COMPLETED_BOOKINGS.set(refNo, outcome);
    }

    return outcome;
  } finally {
    if (refNo) IN_FLIGHT_REFS.delete(refNo);
  }
}

// ---------------------------------------------------------------------------
// UPS-specific helpers
// ---------------------------------------------------------------------------

export type UpsClientConfig = WfClientConfig;

/**
 * Get UPS client configuration (NO credentials – server-side only).
 */
export function getUpsClientConfig(overrides?: Partial<UpsClientConfig>): UpsClientConfig {
  return {
    serverEndpoint: overrides?.serverEndpoint || "/api/shipping/ups/book",
    vendorCode: overrides?.vendorCode || UPS_VENDOR_CODE,
  };
}

/**
 * Build a fully-typed UPS AWB booking payload from form/shipment data.
 *
 * This is a thin wrapper around `buildWfBookingPayload` that:
 * 1. Forces VendorName = "UPS"
 * 2. Populates the upsSpecial block from `upsOptions`
 * 3. Clears fedexSpecial (empty object – UPS bookings must not include FedEx fields)
 *
 * @example
 * ```ts
 * const payload = buildUpsBookingPayload(formData, {
 *   serviceName: "WORLDWIDE EXPRESS SAVER",
 *   upsOptions: { chkInsuCvrg: "1", Insurance_value: "500" },
 * });
 * const result = await callWorldFirstBookingApi(payload, getUpsClientConfig());
 * ```
 */
export function buildUpsBookingPayload(
  form: Record<string, unknown>,
  options?: {
    /** UPS service name – defaults to "WORLDWIDE EXPRESS SAVER" */
    serviceName?: UpsServiceName | string;
    /** Override individual UPS-specific billing/insurance fields */
    upsOptions?: Partial<WfUpsSpecial>;
    /** Any additional top-level payload overrides */
    overrides?: Partial<WfBookingPayload>;
  },
): WfBookingPayload {
  const serviceName = options?.serviceName ?? "WORLDWIDE EXPRESS SAVER";
  const upsSpecial: WfUpsSpecial = {
    ...DEFAULT_UPS_SPECIAL,
    ...(options?.upsOptions ?? {}),
  };

  return buildWfBookingPayload(
    form,
    {
      VendorName: UPS_VENDOR_CODE,
      ServiceName: serviceName,
      fedexSpecial: DEFAULT_FEDEX_SPECIAL,
      upsSpecial,
      ...(options?.overrides ?? {}),
    },
    { serverEndpoint: "/api/shipping/ups/book", vendorCode: UPS_VENDOR_CODE },
  );
}
