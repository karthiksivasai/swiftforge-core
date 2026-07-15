import { describe, expect, it } from "vitest";

import {
  getSmsProvider,
  getWhatsappProvider,
  SandboxSmsProvider,
  SandboxWhatsappProvider,
} from "@/lib/notifications/delivery";
import {
  emailConfigurationSchema,
  notificationPreferenceSchema,
  notificationTemplateSchema,
  userNotificationSchema,
} from "@/lib/notifications/schemas";

describe("notifications / email configuration schemas", () => {
  it("accepts valid email configuration", () => {
    const parsed = emailConfigurationSchema.parse({
      smtp_host: "smtp.example.com",
      smtp_port: 587,
      sender_email: "noreply@example.com",
    });
    expect(parsed.use_ssl).toBe(true);
    expect(parsed.status).toBe("ACTIVE");
  });

  it("rejects invalid sender email", () => {
    expect(() =>
      emailConfigurationSchema.parse({
        smtp_host: "smtp.example.com",
        sender_email: "not-an-email",
      }),
    ).toThrow();
  });

  it("accepts valid notification template", () => {
    const parsed = notificationTemplateSchema.parse({
      code: "BOOKING_EMAIL",
      name: "Booking",
      notification_type: "BOOKING",
      channel: "EMAIL",
      body: "Hello",
    });
    expect(parsed.channel).toBe("EMAIL");
  });

  it("accepts preference toggles", () => {
    const parsed = notificationPreferenceSchema.parse({
      notification_type: "OTP",
      email_enabled: false,
      sms_enabled: true,
    });
    expect(parsed.sms_enabled).toBe(true);
    expect(parsed.whatsapp_enabled).toBe(false);
  });

  it("requires notification title", () => {
    expect(() => userNotificationSchema.parse({ title: "" })).toThrow();
    const parsed = userNotificationSchema.parse({
      title: "Alert",
      username: "admin",
      message: "Hello",
    });
    expect(parsed.title).toBe("Alert");
  });
});

describe("notifications / delivery providers (7D)", () => {
  it("defaults SMS and WhatsApp to sandbox stubs", async () => {
    const sms = getSmsProvider();
    const wa = getWhatsappProvider();
    expect(sms).toBeInstanceOf(SandboxSmsProvider);
    expect(wa).toBeInstanceOf(SandboxWhatsappProvider);
    expect(sms.name).toBe("SANDBOX");
    expect(wa.name).toBe("SANDBOX");
    const smsResult = await sms.send({ to: "9000000000", body: "OTP 123456" });
    const waResult = await wa.send({ to: "9000000000", body: "Delivered" });
    expect(smsResult.ok).toBe(true);
    expect(waResult.ok).toBe(true);
  });
});
