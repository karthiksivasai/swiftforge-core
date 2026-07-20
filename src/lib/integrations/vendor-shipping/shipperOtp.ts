/**
 * Shipper-mobile OTP helpers for vendor booking.
 * Prefers live SMS via edge `send-sms` (MSG91/Twilio); falls back to sandbox RPC.
 */
import { supabase } from "@/integrations/supabase/client";

export function extractShipperMobile(shipper: unknown): string {
  if (!shipper || typeof shipper !== "object") return "";
  const s = shipper as Record<string, unknown>;
  const raw = [s.mobile, s.mobile_no, s.mobileNo, s.telephone, s.tel]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .find((v) => v.length > 0);
  return raw ?? "";
}

export function maskMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, "");
  if (digits.length < 4) return mobile || "—";
  const prefix = mobile.trim().startsWith("+") ? "+" : "";
  return `${prefix}••••••${digits.slice(-4)}`;
}

export type ShipperOtpSendResult = {
  mobile: string;
  masked: string;
  message: string;
  sandbox?: boolean;
  live?: boolean;
  sandboxOtp?: string | null;
  provider?: string | null;
};

async function sendViaEdge(shipmentId: string): Promise<ShipperOtpSendResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke("send-sms", {
      body: { action: "vendor_booking_otp", shipmentId },
    });
    if (error) return null;
    const raw = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    if (raw.ok === false) {
      throw new Error(String(raw.message ?? raw.error ?? "Failed to send OTP SMS"));
    }
    if (!raw.ok && !raw.mobile_masked && !raw.sandbox_otp) return null;
    const masked = String(raw.mobile_masked ?? "—");
    const sandboxOtp =
      raw.sandbox_otp != null && String(raw.sandbox_otp).trim()
        ? String(raw.sandbox_otp).trim()
        : null;
    return {
      mobile: "",
      masked,
      message: String(raw.message ?? `OTP sent to shipper mobile ${masked}`),
      sandbox: raw.sandbox === true || raw.live === false,
      live: raw.live === true,
      sandboxOtp: raw.live === true ? null : sandboxOtp,
      provider: raw.provider != null ? String(raw.provider) : null,
    };
  } catch (e) {
    if (e instanceof Error && /Failed to send OTP SMS|SMS provider/i.test(e.message)) {
      throw e;
    }
    return null;
  }
}

/** Issue OTP and deliver to shipper mobile (live edge, else sandbox RPC). */
export async function sendOtpToShipperMobile(args: {
  shipmentId: string;
}): Promise<ShipperOtpSendResult> {
  const viaEdge = await sendViaEdge(args.shipmentId);
  if (viaEdge) return viaEdge;

  // Fallback when edge is not deployed
  const { data, error } = await supabase.rpc("send_vendor_booking_otp", {
    p_shipment_id: args.shipmentId,
  });
  if (error) throw new Error(error.message);
  const raw = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  if (raw.ok === false) {
    throw new Error(String(raw.message ?? "Failed to send OTP"));
  }
  const mobile = String(raw.mobile ?? "");
  const masked = String(raw.mobile_masked ?? maskMobile(mobile));
  const sandboxOtp =
    raw.sandbox_otp != null && String(raw.sandbox_otp).trim()
      ? String(raw.sandbox_otp).trim()
      : null;
  return {
    mobile,
    masked,
    message: String(raw.message ?? `OTP sent to shipper mobile ${masked}`),
    sandbox: true,
    live: false,
    sandboxOtp,
    provider: "SANDBOX",
  };
}

/** Verify OTP that was sent to the shipper mobile. */
export async function verifyShipperOtpChallenge(
  shipmentId: string,
  otp: string,
): Promise<{ ok: boolean; message?: string; masked?: string }> {
  const { data, error } = await supabase.rpc("verify_vendor_booking_otp", {
    p_shipment_id: shipmentId,
    p_otp: otp,
  });
  if (error) throw new Error(error.message);
  const raw = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  return {
    ok: raw.ok === true,
    message: raw.message != null ? String(raw.message) : undefined,
    masked: raw.mobile_masked != null ? String(raw.mobile_masked) : undefined,
  };
}

export function getShipperOtpMobile(_shipmentId: string): string | null {
  return null;
}

export function clearShipperOtpChallenge(_shipmentId: string): void {
  /* server challenge cleared on successful verify */
}

export function getShipperOtpChallengeCode(_shipmentId: string): string | null {
  return null;
}
