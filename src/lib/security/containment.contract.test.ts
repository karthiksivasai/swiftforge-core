import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../../..");
const apiDir = join(root, "src/routes/api");

const PUBLIC_AUTH_ROUTES = new Set([
  "auth.login.ts",
  "auth.forgot-password.ts",
  "auth.reset-password.ts",
  "auth.activate.ts",
  "auth.otp-request.ts",
  "auth.otp-verify.ts",
]);

describe("API containment contract", () => {
  it("requires auth on every data API and leaves only the credential routes public", () => {
    const files = readdirSync(apiDir).filter((name) => name.endsWith(".ts"));
    for (const file of files) {
      const source = readFileSync(join(apiDir, file), "utf8");
      if (PUBLIC_AUTH_ROUTES.has(file)) {
        expect(source).toContain("requirePublicRateLimit");
        expect(source).not.toMatch(/requireApiAuth\s*\(/);
      } else {
        expect(source, file).toContain("requireApiAuth");
      }
    }
  });

  it("disables carrier booking routes", () => {
    for (const file of ["shipping.ups.book.ts", "shipping.world-first.book.ts"]) {
      const source = readFileSync(join(apiDir, file), "utf8");
      expect(source).toContain("CARRIER_BOOKING_DISABLED");
      expect(source).not.toContain("WF_PASSWORD");
    }
  });

  it("keeps carrier secret reads on the service role and strips client selects", () => {
    const sql = readFileSync(join(root, "supabase/migrations/0117_security_containment.sql"), "utf8");
    expect(sql).toContain("revoke all privileges on table public.vendor_service_tokens from public, anon, authenticated");
    expect(sql).toContain("revoke select (station_api_key) on table public.vendors from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.get_vendor_carrier_secrets(uuid, text, uuid) to service_role");
    expect(sql).not.toContain("grant execute on function public.get_vendor_carrier_secrets(uuid, text, uuid) to authenticated");
    expect(sql).toContain("revoke all on all functions in schema app from anon");
    expect(sql).not.toContain("'sandbox_otp'");
  });
});
