// deno-lint-ignore-file
/// <reference path="../shim.d.ts" />

/**
 * Provider-agnostic Vendor Shipping Edge Function.
 * Resolves tenant integration secrets (service role) and dispatches to the
 * matching adapter (XPRESION, POSTSHIPPING / DTDC, etc.).
 * AWB Entry never calls provider APIs directly in production.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const DEFAULT_XPRESION_ENDPOINT =
  "https://xpresion.courierwalaexpress.in/api/v1/Awbentry/Awbentry";
const DEFAULT_POSTSHIPPING_ENDPOINT =
  "https://api.postshipping.com/api2/shipments";

type Json = Record<string, unknown>;

function str(v: unknown, fallback = ""): string {
  if (v == null) return fallback;
  const s = String(v).trim();
  return s || fallback;
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number.parseFloat(str(v));
  return Number.isFinite(n) ? n : fallback;
}

function num3(v: unknown, fallback = "0.000"): string {
  const n = typeof v === "number" ? v : Number.parseFloat(str(v));
  return Number.isFinite(n) ? n.toFixed(3) : fallback;
}

function asJson(v: unknown): Json {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {};
}

function fmtDate(d: string): string {
  if (!d) return "";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) return d;
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return d;
}

function normalizeCountryCode(country: unknown, fallback = "IN"): string {
  const c = str(country).toUpperCase();
  if (!c) return fallback;
  if (c.length === 2) return c;
  if (c === "INDIA") return "IN";
  if (c === "AUSTRALIA") return "AU";
  if (c === "NEW ZEALAND") return "NZ";
  return c.slice(0, 2);
}

/** Build full Xpresion Awbentry body from shipment context + secrets. */
function buildXpresionPayload(
  ship: Json,
  pieces: unknown[],
  creds: { username: string; password: string; customerCode: string },
  otp: string,
): Json {
  const shipper = asJson(ship.shipper);
  const consignee = asJson(ship.consignee);
  const extras = asJson(ship.wizard_extras);
  const proforma = asJson(extras.proforma);
  const kyc = asJson(extras.kyc);
  const product = str(ship.product_code).toUpperCase();

  let weight = Number.parseFloat(str(ship.charge_weight ?? ship.actual_weight, "0"));
  if (!Number.isFinite(weight) || weight <= 0) weight = 1;
  if (product.includes("MEDICINE") && weight < 0.5) weight = 0.5;

  const addr1 = str(shipper.address1);
  const addr2 = str(shipper.address2, addr1 || ".");

  const proformaLines = Array.isArray(proforma.lines) ? proforma.lines : [];
  const contentFromLines = proformaLines
    .map((l) => str(asJson(l).description))
    .filter(Boolean)
    .join(", ");
  const content = str(ship.content, contentFromLines || "GOODS");

  let shipmentValue = str(ship.shipment_value);
  if (!shipmentValue || shipmentValue === "0") {
    const sum = proformaLines.reduce((acc, line) => {
      const n = Number.parseFloat(str(asJson(line).amount, "0"));
      return acc + (Number.isFinite(n) ? n : 0);
    }, 0);
    if (sum > 0) shipmentValue = String(sum);
  }
  if (!shipmentValue) shipmentValue = "1";

  const invoiceNo = str(
    proforma.invoiceNo ?? proforma.invoice_no,
    str(ship.awb_no, "INV"),
  );
  const bookDate = str(ship.book_date);
  const invoiceDate = fmtDate(
    str(proforma.invoiceDate ?? proforma.invoice_date ?? bookDate),
  );

  const dimsSource = Array.isArray(pieces) && pieces.length > 0 ? pieces : [{}];
  const Dimensions = dimsSource.map((p) => {
    const row = asJson(p);
    return {
      ActualWeight: num3(row.actual_weight_per_pc ?? ship.actual_weight, num3(weight)),
      Vol_WeightL: num3(row.length, "10.000"),
      Vol_WeightW: num3(row.breadth, "10.000"),
      Vol_WeightH: num3(row.height, "10.000"),
    };
  });

  const Performa =
    proformaLines.length > 0
      ? proformaLines.map((line, i) => {
          const l = asJson(line);
          return {
            BoxNo: str(l.boxNo ?? l.box_no, `Box-${i + 1}`),
            Description: str(l.description, content),
            HSNCode: str(l.hsCode ?? l.hsn_code),
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
            Weight: num3(weight),
            PerformaIGST: "0",
            PerformaIGSTAmount: "0",
          },
        ];

  const kycDocs = Array.isArray(kyc.documents) ? kyc.documents : [];
  const firstKyc = asJson(kycDocs[0]);
  const docType = str(
    shipper.document_type ?? firstKyc.entryType ?? firstKyc.entry_type,
    "Aadhaar Number",
  );
  const docNo = str(shipper.document_no ?? firstKyc.documentNo ?? firstKyc.document_no);

  return {
    UserID: creds.username,
    Password: creds.password,
    CustomerCode: creds.customerCode,
    CustomerRefNo: str(ship.reference_no || ship.awb_no),
    OriginName: str(ship.origin_code ?? shipper.origin_code),
    DestinationName: str(ship.destination_code ?? consignee.origin_code),
    ShipperName: str(shipper.company_name || shipper.name),
    ShipperContact: str(shipper.contact_name),
    ShipperAdd1: addr1,
    ShipperAdd2: addr2,
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
    ConsigneeAdd1: str(consignee.address1),
    ConsigneeAdd2: str(consignee.address2, str(consignee.address1, ".")),
    ConsigneeCity: str(consignee.city),
    ConsigneeState: str(consignee.state),
    ConsigneePin: str(consignee.pincode ?? consignee.pin_code),
    ConsigneeTelno: str(consignee.telephone ?? consignee.tel),
    ConsigneeMobile: str(consignee.mobile ?? consignee.mobile_no),
    ConsigneeEmail: str(consignee.email),
    ConsigneeDocumentType: str(consignee.document_type),
    ConsigneeDocumentNumber: str(consignee.document_no),
    Instruction: str(ship.instruction),
    VendorName: str(ship.vendor_code),
    ServiceName: str(ship.service),
    ProductCode: str(ship.product_code),
    Dox_Spx: str(ship.pieces_unit || ship.product_code, "SPX"),
    Pieces: str(ship.pieces, "1"),
    Weight: num3(weight, "1.000"),
    Content: content,
    Currency: str(ship.currency, "INR"),
    ShipmentValue: shipmentValue,
    CODAmount: "0.00",
    CSBType: str(proforma.csbType ?? proforma.csb_type, "COMMERCIAL"),
    TermofInvoice: str(proforma.termOfInvoice ?? proforma.term_of_invoice, "CIF"),
    InvoiceNo: invoiceNo,
    InvoiceDate: invoiceDate,
    CompanyCode: str(ship.vendor_code),
    IsCommercial: ship.is_commercial ? 1 : 0,
    OTP: otp,
    LSPType: "I",
    RequiredPerforma: "y",
    RequiredLable: "y",
    KYCDocumentType: docType,
    KYCImage: "",
    ImageType: "PDF",
    ExportReason: str(proforma.exportReason ?? proforma.export_reason),
    KYCImage1: "",
    ImageType1: "PDF",
    EAWBNO: "",
    EAWBDate: "",
    EAWBExpDate: "",
    Dimensions,
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
      Address2: str(consignee.address2, str(consignee.address1, ".")),
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

/** Single configurable constant for PostShipping weight measurement unit ("Kgs" by default). */
const POSTSHIPPING_WEIGHT_MEASUREMENT = "Kgs";

/** Build full PostShipping (DTDC) JSON payload array from shipment context matching doc.postshipping.com spec. */
function buildPostShippingPayload(
  ship: Json,
  piecesContext: unknown[],
  thirdPartyToken: string,
  carrierServiceCode?: string,
): { body: Json[]; tokenMissing: boolean; warnings: string[] } {
  const shipper = asJson(ship.shipper);
  const consignee = asJson(ship.consignee);
  const extras = asJson(ship.wizard_extras);
  const proforma = asJson(extras.proforma);
  const kyc = asJson(extras.kyc);
  const warnings: string[] = [];

  const rawService = str(ship.service_code || ship.service || "COURIER PLEASE");
  const serviceCode = str(carrierServiceCode || rawService);
  const awbNo = str(ship.awb_no || ship.reference_no || "PREVIEW_AWB");
  const refNo = str(ship.reference_no, awbNo);

  const senderCountry = normalizeCountryCode(shipper.country || "IN", "IN");
  const receiverCountry = normalizeCountryCode(consignee.country || "AU", "AU");

  const senderName = str(
    shipper.contact_name || shipper.contactName || shipper.name || shipper.company_name,
    "Sender Name",
  );
  const senderCompany = str(shipper.company_name, senderName);
  const senderAdd1 = str(shipper.address1, "Address Line 1");
  const senderAdd2 = str(shipper.address2, "");
  const senderAdd3 = str(shipper.address3, "");
  const senderCity = str(shipper.city, "Hyderabad");
  const senderState = str(shipper.state, "Telangana");
  const senderPostcode = str(shipper.pincode ?? shipper.pin_code, "500001");
  const senderPhone = str(
    shipper.mobile_no ?? shipper.mobileNo ?? shipper.telephone ?? shipper.tel,
    "0000000000",
  );
  const senderEmail = str(shipper.email, "");
  const senderFax = str(shipper.fax, "");

  // Real KYC documents extraction (PAN / IEC / GSTIN / Aadhaar)
  const kycDocs = Array.isArray(kyc.documents) ? kyc.documents : [];
  const firstKyc = kycDocs.length > 0 && typeof kycDocs[0] === "object" ? asJson(kycDocs[0]) : {};
  const senderKycType = str(
    shipper.document_type || shipper.kyc_type || shipper.kycType || firstKyc.entryType || firstKyc.entry_type || (shipper.pan ? "PAN" : shipper.iec_no ? "IEC" : shipper.gstin ? "GSTIN" : shipper.aadhaar ? "Aadhaar" : ""),
    "",
  );
  const senderKycNumber = str(
    shipper.document_no || shipper.kyc_number || shipper.kycNumber || firstKyc.documentNo || firstKyc.document_no || shipper.pan || shipper.iec_no || shipper.gstin || shipper.aadhaar,
    "",
  );

  const receiverName = str(
    consignee.contact_name || consignee.name || consignee.company_name,
    "Receiver Name",
  );
  const receiverCompany = str(consignee.company_name, receiverName);
  const receiverAdd1 = str(consignee.address1, "Receiver Address 1");
  const receiverAdd2 = str(consignee.address2, "");
  const receiverAdd3 = str(consignee.address3, "");
  const receiverCity = str(consignee.city, "Melbourne");
  const receiverState = str(consignee.state, "VIC");
  const receiverPostcode = str(consignee.pincode ?? consignee.pin_code, "3000");
  const receiverMobile = str(
    consignee.mobile_no ?? consignee.mobileNo ?? consignee.telephone ?? consignee.tel,
    "0000000000",
  );
  const receiverPhone = str(consignee.telephone ?? consignee.phone ?? receiverMobile, "0000000000");
  const receiverEmail = str(consignee.email, "");

  const proformaLinesRaw = Array.isArray(proforma.lines) ? proforma.lines : [];
  const proformaCurrency = str(proforma.currency, "AUD");
  const proformaValueSum = proformaLinesRaw.reduce((acc, l) => {
    const n = Number.parseFloat(str(asJson(l).amount, "0"));
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);

  const shipmentVal = num(ship.shipment_value, proformaValueSum || 100);
  const currencyCode = proformaCurrency || "AUD";

  // Export reason and terms from shipment / proforma tab
  const exportReason = str(
    proforma.exportReason || proforma.export_reason || extras.export_reason || ship.export_reason,
    "Commercial",
  );
  const termOfInvoice = str(
    proforma.incoterms || proforma.termOfInvoice || proforma.term_of_invoice || extras.term_of_invoice || ship.shipment_term,
    "DDU",
  );

  const totalPieces = Math.max(
    1,
    num(ship.pieces, Array.isArray(piecesContext) ? piecesContext.length : 1),
  );
  const grossWeight = Math.max(
    0.1,
    num(ship.charge_weight || ship.actual_weight, 1.0),
  );
  const descriptionOfGoods = str(
    ship.content,
    proformaLinesRaw.map((l) => str(asJson(l).description)).filter(Boolean).join(", ") || "Courier Shipment",
  );

  const primaryPiece = Array.isArray(piecesContext) && piecesContext.length > 0 ? asJson(piecesContext[0]) : {};
  const cubicL = num(primaryPiece.length, 10);
  const cubicW = num(primaryPiece.breadth || primaryPiece.width, 10);
  const cubicH = num(primaryPiece.height, 10);
  const cubicWeight = Number(((cubicL * cubicW * cubicH) / 5000).toFixed(3));

  // Build ShipmentResponseItem[] & Pieces[]
  const shipmentResponseItems: Json[] = [];

  if (proformaLinesRaw.length > 0) {
    for (const rawLine of proformaLinesRaw) {
      const line = asJson(rawLine);
      const itemDesc = str(line.description, descriptionOfGoods);
      const itemQty = Math.max(1, num(line.quantity, 1));
      const itemCustomVal = num(line.rate || line.amount, 10).toFixed(2);
      const itemWeight = num(line.weight, grossWeight / proformaLinesRaw.length || 0.5);

      const piece: Json = {
        HarmonisedCode: str(line.hsCode ?? line.hs_code ?? line.hsn_code, "999999"),
        GoodsDescription: itemDesc,
        Quantity: itemQty,
        Weight: itemWeight,
        ManufactureCountryCode: senderCountry,
        OriginCountryCode: senderCountry,
        CurrencyCode: currencyCode,
        CustomsValue: itemCustomVal,
      };

      shipmentResponseItems.push({
        ItemNoOfPcs: itemQty,
        ItemCubicL: 10,
        ItemCubicW: 10,
        ItemCubicH: 10,
        ItemWeight: itemWeight,
        ItemCubicWeight: 0.2,
        ItemDescription: itemDesc,
        ItemCustomValue: itemCustomVal,
        ItemCustomCurrencyCode: currencyCode,
        Notes: "",
        Pieces: [piece],
      });
    }
  } else if (Array.isArray(piecesContext) && piecesContext.length > 0) {
    for (const p of piecesContext) {
      const pRow = asJson(p);
      const pLen = num(pRow.length, 10);
      const pWid = num(pRow.breadth || pRow.width, 10);
      const pHgt = num(pRow.height, 10);
      const pWeight = num(pRow.actual_weight_per_pc || pRow.charge_weight_per_pc, grossWeight / piecesContext.length);
      const pCubicWeight = Number(((pLen * pWid * pHgt) / 5000).toFixed(3));
      const pVal = (shipmentVal / piecesContext.length).toFixed(2);

      const piece: Json = {
        HarmonisedCode: "999999",
        GoodsDescription: descriptionOfGoods,
        Quantity: 1,
        Weight: pWeight,
        ManufactureCountryCode: senderCountry,
        OriginCountryCode: senderCountry,
        CurrencyCode: currencyCode,
        CustomsValue: pVal,
      };

      shipmentResponseItems.push({
        ItemNoOfPcs: 1,
        ItemCubicL: pLen,
        ItemCubicW: pWid,
        ItemCubicH: pHgt,
        ItemWeight: pWeight,
        ItemCubicWeight: pCubicWeight,
        ItemDescription: descriptionOfGoods,
        ItemCustomValue: pVal,
        ItemCustomCurrencyCode: currencyCode,
        Notes: "",
        Pieces: [piece],
      });
    }
  } else {
    const defaultPiece: Json = {
      HarmonisedCode: "999999",
      GoodsDescription: descriptionOfGoods,
      Quantity: totalPieces,
      Weight: grossWeight,
      ManufactureCountryCode: senderCountry,
      OriginCountryCode: senderCountry,
      CurrencyCode: currencyCode,
      CustomsValue: shipmentVal.toFixed(2),
    };

    shipmentResponseItems.push({
      ItemNoOfPcs: totalPieces,
      ItemCubicL: cubicL,
      ItemCubicW: cubicW,
      ItemCubicH: cubicH,
      ItemWeight: grossWeight,
      ItemCubicWeight: cubicWeight,
      ItemDescription: descriptionOfGoods,
      ItemCustomValue: shipmentVal.toFixed(2),
      ItemCustomCurrencyCode: currencyCode,
      Notes: "",
      Pieces: [defaultPiece],
    });
  }

  const tokenMissing = !thirdPartyToken || !thirdPartyToken.trim();
  if (tokenMissing) {
    warnings.push(
      `ThirdPartyToken not configured for service code "${serviceCode}". Live booking will be blocked.`,
    );
  }

  const payloadItem: Json = {
    Pending: true,
    SenderDetails: {
      SenderName: senderName,
      SenderCompanyName: senderCompany,
      SenderCountryCode: senderCountry,
      SenderAdd1: senderAdd1,
      SenderAdd2: senderAdd2 || undefined,
      SenderAdd3: senderAdd3 || undefined,
      SenderAddCity: senderCity,
      SenderAddState: senderState,
      SenderAddPostcode: senderPostcode,
      SenderPhone: senderPhone,
      SenderEmail: senderEmail || undefined,
      SenderFax: senderFax || undefined,
      SenderKycType: senderKycType || undefined,
      SenderKycNumber: senderKycNumber || undefined,
    },
    ReceiverDetails: {
      ReceiverName: receiverName,
      ReceiverCompanyName: receiverCompany,
      ReceiverCountryCode: receiverCountry,
      ReceiverAdd1: receiverAdd1,
      ReceiverAdd2: receiverAdd2 || undefined,
      ReceiverAdd3: receiverAdd3 || undefined,
      ReceiverAddCity: receiverCity,
      ReceiverAddState: receiverState,
      ReceiverAddPostcode: receiverPostcode,
      ReceiverMobile: receiverMobile,
      ReceiverPhone: receiverPhone,
      ReceiverEmail: receiverEmail || undefined,
    },
    PackageDetails: {
      GoodsDescription: descriptionOfGoods,
      CustomValue: shipmentVal.toFixed(2),
      CustomCurrencyCode: currencyCode,
      InsuranceValue: "0.00",
      ShipmentTerm: termOfInvoice,
      GoodsOriginCountryCode: senderCountry,
      Weight: Number(grossWeight.toFixed(3)),
      WeightMeasurement: POSTSHIPPING_WEIGHT_MEASUREMENT,
      NoOfItems: totalPieces,
      CubicL: cubicL,
      CubicW: cubicW,
      CubicH: cubicH,
      CubicWeight: cubicWeight,
      ServiceTypeName: serviceCode,
      BookPickUP: false,
      SenderRef1: awbNo,
      SenderRef2: refNo !== awbNo ? refNo : undefined,
      SenderRef3: str(proforma.invoiceNo || proforma.invoice_no) || undefined,
      ReasonExport: exportReason,
      Incoterms: termOfInvoice,
      ShipmentResponseItem: shipmentResponseItems,
    },
  };

  if (thirdPartyToken && thirdPartyToken.trim()) {
    payloadItem.ThirdPartyToken = thirdPartyToken.trim();
  }

  return { body: [payloadItem], tokenMissing, warnings };
}

const DEFAULT_ORIGINS = ["http://localhost:8082", "http://127.0.0.1:8082"];

function allowedOrigin(req: Request): string | null {
  const origin = req.headers.get("Origin");
  if (!origin) return null;
  const extra = (Deno.env.get("APP_ORIGINS") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ORIGINS, ...extra]).has(origin) ? origin : null;
}

function corsHeaders(req: Request): HeadersInit {
  const origin = allowedOrigin(req);
  if (!origin) {
    return { Vary: "Origin" };
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cms-session-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function jsonResponse(body: unknown, status = 200, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

async function callXpresion(
  endpoint: string,
  payload: Json,
): Promise<{ ok: boolean; raw: Json; text: string }> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let raw: Json = {};
  try {
    raw = text ? (JSON.parse(text) as Json) : {};
  } catch {
    raw = { Status: res.ok ? "SUCCESS" : "ERROR", Message: text.slice(0, 500) };
  }
  return { ok: res.ok, raw, text };
}

async function callPostShippingLive(
  endpoint: string,
  stationKey: string,
  payload: Json[],
  timeoutMs = 20000,
): Promise<{ ok: boolean; status: number; raw: Json | Json[]; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Token: stationKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const text = await res.text();
    let raw: Json | Json[] = {};
    try {
      raw = text ? (JSON.parse(text) as Json | Json[]) : {};
    } catch {
      raw = { ErrorMessage: text.slice(0, 500) };
    }
    return { ok: res.ok, status: res.status, raw, text };
  } catch (err: unknown) {
    clearTimeout(timer);
    const isTimeout =
      err instanceof DOMException && err.name === "AbortError";
    const msg = isTimeout
      ? `PostShipping request timed out after ${timeoutMs / 1000}s`
      : err instanceof Error
        ? err.message
        : "Network error connecting to PostShipping";
    return {
      ok: false,
      status: isTimeout ? 504 : 502,
      raw: { ErrorMessage: msg },
      text: msg,
    };
  }
}

function parsePostShippingResponse(
  rawResponse: Json | Json[],
  awbNo: string,
): {
  success: boolean;
  trackingNo?: string;
  consignmentNo?: string;
  shipmentId?: string;
  labelUrl?: string;
  errorMessage?: string;
} {
  const firstItem: Json = Array.isArray(rawResponse)
    ? asJson(rawResponse[0])
    : asJson(rawResponse);

  const errors: string[] = [];
  const errMessage = str(firstItem.ErrMessage ?? firstItem.ErrorMessage ?? firstItem.Error);
  if (errMessage) errors.push(errMessage);

  if (Array.isArray(firstItem.Errors)) {
    for (const e of firstItem.Errors) {
      if (typeof e === "string" && e.trim()) errors.push(e.trim());
      else if (e && typeof e === "object") {
        const row = e as Json;
        const msg = str(row.Description ?? row.Message ?? row.Error);
        if (msg) errors.push(msg);
      }
    }
  }

  const trackingNo = str(
    firstItem.AlternateRef ??
      firstItem.ShipmentNumber ??
      firstItem.TrackingNumber ??
      firstItem.ConsignmentNumber ??
      firstItem.ConsignmentNo ??
      firstItem.ShipmentId,
  );
  const labelUrl = str(
    firstItem.LabelURL ??
      firstItem.LabelUrl ??
      firstItem.Label ??
      firstItem.Pdfdownload ??
      firstItem.label_url,
  );
  const shipmentId = str(
    firstItem.ShipmentNumber ?? firstItem.ShipmentId ?? firstItem.ShipmentID,
    trackingNo || awbNo,
  );

  const isSuccess =
    errors.length === 0 &&
    (firstItem.Status === "SUCCESS" ||
      firstItem.Status === "OK" ||
      firstItem.Success === true ||
      Boolean(firstItem.ShipmentNumber) ||
      Boolean(firstItem.AlternateRef) ||
      Boolean(trackingNo));

  return {
    success: isSuccess,
    trackingNo: trackingNo || awbNo,
    consignmentNo: str(firstItem.ShipmentNumber ?? firstItem.ConsignmentNumber, awbNo),
    shipmentId,
    labelUrl: labelUrl || undefined,
    errorMessage: errors.length > 0 ? errors.join("; ") : undefined,
  };
}

function parseXpresionResponse(raw: Json): {
  success: boolean;
  otpRequired: boolean;
  message: string;
  awb?: string;
  forwardingNo?: string;
  refNo?: string;
} {
  const nested = raw.Response ?? raw.response;
  const body: Json =
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? { ...raw, ...(nested as Json) }
      : raw;

  const status = str(body.Status ?? body.status ?? body.APIStatus).toLowerCase();
  const code = str(body.ResponseCode ?? body.ErrorCode).toLowerCase();

  let msg = str(body.Message ?? body.APIError, "");
  const errs = body.Error ?? body.Errors;
  if (Array.isArray(errs)) {
    const parts = errs
      .map((e) => {
        if (!e || typeof e !== "object") return String(e ?? "").trim();
        const row = e as Json;
        return str(row.Description ?? row.description ?? row.Message ?? row.message);
      })
      .filter(Boolean);
    if (parts.length) msg = parts.join("; ");
  }
  if (!msg) msg = "Vendor booking failed";

  const combined = `${status} ${code} ${msg}`.toLowerCase();
  const otpRequired =
    combined.includes("otp") &&
    (combined.includes("required") || combined.includes("sent") || combined.includes("verify"));
  const awb = str(body.AWBNo || body.awbNo) || undefined;
  const forwardingNo = str(body.ForwardingNo || body.forwardingNo) || undefined;
  const failed =
    status === "fail" || status === "failed" || status === "error" || code === "1" || code === "td01";
  const success =
    !otpRequired &&
    !failed &&
    (status === "success" || status === "ok" || code === "0" || Boolean(awb || forwardingNo));
  return {
    success,
    otpRequired,
    message: msg,
    awb,
    forwardingNo,
    refNo: str(body.RefNo || body.refNo) || undefined,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const authHeader = req.headers.get("Authorization") ?? "";

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401, req);
    }

    const { data: allowed } = await userClient.rpc("has_permission", {
      p_slug: "txn.awb-entry",
      p_action: "modify",
    });
    if (allowed !== true) {
      return jsonResponse({ error: "Forbidden" }, 403, req);
    }

    const { data: meRows } = await userClient.rpc("me");
    const me = Array.isArray(meRows) ? meRows[0] : meRows;
    const callerTenantId = str((me as Json | null)?.tenant_id);
    if (!callerTenantId) {
      return jsonResponse({ error: "Unauthorized" }, 401, req);
    }

    const body = (await req.json()) as {
      action?: string;
      shipmentId?: string;
      otp?: string | null;
    };
    const shipmentId = str(body.shipmentId);
    if (!shipmentId) {
      return jsonResponse({ error: "shipmentId required" }, 400, req);
    }

    const { data: ctx, error: ctxErr } = await userClient.rpc("get_vendor_shipping_context", {
      p_shipment_id: shipmentId,
    });
    if (ctxErr) {
      return jsonResponse({ error: ctxErr.message }, 400, req);
    }
    const context = (ctx ?? {}) as Json;
    if (!context.shipping_api_enabled || !context.integration) {
      return jsonResponse(
        {
          status: "ERROR",
          message: "Vendor shipping API is not enabled for this vendor.",
          apiStatus: "NONE",
        },
        200,
        req,
      );
    }

    const integ = context.integration as Json;
    const ship = (context.shipment ?? {}) as Json;
    const pieces = Array.isArray(context.pieces) ? (context.pieces as unknown[]) : [];
    const providerCode = str(
      integ.provider_code || ship.vendor_provider || ship.vendor_code,
      "XPRESION",
    ).toUpperCase();

    // ═════════════════════════════════════════════════════════════════════════
    // 1. POSTSHIPPING (DTDC MEL / NZ / AU) ADAPTER PATH
    // ═════════════════════════════════════════════════════════════════════════
    if (
      providerCode === "POSTSHIPPING" ||
      providerCode.startsWith("DTDC") ||
      providerCode === "DTAU"
    ) {
      const vendorId = str(ship.vendor_id);
      const serviceCode = str(ship.service_code || ship.service);
      const shipTenant = str(ship.tenant_id);
      if (shipTenant && shipTenant !== callerTenantId) {
        return jsonResponse({ error: "Forbidden" }, 403, req);
      }

      // Fetch server-side carrier secrets (service role only)
      const { data: secretsData, error: secretsErr } = await admin.rpc("get_vendor_carrier_secrets", {
        p_vendor_id: vendorId,
        p_service_code: serviceCode || null,
        p_tenant_id: callerTenantId,
      });
      if (secretsErr) {
        return jsonResponse({ error: "Carrier secrets are not available for this shipment" }, 403, req);
      }
      const carrierSecrets = (secretsData ?? {}) as Json;

      const stationKey = str(carrierSecrets.station_api_key);
      const thirdPartyToken = str(carrierSecrets.third_party_token);
      const stationCode = str(carrierSecrets.station_code, "MEL");
      const isLiveMode = carrierSecrets.is_live_mode === true;
      const apiBaseUrl = str(
        carrierSecrets.api_base_url,
        "https://api.postshipping.com/api2",
      );
      const endpoint = `${apiBaseUrl.replace(/\/+$/, "")}/shipments`;

      const awbNo = str(ship.awb_no || "PREVIEW_AWB");

      // Idempotency check: prevent duplicate live charges
      const { data: idempCheck } = await admin.rpc(
        "check_carrier_booking_idempotency",
        {
          p_shipment_id: shipmentId,
          p_provider_code: "POSTSHIPPING",
        },
      );
      const idemp = asJson(idempCheck);
      if (idemp.already_booked === true) {
        return jsonResponse(
          {
            status: "SUCCESS",
            message: str(idemp.message, `Shipment already booked (${idemp.vendor_awb})`),
            vendorAwb: str(idemp.vendor_awb),
            vendorRef: str(ship.reference_no || awbNo),
            vendorBookingId: str(idemp.booking_id || idemp.vendor_awb),
            vendorTrackingNumber: str(idemp.tracking_number || idemp.vendor_awb),
            vendorProvider: str(idemp.vendor_provider, "POSTSHIPPING"),
            vendorServiceCode: serviceCode,
            otpVerified: true,
            labelGenerated: true,
            syncStatus: "OK",
            apiStatus: "VENDOR_BOOKED",
            documents: [],
            rawResponse: { Status: "SUCCESS", already_booked: true },
          },
          200,
          req,
        );
      }

      // Build PostShipping request body
      const carrierServiceCode = str(carrierSecrets.carrier_service_code);
      const { body: postShippingBody, tokenMissing, warnings } =
        buildPostShippingPayload(ship, pieces, thirdPartyToken, carrierServiceCode);

      // Masked header for preview / logs (server-side keys never leak)
      const maskedHeaders = {
        Token: stationKey
          ? `${stationKey.slice(0, 4)}...${stationKey.slice(-4)}`
          : "(server-side only)",
        "Content-Type": "application/json",
      };

      // ───────────────────────────────────────────────────────────────────────
      // DRY-RUN / PREVIEW MODE (Default)
      // ───────────────────────────────────────────────────────────────────────
      if (!isLiveMode) {
        const previewRef = `DTDC-PREVIEW-${awbNo}`;
        return jsonResponse(
          {
            status: "SUCCESS",
            message:
              "PostShipping request payload generated (DRY-RUN mode — no live wallet charge)",
            vendorAwb: previewRef,
            vendorRef: str(ship.reference_no || awbNo),
            vendorBookingId: `DRYRUN-${Date.now()}`,
            vendorTrackingNumber: previewRef,
            vendorProvider: "POSTSHIPPING",
            vendorServiceCode: serviceCode,
            otpVerified: true,
            labelGenerated: false,
            syncStatus: "OK",
            apiStatus: "VENDOR_BOOKED",
            request: {
              endpoint,
              headers: maskedHeaders,
              body: postShippingBody,
            },
            rawResponse: {
              mode: "DRY_RUN",
              endpoint,
              stationCode,
              tokenMissing,
              warnings,
              simulatedPayload: postShippingBody,
            },
            documents: [],
          },
          200,
          req,
        );
      }

      // ───────────────────────────────────────────────────────────────────────
      // LIVE MODE (Explicit is_live_mode = true only)
      // ───────────────────────────────────────────────────────────────────────
      if (tokenMissing) {
        const err = `Live booking blocked: ThirdPartyToken is not configured for station ${stationCode} and service code "${serviceCode}".`;
        return jsonResponse(
          {
            status: "ERROR",
            message: err,
            error: "Missing ThirdPartyToken",
            apiStatus: "FAILED",
            vendorProvider: "POSTSHIPPING",
            request: { endpoint, headers: maskedHeaders, body: postShippingBody },
          },
          200,
          req,
        );
      }

      if (!stationKey) {
        const err = `Live booking blocked: Station API key is not configured for station ${stationCode}.`;
        return jsonResponse(
          {
            status: "ERROR",
            message: err,
            error: "Missing Station API Key",
            apiStatus: "FAILED",
            vendorProvider: "POSTSHIPPING",
            request: { endpoint, headers: maskedHeaders, body: postShippingBody },
          },
          200,
          req,
        );
      }

      // Live outbound HTTP POST (with safe timeout & bounded retry)
      let postResult = await callPostShippingLive(
        endpoint,
        stationKey,
        postShippingBody,
        20000,
      );

      // Safe retry for transient 502/504 network errors (1 attempt only)
      if (!postResult.ok && (postResult.status === 502 || postResult.status === 504)) {
        postResult = await callPostShippingLive(
          endpoint,
          stationKey,
          postShippingBody,
          15000,
        );
      }

      const parsed = parsePostShippingResponse(postResult.raw, awbNo);

      if (!postResult.ok || !parsed.success) {
        const failMessage =
          parsed.errorMessage ||
          (asJson(postResult.raw).ErrorMessage as string) ||
          `PostShipping booking failed (HTTP ${postResult.status})`;
        return jsonResponse(
          {
            status: "ERROR",
            message: failMessage,
            error: failMessage,
            apiStatus: "FAILED",
            vendorProvider: "POSTSHIPPING",
            rawResponse: postResult.raw,
            request: { endpoint, headers: maskedHeaders, body: postShippingBody },
          },
          200,
          req,
        );
      }

      const trackingNo = parsed.trackingNo || awbNo;
      const documents: Array<{
        doc_type: string;
        label: string;
        source_url?: string;
      }> = [];
      if (parsed.labelUrl) {
        documents.push({
          doc_type: "SHIPPING_LABEL",
          label: "PostShipping AWB Label",
          source_url: parsed.labelUrl,
        });

        if (shipmentId) {
          try {
            await admin.rpc("save_shipment_document", {
              p_shipment_id: shipmentId,
              p_fields: {
                document_type: "VENDOR_AWB",
                source: "VENDOR",
                vendor: "DTDC AUSTRALIA",
                file_name: `DTDC_Label_${trackingNo}.pdf`,
                file_url: parsed.labelUrl,
                mime_type: "application/pdf",
                status: "AVAILABLE",
              },
            });
          } catch (docErr) {
            console.warn("Failed to auto-save vendor document:", docErr);
          }
        }
      }

      return jsonResponse(
        {
          status: "SUCCESS",
          message: "PostShipping booking confirmed",
          vendorAwb: trackingNo,
          vendorTrackingNumber: trackingNo,
          vendorBookingId: parsed.shipmentId || trackingNo,
          vendorProvider: "POSTSHIPPING",
          vendorServiceCode: serviceCode,
          otpVerified: true,
          labelGenerated: Boolean(parsed.labelUrl),
          syncStatus: "OK",
          apiStatus: "VENDOR_BOOKED",
          documents,
          rawResponse: postResult.raw,
          request: { endpoint, headers: maskedHeaders, body: postShippingBody },
        },
        200,
        req,
      );
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 2. XPRESION ADAPTER PATH
    // ═════════════════════════════════════════════════════════════════════════
    if (
      providerCode === "XPRESION" ||
      providerCode === "CW" ||
      providerCode === "COURIERWALA"
    ) {
      const integrationId = str(integ.id);
      const { data: secrets } = await admin.rpc("get_vendor_integration_secrets", {
        p_integration_id: integrationId,
      });
      const secretRow = (secrets ?? null) as Json | null;

      const username = str(secretRow?.username ?? integ.username);
      const password = str(secretRow?.password);
      const customerCode = str(secretRow?.customer_code ?? integ.customer_code);
      const endpoint = str(
        secretRow?.endpoint_url ?? integ.endpoint_url,
        DEFAULT_XPRESION_ENDPOINT,
      );
      const sandbox = secretRow?.sandbox_mode === true || !username || !password;

      const otp = str(body.otp);
      if (sandbox) {
        if (!otp) {
          return jsonResponse(
            {
              status: "OTP_REQUIRED",
              message: "An OTP has been sent to your registered mobile number.",
              apiStatus: "OTP_REQUIRED",
              vendorProvider: "XPRESION",
            },
            200,
            req,
          );
        }
        if (otp !== "123456" && otp.length < 4) {
          return jsonResponse(
            {
              status: "ERROR",
              message: "Invalid OTP. Please try again.",
              error: "Invalid OTP",
              apiStatus: "OTP_REQUIRED",
              vendorProvider: "XPRESION",
            },
            200,
            req,
          );
        }
        const vendorAwb = `VX${str(ship.awb_no, "SANDBOX")}`.slice(0, 20);
        return jsonResponse(
          {
            status: "SUCCESS",
            message: "Vendor booking successful (sandbox)",
            vendorAwb,
            vendorRef: str(ship.reference_no || ship.awb_no),
            vendorBookingId: `SB-${Date.now()}`,
            vendorTrackingNumber: vendorAwb,
            vendorProvider: "XPRESION",
            vendorServiceCode: str(ship.service),
            otpVerified: true,
            labelGenerated: true,
            syncStatus: "OK",
            apiStatus: "VENDOR_BOOKED",
            documents: [],
            rawResponse: { Status: "SUCCESS", AWBNo: vendorAwb, sandbox: true },
          },
          200,
          req,
        );
      }

      const payload = buildXpresionPayload(
        ship,
        pieces,
        { username, password, customerCode },
        otp,
      );

      const missing: string[] = [];
      if (!str(payload.DocumentNumber)) missing.push("Shipper Document No");
      if (!str(payload.ShipperAdd1)) missing.push("Shipper Address 1");
      if (!str(payload.Content)) missing.push("Content");
      if (!str(payload.ShipmentValue) || str(payload.ShipmentValue) === "0") {
        missing.push("Shipment Value");
      }
      if (!str(payload.InvoiceNo)) missing.push("Invoice No");
      if (missing.length) {
        const message = `Complete before vendor booking: ${missing.join(", ")}`;
        return jsonResponse(
          {
            status: "ERROR",
            message,
            error: message,
            apiStatus: "VENDOR_PENDING",
            vendorProvider: "XPRESION",
            request: { ...payload, Password: "***" },
          },
          200,
          req,
        );
      }

      const { raw } = await callXpresion(endpoint, payload);
      const parsed = parseXpresionResponse(raw);
      if (parsed.otpRequired) {
        return jsonResponse(
          {
            status: "OTP_REQUIRED",
            message:
              parsed.message || "An OTP has been sent to your registered mobile number.",
            apiStatus: "OTP_REQUIRED",
            vendorProvider: "XPRESION",
            rawResponse: raw,
            request: { ...payload, Password: "***", OTP: otp ? "***" : "" },
          },
          200,
          req,
        );
      }
      if (!parsed.success) {
        return jsonResponse(
          {
            status: "ERROR",
            message: parsed.message || "Vendor booking failed",
            error: parsed.message,
            apiStatus: "VENDOR_PENDING",
            vendorProvider: "XPRESION",
            rawResponse: raw,
            request: { ...payload, Password: "***" },
          },
          200,
          req,
        );
      }

      const nested = asJson(raw.Response ?? raw.response);
      const docBody: Json = { ...raw, ...nested };
      const vendorAwb = parsed.forwardingNo || parsed.awb;
      const authorityUrl = str(
        docBody.AuthorityLetter ||
          docBody.authorityLetter ||
          docBody.AuthorityLetterUrl ||
          docBody.authority_letter_url,
      );
      const vendorAwbUrl = str(
        docBody.VendorAwb ||
          docBody.vendorAwb ||
          docBody.Pdfdownload ||
          docBody.Label,
      );
      const vendorInvoiceUrl = str(
        docBody.VendorInvoice ||
          docBody.vendorInvoice ||
          docBody.Performa ||
          docBody.performa,
      );
      const labelUrl = str(docBody.Label || docBody.Pdfdownload);

      const documents: Array<{
        doc_type: string;
        label: string;
        source_url?: string;
      }> = [];
      if (authorityUrl) {
        documents.push({
          doc_type: "AUTHORITY_LETTER",
          label: "Authority Letter",
          source_url: authorityUrl,
        });
      }
      if (vendorAwbUrl) {
        documents.push({
          doc_type: "VENDOR_AWB",
          label: "Vendor AWB",
          source_url: vendorAwbUrl,
        });
      }
      if (vendorInvoiceUrl) {
        documents.push({
          doc_type: "VENDOR_INVOICE",
          label: "Vendor Invoice",
          source_url: vendorInvoiceUrl,
        });
      }
      if (labelUrl) {
        documents.push({
          doc_type: "SHIPPING_LABEL",
          label: "Shipping Label",
          source_url: labelUrl,
        });
      }

      return jsonResponse(
        {
          status: "SUCCESS",
          message: parsed.message || "Vendor booking successful",
          vendorAwb,
          vendorRef: parsed.refNo,
          vendorBookingId: parsed.refNo || vendorAwb,
          vendorTrackingNumber: vendorAwb,
          vendorProvider: "XPRESION",
          vendorServiceCode: str(ship.service),
          otpVerified: Boolean(otp),
          labelGenerated: Boolean(labelUrl),
          syncStatus: "OK",
          apiStatus: "VENDOR_BOOKED",
          documents,
          rawResponse: raw,
        },
        200,
        req,
      );
    }

    return jsonResponse(
      {
        status: "ERROR",
        message: `${providerCode} adapter is not implemented in the edge runtime yet.`,
        error: "NOT_IMPLEMENTED",
        apiStatus: "FAILED",
        vendorProvider: providerCode,
      },
      200,
      req,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Vendor shipping edge error";
    return jsonResponse(
      { status: "ERROR", message, error: message, apiStatus: "VENDOR_PENDING" },
      200,
      req,
    );
  }
});
