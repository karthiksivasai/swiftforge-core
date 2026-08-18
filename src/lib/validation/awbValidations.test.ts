import { describe, expect, it } from "vitest";
import {
  validateAwbEntry,
  validateDocumentNoFormat,
  validateDocumentNoRequired,
  validatePaymentType,
  validateShipperContact,
  VALIDATION_CODES,
  VALIDATION_MESSAGES,
} from "./awbValidations";

describe("AWB Entry Validation Layer", () => {
  describe("Payment Type Validation", () => {
    it("fails when payment type is empty with exact message and code", () => {
      const res = validatePaymentType("");
      expect(res.valid).toBe(false);
      expect(res.code).toBe(VALIDATION_CODES.PAYMENT_TYPE_REQUIRED);
      expect(res.message).toBe("Payment type cant be empty..!!");
    });

    it("fails when payment type is 'Select'", () => {
      const res = validatePaymentType("Select");
      expect(res.valid).toBe(false);
      expect(res.message).toBe("Payment type cant be empty..!!");
    });

    it("passes when payment type is populated", () => {
      const res = validatePaymentType("Cash");
      expect(res.valid).toBe(true);
    });
  });

  describe("Document No Required Validation", () => {
    it("fails when document type is selected but document number is empty", () => {
      const res = validateDocumentNoRequired("Aadhaar Number", "");
      expect(res.valid).toBe(false);
      expect(res.code).toBe(VALIDATION_CODES.DOCUMENT_NO_REQUIRED);
      expect(res.message).toBe("Document No. cant be empty..!");
    });

    it("passes when document type is empty or Select", () => {
      const res = validateDocumentNoRequired("Select", "");
      expect(res.valid).toBe(true);
    });

    it("passes when both document type and document number are provided", () => {
      const res = validateDocumentNoRequired("Aadhaar Number", "894009342813");
      expect(res.valid).toBe(true);
    });
  });

  describe("Aadhaar Format Validation", () => {
    it("fails when Aadhaar is 11 digits with exact message", () => {
      const res = validateDocumentNoFormat("Aadhaar Number", "12345678901");
      expect(res.valid).toBe(false);
      expect(res.code).toBe(VALIDATION_CODES.DOCUMENT_NO_FORMAT);
      expect(res.message).toBe("Aadhaar Number should be 12 digit ..!");
    });

    it("fails when Aadhaar is 13 digits with exact message", () => {
      const res = validateDocumentNoFormat("Aadhaar Number", "1234567890123");
      expect(res.valid).toBe(false);
      expect(res.message).toBe("Aadhaar Number should be 12 digit ..!");
    });

    it("fails when Aadhaar contains non-digits", () => {
      const res = validateDocumentNoFormat("Aadhaar Number", "12345678901A");
      expect(res.valid).toBe(false);
      expect(res.message).toBe("Aadhaar Number should be 12 digit ..!");
    });

    it("passes when Aadhaar is exactly 12 digits", () => {
      const res = validateDocumentNoFormat("Aadhaar Number", "894009342813");
      expect(res.valid).toBe(true);
    });
  });

  describe("Shipper Contact Required Validation", () => {
    it("fails when shipper contact name, telephone, and mobile are all empty", () => {
      const res = validateShipperContact({ contactName: "", telephone: "", mobile: "" });
      expect(res.valid).toBe(false);
      expect(res.code).toBe(VALIDATION_CODES.SHIPPER_CONTACT_REQUIRED);
      expect(res.message).toBe("Shipper contact cant be empty..!");
    });

    it("passes when contact name is provided", () => {
      const res = validateShipperContact({ contactName: "Naveen Varma" });
      expect(res.valid).toBe(true);
    });

    it("passes when mobile number is provided", () => {
      const res = validateShipperContact({ mobile: "7672054518" });
      expect(res.valid).toBe(true);
    });
  });

  describe("validateAwbEntry Single-Failure Runner", () => {
    it("returns first failing validation in order (Payment Type before Document No)", () => {
      const res = validateAwbEntry({
        paymentType: "",
        documentType: "Aadhaar Number",
        documentNo: "",
        shipperContactName: "",
      });
      expect(res.valid).toBe(false);
      expect(res.code).toBe(VALIDATION_CODES.PAYMENT_TYPE_REQUIRED);
      expect(res.message).toBe("Payment type cant be empty..!!");
    });

    it("returns true for a fully valid AWB payload", () => {
      const res = validateAwbEntry({
        paymentType: "Cash",
        documentType: "Aadhaar Number",
        documentNo: "894009342813",
        shipperContactName: "BEJJAM GOPI CHAND",
        shipperMobile: "7672054518",
      });
      expect(res.valid).toBe(true);
    });
  });
});
