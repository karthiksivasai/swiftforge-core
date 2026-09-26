import { describe, expect, it } from "vitest";

import { toPublicOtpResult } from "./otp-response";
import { toPublicTrackingView } from "./public-tracking";

describe("secret responses", () => {
  it("drops sandbox OTPs and full mobile numbers", () => {
    const result = toPublicOtpResult({
      ok: true,
      mobile: "919876543210",
      mobile_masked: "••••••3210",
      sandbox_otp: "123456",
      message: "Sandbox OTP for shipper ••••••3210: 123456",
      live: false,
      sandbox: true,
    });
    expect(result).not.toHaveProperty("sandboxOtp");
    expect(JSON.stringify(result)).not.toContain("123456");
    expect(JSON.stringify(result)).not.toContain("919876543210");
    expect(result.masked).toBe("••••••3210");
  });

  it("keeps only safe public tracking fields", () => {
    const view = toPublicTrackingView({
      found: true,
      shipment_number: "AWB1",
      current_status: "IN_TRANSIT",
      origin: "Hyderabad",
      destination: "Mumbai",
      carrier_name: "DTDC",
      station_api_key: "SECRET",
      shipper_mobile: "919999999999",
      tracking_timeline: [{ status_text: "Booked", remark: "call 919999999999", created_at: "2026-01-01" }],
    });
    const encoded = JSON.stringify(view);
    expect(encoded).not.toContain("SECRET");
    expect(encoded).not.toContain("919999999999");
    expect(encoded).not.toContain("remark");
    expect(view.tracking_timeline[0]?.status_text).toBe("Booked");
  });
});
