import { describe, expect, it } from "vitest";

import { EMAIL_MODULE_OPTIONS, SHIPMENT_EMAIL_MODULES } from "@/lib/utility-setup/email-modules";
import { FORM_SETUP_MODULES } from "@/lib/utility-setup/form-setup";
import {
  creditLimitPercentageSchema,
  entryLockDateSchema,
  invoiceLastNoSchema,
  setupEmailConfigSchema,
  suggestedSslPort,
} from "@/lib/utility-setup/schemas";

const validEmail = {
  smtpServer: "smtp.example.com",
  smtpPort: "465",
  fromEmail: "ops@example.com",
  mailUserId: "ops@example.com",
  mailPassword: "secret",
  messageDear: "Dear Sir/Madam,",
  messageSubject: "Booking",
  messageBody: "Your shipment is booked.",
  ssl: true,
};

describe("utility setup schemas", () => {
  it("matches the live Setup module list and keeps booking and delivery email", () => {
    expect([...EMAIL_MODULE_OPTIONS]).toEqual([
      "EMAIL ON FORWARDING",
      "EMAIL ON PROGRESS",
      "ESTATEMENT",
      "ESTATEMENT WEIGHT ALERT",
      "KYC XPRESION",
      "E-MAIL FOOTER",
    ]);
    expect([...SHIPMENT_EMAIL_MODULES]).toEqual(["EMAIL ON BOOKING", "EMAIL ON DELIVERY"]);
    expect([...FORM_SETUP_MODULES]).toEqual([
      "AWB Entry",
      "Manifest",
      "Scan",
      "PickUp Inscan",
      "AWB Query",
      "DRS Scan",
      "PickUp",
      "RCP Entry",
    ]);
  });

  it("accepts a branch invoice last number of zero or more", () => {
    expect(invoiceLastNoSchema.parse({ invoice_no: "0" }).invoice_no).toBe("0");
    expect(invoiceLastNoSchema.parse({ invoice_no: "223" }).invoice_no).toBe("223");
  });

  it("rejects a blank, decimal, or negative invoice number", () => {
    expect(() => invoiceLastNoSchema.parse({ invoice_no: "" })).toThrow();
    expect(() => invoiceLastNoSchema.parse({ invoice_no: "12.5" })).toThrow();
    expect(() => invoiceLastNoSchema.parse({ invoice_no: "-1" })).toThrow();
    expect(() => invoiceLastNoSchema.parse({ invoice_no: "12a" })).toThrow();
  });

  it("allows a blank entry lock date and rejects an impossible date", () => {
    expect(entryLockDateSchema.parse({ entry_lock_date: "" }).entry_lock_date).toBe("");
    expect(entryLockDateSchema.parse({ entry_lock_date: "2018-12-12" }).entry_lock_date).toBe(
      "2018-12-12",
    );
    expect(() => entryLockDateSchema.parse({ entry_lock_date: "2018-02-31" })).toThrow();
    expect(() => entryLockDateSchema.parse({ entry_lock_date: "12/12/2018" })).toThrow();
  });

  it("requires a credit-limit percentage from 0 to 100", () => {
    expect(creditLimitPercentageSchema.parse({ percentage: "0" }).percentage).toBe("0");
    expect(creditLimitPercentageSchema.parse({ percentage: "100" }).percentage).toBe("100");
    expect(creditLimitPercentageSchema.parse({ percentage: "80.5" }).percentage).toBe("80.5");
    expect(() => creditLimitPercentageSchema.parse({ percentage: "" })).toThrow();
    expect(() => creditLimitPercentageSchema.parse({ percentage: "101" })).toThrow();
    expect(() => creditLimitPercentageSchema.parse({ percentage: "-1" })).toThrow();
  });

  it("requires every SMTP field and allows port 587 with SSL off or on", () => {
    expect(setupEmailConfigSchema(true).parse(validEmail).smtpServer).toBe("smtp.example.com");
    expect(() => setupEmailConfigSchema(true).parse({ ...validEmail, mailPassword: "" })).toThrow(
      /Mail Password/,
    );
    expect(() =>
      setupEmailConfigSchema(true).parse({ ...validEmail, fromEmail: "not-an-email" }),
    ).toThrow(/email/);
    expect(() =>
      setupEmailConfigSchema(true).parse({ ...validEmail, smtpServer: "not a host" }),
    ).toThrow(/hostname/);
    expect(() => setupEmailConfigSchema(true).parse({ ...validEmail, smtpPort: "" })).toThrow(
      /SMTP Port/,
    );
    expect(() => setupEmailConfigSchema(true).parse({ ...validEmail, messageBody: "  " })).toThrow(
      /Message Body/,
    );
    const starttls = setupEmailConfigSchema(true).parse({
      ...validEmail,
      ssl: true,
      smtpPort: "587",
    });
    expect(starttls.ssl).toBe(true);
    expect(starttls.smtpPort).toBe("587");
    expect(suggestedSslPort(true, "")).toBe("465");
    expect(suggestedSslPort(true, "587")).toBeNull();
    expect(suggestedSslPort(false, "")).toBeNull();
  });

  it("keeps an existing password when the update leaves it blank", () => {
    const parsed = setupEmailConfigSchema(false).parse({ ...validEmail, mailPassword: "" });
    expect(parsed.mailPassword).toBe("");
  });

  it("allows a non-SSL port other than 465", () => {
    const parsed = setupEmailConfigSchema(true).parse({
      ...validEmail,
      ssl: false,
      smtpPort: "587",
    });
    expect(parsed.ssl).toBe(false);
    expect(parsed.smtpPort).toBe("587");
  });
});
