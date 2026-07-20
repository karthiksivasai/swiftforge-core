import type {
  VendorBookRequest,
  VendorBookResult,
  VendorDocumentDescriptor,
  VendorShippingAdapter,
} from "../../types";
import { mapContextToXpresionPayload, parseXpresionResponse } from "./mapper";

const DEFAULT_ENDPOINT = "https://xpresion.courierwalaexpress.in/api/v1/Awbentry/Awbentry";

function docsFromParsed(parsed: ReturnType<typeof parseXpresionResponse>): VendorDocumentDescriptor[] {
  const docs: VendorDocumentDescriptor[] = [];
  if (parsed.authorityLetterUrl) {
    docs.push({
      doc_type: "AUTHORITY_LETTER",
      label: "Authority Letter",
      source_url: parsed.authorityLetterUrl,
    });
  }
  if (parsed.vendorAwbUrl || parsed.pdfUrl || parsed.awb || parsed.forwardingNo) {
    docs.push({
      doc_type: "VENDOR_AWB",
      label: "Vendor AWB",
      source_url: parsed.vendorAwbUrl || parsed.pdfUrl,
      raw_meta: { awb: parsed.awb, forwardingNo: parsed.forwardingNo },
    });
  }
  if (parsed.vendorInvoiceUrl || parsed.performaUrl) {
    docs.push({
      doc_type: "VENDOR_INVOICE",
      label: "Vendor Invoice",
      source_url: parsed.vendorInvoiceUrl || parsed.performaUrl,
    });
  }
  if (parsed.labelUrl || parsed.pdfUrl) {
    docs.push({
      doc_type: "SHIPPING_LABEL",
      label: "AWB Label",
      source_url: parsed.labelUrl || parsed.pdfUrl,
    });
  }
  if (parsed.boxLabelUrl) {
    docs.push({
      doc_type: "BOX_LABEL",
      label: "Box Label",
      source_url: parsed.boxLabelUrl,
    });
  }
  return docs;
}

/** Sandbox path when credentials missing or sandbox_mode — exercises OTP UX. */
function sandboxBook(request: VendorBookRequest): VendorBookResult {
  const otp = (request.otp ?? "").trim();
  const expected = (request.sandboxExpectedOtp ?? "").trim();
  const awbBase = String(request.context.shipment.awb_no ?? "SANDBOX");
  if (!otp) {
    return {
      status: "OTP_REQUIRED",
      message: "An OTP has been sent to the shipper mobile number.",
      apiStatus: "OTP_REQUIRED",
      vendorProvider: "XPRESION",
      rawResponse: { Status: "OTP", Message: "OTP required (sandbox)" },
    };
  }
  const otpOk = expected ? otp === expected : otp === "123456";
  if (!otpOk) {
    return {
      status: "ERROR",
      message: "Invalid OTP. Please try again.",
      error: "Invalid OTP",
      apiStatus: "OTP_REQUIRED",
      vendorProvider: "XPRESION",
      rawResponse: { Status: "ERROR", Message: "Invalid OTP (sandbox)" },
    };
  }
  const vendorAwb = `VX${awbBase}`.slice(0, 20);
  return {
    status: "SUCCESS",
    message: "Vendor booking successful (sandbox)",
    vendorAwb,
    vendorRef: String(request.context.shipment.reference_no ?? awbBase),
    vendorBookingId: `SB-${Date.now()}`,
    vendorTrackingNumber: vendorAwb,
    vendorProvider: "XPRESION",
    vendorServiceCode: String(request.context.shipment.service ?? ""),
    otpVerified: true,
    labelGenerated: true,
    syncStatus: "OK",
    apiStatus: "VENDOR_BOOKED",
    // No blank sandbox PDFs — Authority Letter / AWB Label / Invoice are app-generated.
    documents: [],
    rawResponse: { Status: "SUCCESS", AWBNo: vendorAwb, ForwardingNo: vendorAwb, sandbox: true },
  };
}

export class XpresionAdapter implements VendorShippingAdapter {
  readonly providerCode = "XPRESION";
  supportsRegenerate = true;

  async book(request: VendorBookRequest): Promise<VendorBookResult> {
    const creds = request.credentials ?? {};
    const endpoint = (creds.endpointUrl || DEFAULT_ENDPOINT).trim();
    const canLive = Boolean(creds.username && creds.password && endpoint.startsWith("http"));
    // Sandbox only when explicitly enabled, or when live credentials are missing.
    const sandbox = creds.sandboxMode === true || !canLive;

    if (sandbox) {
      return sandboxBook(request);
    }

    const payload = mapContextToXpresionPayload(request.context, creds, request.otp);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let raw: Record<string, unknown> = {};
      try {
        raw = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        raw = { Status: res.ok ? "SUCCESS" : "ERROR", Message: text.slice(0, 500) };
      }

      const parsed = parseXpresionResponse(raw);
      if (parsed.otpRequired) {
        return {
          status: "OTP_REQUIRED",
          message: parsed.message || "An OTP has been sent to your registered mobile number.",
          apiStatus: "OTP_REQUIRED",
          vendorProvider: this.providerCode,
          request: { ...payload, Password: "***", OTP: request.otp ? "***" : "" },
          rawResponse: raw,
        };
      }
      if (!parsed.success) {
        return {
          status: "ERROR",
          message: parsed.message || "Vendor booking failed",
          error: parsed.message,
          apiStatus: "VENDOR_PENDING",
          vendorProvider: this.providerCode,
          request: { ...payload, Password: "***" },
          rawResponse: raw,
        };
      }

      const vendorAwb = parsed.forwardingNo || parsed.awb;
      return {
        status: "SUCCESS",
        message: parsed.message || "Vendor booking successful",
        vendorAwb,
        vendorRef: parsed.refNo,
        vendorBookingId: parsed.refNo || vendorAwb,
        vendorTrackingNumber: vendorAwb,
        vendorProvider: this.providerCode,
        vendorServiceCode: String(request.context.shipment.service ?? ""),
        otpVerified: Boolean(request.otp),
        labelGenerated: Boolean(parsed.labelUrl || parsed.pdfUrl),
        syncStatus: "OK",
        apiStatus: "VENDOR_BOOKED",
        documents: docsFromParsed(parsed),
        request: { ...payload, Password: "***", OTP: request.otp ? "***" : "" },
        rawResponse: raw,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Vendor API unavailable";
      return {
        status: "ERROR",
        message: "Vendor booking failed. Shipment has been saved locally.",
        error: msg,
        apiStatus: "VENDOR_PENDING",
        vendorProvider: this.providerCode,
      };
    }
  }
}
