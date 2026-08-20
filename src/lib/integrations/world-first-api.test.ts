import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildWfBookingPayload,
  callWorldFirstBookingApi,
  clearWfIdempotencyState,
  DEFAULT_WF_VENDOR_CODE,
  formatNum3,
  formatPieces3,
  getWfClientConfig,
  parseWfBookingResponse,
  validateWfBookingRequest,
  type WfBookingResponse,
} from "./world-first-api";

describe("World-First (Xpresion) AWB Booking API Service & Security Fixes", () => {
  beforeEach(() => {
    clearWfIdempotencyState();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearWfIdempotencyState();
    vi.restoreAllMocks();
  });

  describe("PROBLEM 1: Client Credentials & Config Security", () => {
    it("client config contains NO credentials (no userId, password, or customerCode)", () => {
      const config = getWfClientConfig();
      expect(config).toHaveProperty("serverEndpoint");
      expect(config).toHaveProperty("vendorCode");
      expect(config).not.toHaveProperty("userId");
      expect(config).not.toHaveProperty("password");
      expect(config).not.toHaveProperty("customerCode");
      expect(config.serverEndpoint).toBe("/api/shipping/world-first/book");
    });

    it("buildWfBookingPayload creates request payload WITHOUT client credentials", () => {
      const payload = buildWfBookingPayload({
        bookingRef: "REF-TEST-001",
        shipper: { companyName: "Test Shipper" },
      });

      expect(payload.UserID).toBeUndefined();
      expect(payload.Password).toBeUndefined();
      expect(payload.CustomerCode).toBeUndefined();
      expect(payload.CustomerRefNo).toBe("REF-TEST-001");
      expect(payload.VendorName).toBe("WFT");
    });
  });

  describe("PROBLEM 2: Vendor Code Correction (WFT)", () => {
    it("defaults vendor code to real system vendor code WFT", () => {
      expect(DEFAULT_WF_VENDOR_CODE).toBe("WFT");
      const config = getWfClientConfig();
      expect(config.vendorCode).toBe("WFT");

      const payload = buildWfBookingPayload({});
      expect(payload.VendorName).toBe("WFT");
    });
  });

  describe("PROBLEM 3: Idempotency & Retry Safety", () => {
    it("blocks duplicate submission for the same in-flight CustomerRefNo", async () => {
      // Mock fetch hanging/delaying
      const globalFetch = vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(
            () =>
              resolve(
                Response.json({
                  success: true,
                  awbNo: "WF-1001",
                  message: "Success",
                  documents: [],
                }),
              ),
            200,
          );
        });
      });
      vi.stubGlobal("fetch", globalFetch);

      const payload = buildWfBookingPayload({
        bookingRef: "REF-IDEM-001",
        doxSpx: "DOX",
      });

      // Call 1 (starts in-flight)
      const call1 = callWorldFirstBookingApi(payload);

      // Call 2 with SAME CustomerRefNo while call 1 is in-flight
      const call2 = await callWorldFirstBookingApi(payload);

      expect(call2.success).toBe(false);
      expect(call2.apiStatus).toBe("IDEMPOTENCY_BLOCKED");
      expect(call2.message).includes("CustomerRefNo \"REF-IDEM-001\" is currently in-flight");

      await call1;
    });

    it("returns completed result without resending HTTP request when CustomerRefNo already succeeded", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        Response.json({
          success: true,
          awbNo: "WF-CACHED-99",
          refNo: "REF-IDEM-002",
          message: "AWB Booked",
          documents: [],
        }),
      );
      vi.stubGlobal("fetch", mockFetch);

      const payload = buildWfBookingPayload({
        bookingRef: "REF-IDEM-002",
        doxSpx: "DOX",
      });

      const firstResult = await callWorldFirstBookingApi(payload);
      expect(firstResult.success).toBe(true);
      expect(firstResult.awbNo).toBe("WF-CACHED-99");
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call with same ref
      const secondResult = await callWorldFirstBookingApi(payload);
      expect(secondResult.success).toBe(true);
      expect(secondResult.awbNo).toBe("WF-CACHED-99");
      // Fetch count should STILL be 1 (not resent)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("retries ONLY when NO response is received (network error) and caps at 1 retry", async () => {
      const mockFetch = vi
        .fn()
        .mockRejectedValueOnce(new TypeError("Failed to fetch (network error)"))
        .mockResolvedValueOnce(
          Response.json({
            success: true,
            awbNo: "WF-RETRY-OK",
            message: "Success on attempt 2",
            documents: [],
          }),
        );
      vi.stubGlobal("fetch", mockFetch);

      const payload = buildWfBookingPayload({
        bookingRef: "REF-RETRY-001",
        doxSpx: "DOX",
      });

      const result = await callWorldFirstBookingApi(payload);
      expect(result.success).toBe(true);
      expect(result.awbNo).toBe("WF-RETRY-OK");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("NEVER retries when an HTTP response (4xx/5xx) is received from server", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "WF upstream Error 500",
      });
      vi.stubGlobal("fetch", mockFetch);

      const payload = buildWfBookingPayload({
        bookingRef: "REF-HTTP-500",
        doxSpx: "DOX",
      });

      const result = await callWorldFirstBookingApi(payload);
      expect(result.success).toBe(false);
      expect(result.apiStatus).toBe("HTTP_500");

      // Must NOT retry after receiving HTTP 500 response!
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("Formatting & Core Response Parsing", () => {
    it("formats pieces as 3-digit padded string and numbers to 3 decimals", () => {
      expect(formatPieces3(1)).toBe("001");
      expect(formatPieces3("5")).toBe("005");
      expect(formatNum3(12.5)).toBe("012.500");
      expect(formatNum3("3.2")).toBe("003.200");
    });

    it("parses successful response and decodes base64 document attachments", () => {
      const mockSuccess: WfBookingResponse = {
        Status: "Success",
        ErrorCode: "0",
        Message: "AWB Created Successfully",
        AWBNo: "WF-99887766",
        RefNo: "BOOK-1001",
        LabelFileType: "pdf",
        Pdfdownload: "JVBERi0xLjQKJ...",
        Label: "JVBERi0xLjQKJ...",
        Performa: "JVBERi0xLjQKJ...",
        BoxLabel: "JVBERi0xLjQKJ...",
      };

      const result = parseWfBookingResponse(mockSuccess);
      expect(result.success).toBe(true);
      expect(result.awbNo).toBe("WF-99887766");
      expect(result.refNo).toBe("BOOK-1001");
      expect(result.documents.length).toBeGreaterThan(0);
      expect(result.documents[0].mimeType).toBe("application/pdf");
      expect(result.documents[0].dataUrl.startsWith("data:application/pdf;base64,")).toBe(true);
    });
  });
});
