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
  return v == null ? fallback : String(v).trim();
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
  const status = str(raw.Status ?? raw.status).toLowerCase();
  const code = str(raw.ResponseCode ?? raw.ErrorCode);
  const msg = str(raw.Message ?? raw.APIError ?? raw.Error, "Vendor response");
  const combined = `${status} ${code} ${msg}`.toLowerCase();
  const otpRequired =
    combined.includes("otp") &&
    (combined.includes("required") || combined.includes("sent") || combined.includes("verify"));
  const awb = str(raw.AWBNo || raw.awbNo) || undefined;
  const forwardingNo = str(raw.ForwardingNo || raw.forwardingNo) || undefined;
  const success =
    !otpRequired &&
    (status === "success" || status === "ok" || code === "0" || Boolean(awb || forwardingNo));
  return {
    success,
    otpRequired,
    message: msg,
    awb,
    forwardingNo,
    refNo: str(raw.RefNo || raw.refNo) || undefined,
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
    const sandbox = secretRow?.sandbox_mode !== false && (!username || !password);

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
          documents: [
            { doc_type: "VENDOR_AWB", label: "Vendor AWB", raw_meta: { sandbox: true } },
            { doc_type: "SHIPPING_LABEL", label: "Shipping Label", raw_meta: { sandbox: true } },
          ],
          rawResponse: { Status: "SUCCESS", AWBNo: vendorAwb },
        },
        200,
        req,
      );
    }

    // Build a minimal live payload — full mapping is also available client-side;
    // edge uses shipment fields from context for the critical auth + party block.
    const ship = (context.shipment ?? {}) as Json;
    const shipper = (ship.shipper ?? {}) as Json;
    const consignee = (ship.consignee ?? {}) as Json;
    const payload: Json = {
      UserID: username,
      Password: password,
      CustomerCode: customerCode,
      CustomerRefNo: str(ship.reference_no || ship.awb_no),
      OriginName: str(ship.origin_code),
      DestinationName: str(ship.destination_code),
      ShipperName: str(shipper.company_name),
      ShipperContact: str(shipper.contact_name),
      ShipperAdd1: str(shipper.address1),
      ShipperAdd2: str(shipper.address2),
      ShipperCity: str(shipper.city),
      ShipperState: str(shipper.state),
      ShipperPin: str(shipper.pincode ?? shipper.pin_code),
      ShipperTelno: str(shipper.telephone),
      ShipperMobile: str(shipper.mobile),
      ShipperEmail: str(shipper.email),
      DocumentType: str(shipper.document_type, "Aadhaar Number"),
      DocumentNumber: str(shipper.document_no),
      ConsigneeName: str(consignee.company_name),
      ConsigneeContact: str(consignee.contact_name),
      ConsigneeAdd1: str(consignee.address1),
      ConsigneeAdd2: str(consignee.address2),
      ConsigneeCity: str(consignee.city),
      ConsigneeState: str(consignee.state),
      ConsigneePin: str(consignee.pincode ?? consignee.pin_code),
      ConsigneeTelno: str(consignee.telephone),
      ConsigneeMobile: str(consignee.mobile),
      ConsigneeEmail: str(consignee.email),
      Instruction: str(ship.instruction),
      VendorName: str(ship.vendor_code),
      ServiceName: str(ship.service),
      ProductCode: str(ship.product_code),
      Dox_Spx: str(ship.pieces_unit || ship.product_code, "SPX"),
      Pieces: str(ship.pieces, "1"),
      Weight: str(ship.charge_weight ?? ship.actual_weight, "1.000"),
      Content: str(ship.content),
      Currency: str(ship.currency, "INR"),
      ShipmentValue: str(ship.shipment_value, "0"),
      OTP: otp,
      RequiredPerforma: "y",
      RequiredLable: "y",
      IsCommercial: ship.is_commercial ? 1 : 0,
      LSPType: "I",
    };

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
        },
        200,
        req,
      );
    }

    const vendorAwb = parsed.forwardingNo || parsed.awb;
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
        labelGenerated: true,
        syncStatus: "OK",
        apiStatus: "VENDOR_BOOKED",
        documents: [
          {
            doc_type: "VENDOR_AWB",
            label: "Vendor AWB",
            source_url: str(raw.Pdfdownload || raw.Label) || undefined,
          },
          {
            doc_type: "SHIPPING_LABEL",
            label: "Shipping Label",
            source_url: str(raw.Label || raw.Pdfdownload) || undefined,
          },
        ],
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
