/** OTP responses exposed to the browser. Never includes the code or the full mobile number. */
export function toPublicOtpResult(raw: Record<string, unknown>): {
  ok: boolean;
  masked: string;
  message: string;
  live: boolean;
  sandbox: boolean;
  provider: string | null;
} {
  const masked = typeof raw.mobile_masked === "string" && raw.mobile_masked.trim() ? raw.mobile_masked.trim() : "—";
  const live = raw.live === true;
  const sandbox = raw.sandbox === true || raw.live === false;
  return {
    ok: raw.ok !== false,
    masked,
    message: live
      ? `OTP sent to shipper mobile ${masked}`
      : `OTP was issued for shipper mobile ${masked}. It is not shown in the app.`,
    live,
    sandbox,
    provider: raw.provider != null ? String(raw.provider) : null,
  };
}
