import { describe, expect, it } from "vitest";

import { allowedOrigin, corsHeaderRecord } from "./cors";

function request(origin: string | null): Request {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  return new Request("https://app.example/api/auth/login", { headers });
}

describe("cors allowlist", () => {
  it("allows the local app and configured domains only", () => {
    expect(allowedOrigin(request("http://localhost:8082"), "")).toBe("http://localhost:8082");
    expect(allowedOrigin(request("https://erp.courierwalaexpress.in"), "https://erp.courierwalaexpress.in")).toBe(
      "https://erp.courierwalaexpress.in",
    );
    expect(allowedOrigin(request("https://evil.example"), "https://erp.courierwalaexpress.in")).toBeNull();
    const blocked = corsHeaderRecord(request("https://evil.example"), "");
    expect(blocked["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});
