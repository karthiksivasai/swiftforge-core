/**
 * Maps shipment context → Xpresion-compatible Shipping API request body.
 * Kept inside adapters/xpresion — never imported by AWB Entry.
 */
import type { VendorShippingContext, VendorShippingCredentials } from "../../types";

function str(v: unknown, fallback = ""): string {
  if (v == null) return fallback;
  return String(v).trim();
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

  const dimensions = (context.pieces.length > 0 ? context.pieces : [{}]).map((p) => ({
    ActualWeight: num3(p.actual_weight_per_pc ?? ship.actual_weight, "1.000"),
    Vol_WeightL: num3(p.length, "10.000"),
    Vol_WeightW: num3(p.breadth, "10.000"),
    Vol_WeightH: num3(p.height, "10.000"),
  }));

  const proformaLinesRaw = Array.isArray(proforma.lines) ? proforma.lines : [];
  const Performa =
    proformaLinesRaw.length > 0
      ? proformaLinesRaw.map((line, i) => {
          const l = line as Record<string, unknown>;
          return {
            BoxNo: str(l.boxNo ?? l.box_no, `Box-${i + 1}`),
            Description: str(l.description, str(ship.content, "GOODS")),
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
            Description: str(ship.content, "GOODS"),
            HSNCode: "",
            Quantity: "1",
            Unit: "PCS",
            Rate: str(ship.shipment_value, "0.00"),
            Amount: str(ship.shipment_value, "0.00"),
            Weight: num3(ship.charge_weight ?? ship.actual_weight, "0.000"),
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
    ShipperAdd1: str(shipper.address1),
    ShipperAdd2: str(shipper.address2),
    ShipperCity: str(shipper.city),
    ShipperState: str(shipper.state),
    ShipperPin: str(shipper.pincode ?? shipper.pin_code),
    ShipperTelno: str(shipper.telephone ?? shipper.tel),
    ShipperMobile: str(shipper.mobile ?? shipper.mobile_no),
    ShipperEmail: str(shipper.email),
    DocumentType: str(shipper.document_type, "Aadhaar Number"),
    DocumentNumber: str(shipper.document_no),
    ConsigneeName: str(consignee.company_name || consignee.name),
    ConsigneeContact: str(consignee.contact_name),
    ConsigneeAdd1: str(consignee.address1),
    ConsigneeAdd2: str(consignee.address2),
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
    Weight: num3(ship.charge_weight ?? ship.actual_weight, "1.000"),
    Content: str(ship.content),
    Currency: str(ship.currency, "INR"),
    ShipmentValue: str(ship.shipment_value, "0"),
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
    KYCDocumentType: str(
      (Array.isArray(kyc.documents) && (kyc.documents[0] as { entryType?: string })?.entryType) ||
        shipper.document_type,
      "Aadhaar Number",
    ),
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
      Address1: str(consignee.address1),
      Address2: str(consignee.address2),
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
} {
  const status = str(raw.Status ?? raw.status ?? raw.APIStatus ?? raw.apiStatus).toLowerCase();
  const code = str(raw.ResponseCode ?? raw.responseCode ?? raw.ErrorCode ?? raw.errorCode);
  const msg = str(
    raw.Message ?? raw.message ?? raw.APIError ?? raw.apiError ?? raw.Error ?? raw.error,
    "Vendor booking response received",
  );
  const combined = `${status} ${code} ${msg}`.toLowerCase();

  const otpRequired =
    combined.includes("otp") &&
    (combined.includes("required") ||
      combined.includes("sent") ||
      combined.includes("verify") ||
      code === "OTP" ||
      status === "otp");

  const success =
    !otpRequired &&
    (status === "success" ||
      status === "ok" ||
      code === "0" ||
      code === "200" ||
      Boolean(str(raw.AWBNo ?? raw.awbNo ?? raw.ForwardingNo ?? raw.forwardingNo)));

  return {
    success,
    otpRequired,
    message: msg || (otpRequired ? "OTP verification required" : success ? "Booked" : "Booking failed"),
    awb: str(raw.AWBNo ?? raw.awbNo) || undefined,
    forwardingNo: str(raw.ForwardingNo ?? raw.forwardingNo) || undefined,
    refNo: str(raw.RefNo ?? raw.refNo) || undefined,
    labelUrl: str(raw.Label ?? raw.label ?? raw.Pdfdownload ?? raw.pdfdownload) || undefined,
    pdfUrl: str(raw.Pdfdownload ?? raw.pdfdownload) || undefined,
    performaUrl: str(raw.Performa ?? raw.performa) || undefined,
    boxLabelUrl: str(raw.BoxLabel ?? raw.boxLabel) || undefined,
  };
}
