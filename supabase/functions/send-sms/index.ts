/**
 * Live SMS edge function — MSG91 / Twilio.
 * Used for vendor booking OTP to shipper mobile.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

/** Normalize to E.164-ish digits for IN (+91) when 10-digit local. */
function normalizeMobile(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `91${digits.slice(1)}`;
  return digits;
}

function twilioTo(raw: string): string {
  const n = normalizeMobile(raw);
  return n.startsWith("+") ? n : `+${n}`;
}

async function sendViaMsg91(args: {
  apiKey: string;
  sender: string;
  templateId: string;
  mobile: string;
  otp: string;
  body: string;
}): Promise<{ ok: boolean; response: string; error?: string }> {
  const mobile = normalizeMobile(args.mobile);

  // Prefer Flow/OTP template when template id present (India DLT)
  if (args.templateId) {
    const res = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authkey: args.apiKey,
      },
      body: JSON.stringify({
        template_id: args.templateId,
        short_url: "0",
        recipients: [
          {
            mobiles: mobile,
            otp: args.otp,
            var: args.otp,
            OTP: args.otp,
          },
        ],
      }),
    });
    const text = await res.text();
    let ok = res.ok;
    try {
      const j = JSON.parse(text) as Json;
      ok = ok && String(j.type ?? j.message ?? "").toLowerCase() !== "error";
    } catch {
      /* use http status */
    }
    return { ok, response: text.slice(0, 2000), error: ok ? undefined : text.slice(0, 300) };
  }

  // Fallback: SendOTP API
  const url = new URL("https://control.msg91.com/api/v5/otp");
  url.searchParams.set("otp", args.otp);
  url.searchParams.set("mobile", mobile);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authkey: args.apiKey,
    },
    body: JSON.stringify({
      template_id: args.templateId || undefined,
      sender: args.sender || undefined,
      otp: args.otp,
    }),
  });
  const text = await res.text();
  return {
    ok: res.ok,
    response: text.slice(0, 2000),
    error: res.ok ? undefined : text.slice(0, 300),
  };
}

async function sendViaTwilio(args: {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  body: string;
}): Promise<{ ok: boolean; response: string; error?: string }> {
  const endpoint =
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(args.accountSid)}/Messages.json`;
  const form = new URLSearchParams();
  form.set("To", twilioTo(args.to));
  form.set("From", args.from);
  form.set("Body", args.body);
  const auth = btoa(`${args.accountSid}:${args.authToken}`);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const text = await res.text();
  return {
    ok: res.ok,
    response: text.slice(0, 2000),
    error: res.ok ? undefined : text.slice(0, 300),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  const t0 = Date.now();
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
    };
    const action = str(body.action, "vendor_booking_otp");
    const shipmentId = str(body.shipmentId);
    if (action !== "vendor_booking_otp" || !shipmentId) {
      return jsonResponse({ error: "action=vendor_booking_otp and shipmentId required" }, 400, req);
    }

    // Ensure caller can access shipment (tenant-scoped)
    const { error: ctxErr } = await userClient.rpc("get_vendor_shipping_context", {
      p_shipment_id: shipmentId,
    });
    if (ctxErr) {
      // Fallback: allow if list/get shipment works — still block hard failures
      const { data: ship, error: shipErr } = await userClient
        .from("shipments")
        .select("id")
        .eq("id", shipmentId)
        .maybeSingle();
      if (shipErr || !ship) {
        return jsonResponse({ error: ctxErr.message || "Shipment not accessible" }, 403, req);
      }
    }

    const { data: issued, error: issueErr } = await admin.rpc("issue_vendor_booking_otp", {
      p_shipment_id: shipmentId,
    });
    if (issueErr) {
      return jsonResponse({ error: issueErr.message }, 400, req);
    }
    const issue = (issued ?? {}) as Json;
    const mobile = str(issue.mobile);
    const otp = str(issue.otp);
    const masked = str(issue.mobile_masked);
    const tenantId = str(issue.tenant_id);
    const awb = str(issue.awb_no);
    if (!mobile || !otp) {
      return jsonResponse({ error: "Failed to issue OTP" }, 500, req);
    }

    const smsBody =
      `Your vendor booking OTP for AWB ${awb || "N/A"} is ${otp}. Valid for 10 minutes. Do not share.`;

    const { data: secrets } = await admin.rpc("get_messaging_secrets", {
      p_tenant_id: tenantId || null,
    });
    const cred = (secrets ?? null) as Json | null;
    const provider = str(cred?.provider_code).toUpperCase();
    // live when credentials exist AND sandbox_mode explicitly false
    const wantLive = Boolean(cred) && cred?.sandbox_mode === false;

    if (!wantLive || !provider) {
      await admin.rpc("log_vendor_booking_otp_sms", {
        p_fields: {
          tenant_id: tenantId,
          shipment_id: shipmentId,
          mobile,
          provider: "SANDBOX",
          status: "SUCCESS",
          body: smsBody,
          live: false,
          latency_ms: Date.now() - t0,
        },
      });
      return jsonResponse(
        {
          ok: true,
          live: false,
          sandbox: true,
          provider: "SANDBOX",
          mobile_masked: masked,
          sandbox_otp: otp,
          message: `Sandbox OTP for shipper ${masked}: ${otp} (add MSG91/Twilio credentials with sandbox OFF for live SMS)`,
        },
        200,
        req,
      );
    }

    let sendResult: { ok: boolean; response: string; error?: string };
    if (provider === "MSG91") {
      sendResult = await sendViaMsg91({
        apiKey: str(cred?.api_key),
        sender: str(cred?.account_number),
        templateId: str(cred?.endpoint),
        mobile,
        otp,
        body: smsBody,
      });
    } else if (provider === "TWILIO") {
      sendResult = await sendViaTwilio({
        accountSid: str(cred?.username),
        authToken: str(cred?.password),
        from: str(cred?.account_number),
        to: mobile,
        body: smsBody,
      });
    } else {
      sendResult = { ok: false, response: "", error: `Unsupported provider ${provider}` };
    }

    await admin.rpc("log_vendor_booking_otp_sms", {
      p_fields: {
        tenant_id: tenantId,
        shipment_id: shipmentId,
        mobile,
        provider,
        status: sendResult.ok ? "SUCCESS" : "FAILED",
        body: smsBody,
        live: true,
        error: sendResult.error ?? null,
        provider_response: sendResult.response,
        latency_ms: Date.now() - t0,
      },
    });

    if (!sendResult.ok) {
      return jsonResponse(
        {
          ok: false,
          live: true,
          provider,
          mobile_masked: masked,
          error: sendResult.error || "SMS provider rejected the message",
          message: sendResult.error || "Failed to send live SMS",
        },
        502,
        req,
      );
    }

    return jsonResponse(
      {
        ok: true,
        live: true,
        sandbox: false,
        provider,
        mobile_masked: masked,
        message: `OTP sent to shipper mobile ${masked} via ${provider}`,
      },
      200,
      req,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "SMS send failed";
    return jsonResponse({ error: msg, ok: false }, 500, req);
  }
});
