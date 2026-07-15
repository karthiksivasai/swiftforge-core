import { describe, expect, it } from "vitest";

import { getIrnProvider, SandboxIrnProvider } from "@/lib/integrations/irn";
import { integrationCredentialSchema, webhookSchema } from "@/lib/integrations/schemas";

describe("integration credential schemas", () => {
  it("accepts provider credentials", () => {
    const parsed = integrationCredentialSchema.parse({
      provider_code: "FEDEX",
      username: "user",
      sandbox_mode: true,
      is_active: true,
    });
    expect(parsed.provider_code).toBe("FEDEX");
    expect(parsed.sandbox_mode).toBe(true);
  });

  it("accepts e-invoice credential fields", () => {
    const parsed = integrationCredentialSchema.parse({
      provider_code: "CLEARTAX",
      username: "gst_user",
      api_key: "client-id",
      api_secret: "client-secret",
      account_number: "29AAAAA0000A1Z5",
      sandbox_mode: true,
    });
    expect(parsed.account_number).toBe("29AAAAA0000A1Z5");
  });

  it("requires provider code", () => {
    expect(() => integrationCredentialSchema.parse({ provider_code: "" })).toThrow();
  });
});

describe("irn providers (7E)", () => {
  it("defaults to sandbox stub", async () => {
    const provider = getIrnProvider();
    expect(provider).toBeInstanceOf(SandboxIrnProvider);
    const gen = await provider.generate({ documentType: "INVOICE", documentNo: "INV1" });
    expect(gen.ok).toBe(true);
    expect(gen.irn).toContain("SANDBOX");
    const cancel = await provider.cancel({ irn: gen.irn, reason: "test" });
    expect(cancel.status).toBe("CANCELLED");
  });
});

describe("customs EDI providers (7F)", () => {
  it("defaults to sandbox stub", async () => {
    const { getCustomsEdiProvider, SandboxCustomsEdiProvider } =
      await import("@/lib/integrations/customs-edi");
    const provider = getCustomsEdiProvider();
    expect(provider).toBeInstanceOf(SandboxCustomsEdiProvider);
    const gen = await provider.generate({ exportType: "CSB_III", manifestNo: "M1" });
    expect(gen.ok).toBe(true);
    expect(gen.fileName).toContain("CSB_III");
  });
});

describe("webhook schemas (7C)", () => {
  it("accepts webhook with events", () => {
    const parsed = webhookSchema.parse({
      name: "Ops",
      endpoint_url: "https://example.com/hook",
      subscribed_events: ["SHIPMENT_BOOKED", "POD_UPDATED"],
      is_active: true,
    });
    expect(parsed.subscribed_events).toContain("SHIPMENT_BOOKED");
  });

  it("rejects unsupported events and bad URLs", () => {
    expect(() =>
      webhookSchema.parse({
        name: "Ops",
        endpoint_url: "ftp://bad",
        subscribed_events: ["SHIPMENT_BOOKED"],
      }),
    ).toThrow();
    expect(() =>
      webhookSchema.parse({
        name: "Ops",
        endpoint_url: "https://ok",
        subscribed_events: [],
      }),
    ).toThrow();
  });
});
