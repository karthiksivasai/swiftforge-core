/**
 * Maps shipment context → Xpresion-compatible Shipping API request body.
 * Kept inside adapters/xpresion — never imported by AWB Entry.
 */
import type { VendorShippingContext, VendorShippingCredentials } from "../../types";

function str(v: unknown, fallback = ""): string {
  if (v == null) return fallback;
  const s = String(v).trim();
  return s || fallback;
}

function num3(v: unknown, fallback = "0.000"): string {
  const n = typeof v === "number" ? v : Number.parseFloat(str(v));
  return Number.isFinite(n) ? n.toFixed(3) : fallback;
}

function party(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function extras(ship: Record<string, unknown>): Record<string, unknown> {
  const w = ship.wizard_extras;
  return w && typeof w === "object" ? (w as Record<string, unknown>) : {};
}

function proformaBlock(ship: Record<string, unknown>): Record<string, unknown> {
  const p = extras(ship).proforma;
  return p && typeof p === "object" ? (p as Record<string, unknown>) : {};
}

function kycBlock(ship: Record<string, unknown>): Record<string, unknown> {
  const k = extras(ship).kyc;
  return k && typeof k === "object" ? (k as Record<string, unknown>) : {};
}

export function mapContextToXpresionPayload(
  context: VendorShippingContext,
  credentials: VendorShippingCredentials,
  otp?: string | null,
): Record<string, unknown> {
  const ship = context.shipment;
  const shipper = party(ship.shipper);
  const consignee = party(ship.consignee);
  const proforma = proformaBlock(ship);
  const kyc = kycBlock(ship);
  const integ = context.integration;
  const product = str(ship.product_code).toUpperCase();

  let weightNum = Number.parseFloat(str(ship.charge_weight ?? ship.actual_weight, "0"));
  if (!Number.isFinite(weightNum) || weightNum <= 0) weightNum = 1;
  if (product.includes("MEDICINE") && weightNum < 0.5) weightNum = 0.5;
  const weight = num3(weightNum, "1.000");

  const shipperAdd1 = str(shipper.address1);
  const shipperAdd2 = str(shipper.address2, shipperAdd1 || ".");
  const consigneeAdd1 = str(consignee.address1);
  const consigneeAdd2 = str(consignee.address2, consigneeAdd1 || ".");

  const proformaLinesRaw = Array.isArray(proforma.lines) ? proforma.lines : [];
  const contentFromLines = proformaLinesRaw
    .map((line) => str((line as Record<string, unknown>).description))
    .filter(Boolean)
    .join(", ");
  const content = str(ship.content, contentFromLines || "GOODS");

  let shipmentValue = str(ship.shipment_value);
  if (!shipmentValue || shipmentValue === "0") {
    const sum = proformaLinesRaw.reduce((acc, line) => {
      const n = Number.parseFloat(str((line as Record<string, unknown>).amount, "0"));
      return acc + (Number.isFinite(n) ? n : 0);
    }, 0);
    if (sum > 0) shipmentValue = String(sum);
  }
  if (!shipmentValue) shipmentValue = "1";

  const dimensions = (context.pieces.length > 0 ? context.pieces : [{}]).map((p) => ({
    ActualWeight: num3(p.actual_weight_per_pc ?? ship.actual_weight, weight),
    Vol_WeightL: num3(p.length, "10.000"),
    Vol_WeightW: num3(p.breadth, "10.000"),
    Vol_WeightH: num3(p.height, "10.000"),
  }));

  const Performa =
    proformaLinesRaw.length > 0
      ? proformaLinesRaw.map((line, i) => {
          const l = line as Record<string, unknown>;
          return {
            BoxNo: str(l.boxNo ?? l.box_no, `Box-${i + 1}`),
            Description: str(l.description, content),
            HSNCode: str(l.hsCode ?? l.hsn_code, ""),
            Quantity: str(l.quantity, "1"),
            Unit: str(l.unit, "PCS"),
            Rate: str(l.rate, "0.00"),
            Amount: str(l.amount, "0.00"),
            Weight: num3(l.weight, "0.000"),
            PerformaIGST: str(l.igstPercent ?? l.igst_percent, "0"),
            PerformaIGSTAmount: str(l.igstAmount ?? l.igst_amount, "0"),
          };
        })
      : [
          {
            BoxNo: "Box-1",
            Description: content,
            HSNCode: "",
            Quantity: "1",
            Unit: "PCS",
            Rate: shipmentValue,
            Amount: shipmentValue,
            Weight: weight,
            PerformaIGST: "0",
            PerformaIGSTAmount: "0",
          },
        ];

  const bookDate = str(ship.book_date);
  const invoiceDate = str(proforma.invoiceDate ?? proforma.invoice_date ?? bookDate);
  const fmtDate = (d: string) => {
    if (!d) return "";
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) return d;
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return d;
  };

  const firstKyc = Array.isArray(kyc.documents)
    ? (kyc.documents[0] as Record<string, unknown> | undefined)
    : undefined;
  const docType = str(
    shipper.document_type ?? firstKyc?.entryType ?? firstKyc?.entry_type,
    "Aadhaar Number",
  );
  const docNo = str(shipper.document_no ?? firstKyc?.documentNo ?? firstKyc?.document_no);

  return {
    UserID: str(credentials.username),
    Password: str(credentials.password),
    CustomerCode: str(
      credentials.customerCode ?? integ?.customer_code ?? ship.customer_code,
    ),
    CustomerRefNo: str(ship.reference_no || ship.awb_no),
    OriginName: str(ship.origin_code ?? shipper.origin_code, ""),
    DestinationName: str(ship.destination_code ?? consignee.origin_code, ""),
    ShipperName: str(shipper.company_name || shipper.name),
    ShipperContact: str(shipper.contact_name),
    ShipperAdd1: shipperAdd1,
    ShipperAdd2: shipperAdd2,
    ShipperCity: str(shipper.city),
    ShipperState: str(shipper.state),
    ShipperPin: str(shipper.pincode ?? shipper.pin_code),
    ShipperTelno: str(shipper.telephone ?? shipper.tel),
    ShipperMobile: str(shipper.mobile ?? shipper.mobile_no),
    ShipperEmail: str(shipper.email),
    DocumentType: docType,
    DocumentNumber: docNo,
    ConsigneeName: str(consignee.company_name || consignee.name),
    ConsigneeContact: str(consignee.contact_name),
    ConsigneeAdd1: consigneeAdd1,
    ConsigneeAdd2: consigneeAdd2,
    ConsigneeCity: str(consignee.city),
    ConsigneeState: str(consignee.state),
    ConsigneePin: str(consignee.pincode ?? consignee.pin_code),
    ConsigneeTelno: str(consignee.telephone ?? consignee.tel),
    ConsigneeMobile: str(consignee.mobile ?? consignee.mobile_no),
    ConsigneeEmail: str(consignee.email),
    ConsigneeDocumentType: str(consignee.document_type, ""),
    ConsigneeDocumentNumber: str(consignee.document_no),
    Instruction: str(ship.instruction),
    VendorName: str(ship.vendor_code),
    ServiceName: str(ship.service),
    ProductCode: str(ship.product_code),
    Dox_Spx: str(ship.pieces_unit || ship.product_code, "SPX"),
    Pieces: str(ship.pieces, "1"),
    Weight: weight,
    Content: content,
    Currency: str(ship.currency, "INR"),
    ShipmentValue: shipmentValue,
    CODAmount: "0.00",
    CSBType: str(proforma.csbType ?? proforma.csb_type, "COMMERCIAL"),
    TermofInvoice: str(proforma.termOfInvoice ?? proforma.term_of_invoice, "CIF"),
    InvoiceNo: str(proforma.invoiceNo ?? proforma.invoice_no, str(ship.awb_no)),
    InvoiceDate: fmtDate(invoiceDate),
    CompanyCode: str(ship.vendor_code),
    IsCommercial: ship.is_commercial ? 1 : 0,
    OTP: str(otp),
    LSPType: "I",
    RequiredPerforma: "y",
    RequiredLable: "y",
    KYCDocumentType: docType,
    KYCImage: "",
    ImageType: "PDF",
    ExportReason: str(proforma.exportReason ?? proforma.export_reason, ""),
    KYCImage1: "",
    ImageType1: "PDF",
    EAWBNO: "",
    EAWBDate: "",
    EAWBExpDate: "",
    Dimensions: dimensions,
    Performa,
    additionalInfo: {
      discount: "0.00",
      Freight_Charges: "0.00",
      Insurance: "0.00",
      Other_charges: "0.00",
      SpecifyCharges: "0",
    },
    Buyerdetails: {
      DestinationCode: str(ship.destination_code),
      Name: str(consignee.company_name || consignee.name),
      Person: str(consignee.contact_name),
      Address1: consigneeAdd1,
      Address2: consigneeAdd2,
      PinCode: str(consignee.pincode ?? consignee.pin_code),
      City: str(consignee.city),
      State: str(consignee.state),
      Telephone: str(consignee.telephone),
      Mobile: str(consignee.mobile),
      Email: str(consignee.email),
      countryCode: str(consignee.country || ship.destination_code),
      IECNo: str(consignee.iec_no),
    },
    ManifestGstDetails: {
      GST_Invoice: proforma.gstInvoice || proforma.gst_invoice ? "1" : "0",
      LUTIGST: "N",
      TotalIGST: "0.00",
      BankADCode: "",
      BankAccount: "",
      BankIFSC: "",
      LUTNumber: "",
      ExchangeRate: "0.00",
      Firm: "NG",
      NFEI: "1",
      PayofIGST: "0",
      ECommerce: "0",
      MEISScheme: "0",
      Format: str(proforma.format, "C2C"),
      IECNo: str(shipper.iec_no),
      LUTIssueDate: "",
      LUTTillDate: "",
    },
  };
}

function unwrapXpresionBody(raw: Record<string, unknown>): Record<string, unknown> {
  const nested = raw.Response ?? raw.response ?? raw.Data ?? raw.data;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return { ...raw, ...(nested as Record<string, unknown>) };
  }
  return raw;
}

function xpresionErrorMessage(body: Record<string, unknown>, fallback: string): string {
  const errs = body.Error ?? body.Errors ?? body.errors;
  if (Array.isArray(errs)) {
    const parts = errs
      .map((e) => {
        if (!e || typeof e !== "object") return String(e ?? "").trim();
        const row = e as Record<string, unknown>;
        return str(row.Description ?? row.description ?? row.Message ?? row.message);
      })
      .filter(Boolean);
    if (parts.length) return parts.join("; ");
  }
  if (errs && typeof errs === "object" && !Array.isArray(errs)) {
    const row = errs as Record<string, unknown>;
    const one = str(row.Description ?? row.description ?? row.Message ?? row.message);
    if (one) return one;
  }
  return str(
    body.Message ?? body.message ?? body.APIError ?? body.apiError,
    fallback,
  );
}

export function parseXpresionResponse(raw: Record<string, unknown>): {
  success: boolean;
  otpRequired: boolean;
  message: string;
  awb?: string;
  forwardingNo?: string;
  refNo?: string;
  labelUrl?: string;
  pdfUrl?: string;
  performaUrl?: string;
  boxLabelUrl?: string;
  authorityLetterUrl?: string;
  vendorInvoiceUrl?: string;
  vendorAwbUrl?: string;
} {
  const body = unwrapXpresionBody(raw);
  const status = str(body.Status ?? body.status ?? body.APIStatus ?? body.apiStatus).toLowerCase();
  const code = str(body.ResponseCode ?? body.responseCode ?? body.ErrorCode ?? body.errorCode);
  const msg = xpresionErrorMessage(body, "Vendor booking failed");
  const combined = `${status} ${code} ${msg}`.toLowerCase();

  const otpRequired =
    combined.includes("otp") &&
    (combined.includes("required") ||
      combined.includes("sent") ||
      combined.includes("verify") ||
      code === "OTP" ||
      status === "otp");

  const failed =
    status === "fail" ||
    status === "failed" ||
    status === "error" ||
    code === "1" ||
    code === "td01" ||
    Boolean(msg && status === "fail");

  const success =
    !otpRequired &&
    !failed &&
    (status === "success" ||
      status === "ok" ||
      code === "0" ||
      code === "200" ||
      Boolean(str(body.AWBNo ?? body.awbNo ?? body.ForwardingNo ?? body.forwardingNo)));

  return {
    success,
    otpRequired,
    message: msg || (otpRequired ? "OTP verification required" : success ? "Booked" : "Booking failed"),
    awb: str(body.AWBNo ?? body.awbNo) || undefined,
    forwardingNo: str(body.ForwardingNo ?? body.forwardingNo) || undefined,
    refNo: str(body.RefNo ?? body.refNo) || undefined,
    labelUrl: str(body.Label ?? body.label ?? body.Pdfdownload ?? body.pdfdownload) || undefined,
    pdfUrl: str(body.Pdfdownload ?? body.pdfdownload) || undefined,
    performaUrl: str(body.Performa ?? body.performa) || undefined,
    boxLabelUrl: str(body.BoxLabel ?? body.boxLabel) || undefined,
    authorityLetterUrl:
      str(
        body.AuthorityLetter ??
          body.authorityLetter ??
          body.AuthorityLetterUrl ??
          body.authority_letter_url,
      ) || undefined,
    vendorInvoiceUrl:
      str(
        body.VendorInvoice ??
          body.vendorInvoice ??
          body.VendorInvoiceUrl ??
          body.vendor_invoice_url ??
          body.Performa ??
          body.performa,
      ) || undefined,
    vendorAwbUrl:
      str(body.VendorAwb ?? body.vendorAwb ?? body.VendorAwbUrl ?? body.vendor_awb_url ?? body.Pdfdownload) ||
      undefined,
  };
}
