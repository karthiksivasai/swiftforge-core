/**
 * Provider-agnostic Vendor Shipping Edge Function.
 * Resolves tenant integration secrets (service role) and dispatches to the
 * matching adapter. AWB Entry never calls provider APIs directly in production.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const DEFAULT_XPRESION_ENDPOINT =
  "https://xpresion.courierwalaexpress.in/api/v1/Awbentry/Awbentry";

type Json = Record<string, unknown>;

function str(v: unknown, fallback = ""): string {
  if (v == null) return fallback;
  const s = String(v).trim();
  return s || fallback;
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
  // Xpresion MEDICINE product rejects weights below 0.500 kg.
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

function corsHeaders(req: Request): HeadersInit {
  return {
    "Access-Control-Allow-Origin": req.headers.get("Origin") ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

function parseProviderResponse(raw: Json): {
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
    const integrationId = str(integ.id);
    const providerCode = str(integ.provider_code, "XPRESION").toUpperCase();

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
    // Live when username+password present unless sandbox_mode is explicitly true.
    const sandbox = secretRow?.sandbox_mode === true || !username || !password;

    // Only XPRESION gateway is live in this function; others return NOT_IMPLEMENTED
    if (providerCode !== "XPRESION" && providerCode !== "CW" && providerCode !== "COURIERWALA") {
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
    }

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
      const ship = (context.shipment ?? {}) as Json;
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
          // No blank sandbox PDFs — Authority Letter / AWB Label are generated in the app.
          documents: [],
          rawResponse: { Status: "SUCCESS", AWBNo: vendorAwb, sandbox: true },
        },
        200,
        req,
      );
    }

    const ship = (context.shipment ?? {}) as Json;
    const pieces = Array.isArray(context.pieces) ? (context.pieces as unknown[]) : [];
    const payload = buildXpresionPayload(
      ship,
      pieces,
      { username, password, customerCode },
      otp,
    );

    // Fail fast with clear messages before calling the live gateway.
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
    const parsed = parseProviderResponse(raw);
    if (parsed.otpRequired) {
      return jsonResponse(
        {
          status: "OTP_REQUIRED",
          message: parsed.message || "An OTP has been sent to your registered mobile number.",
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
      docBody.VendorAwb || docBody.vendorAwb || docBody.Pdfdownload || docBody.Label,
    );
    const vendorInvoiceUrl = str(
      docBody.VendorInvoice || docBody.vendorInvoice || docBody.Performa || docBody.performa,
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
  } catch (e) {
    const message = e instanceof Error ? e.message : "Vendor shipping edge error";
    return jsonResponse({ status: "ERROR", message, error: message, apiStatus: "VENDOR_PENDING" }, 200, req);
  }
});
