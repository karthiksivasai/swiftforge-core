import { describe, expect, it } from "vitest";

import { applySecurityHeaders, SECURITY_HEADERS } from "./headers";

describe("security headers", () => {
  it("sets CSP, HSTS, frame, and referrer policy", () => {
    const response = applySecurityHeaders(new Response("ok"));
    expect(response.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("Strict-Transport-Security")).toBe(SECURITY_HEADERS["Strict-Transport-Security"]);
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
});
