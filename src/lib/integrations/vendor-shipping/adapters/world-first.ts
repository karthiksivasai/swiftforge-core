import {
  buildWfBookingPayload,
  callWorldFirstBookingApi,
  getWfClientConfig,
  DEFAULT_WF_VENDOR_CODE,
  type WfDecodedDocument,
} from "../../world-first-api";
import type {
  VendorBookRequest,
  VendorBookResult,
  VendorDocType,
  VendorDocumentDescriptor,
  VendorShippingAdapter,
} from "../types";

function toVendorDocType(docType: WfDecodedDocument["docType"]): VendorDocType {
  return docType === "AUX_LABEL" ? "OTHER" : docType;
}

export class WorldFirstAdapter implements VendorShippingAdapter {
  readonly providerCode = "WORLD_FIRST";
  supportsRegenerate = true;

  async book(request: VendorBookRequest): Promise<VendorBookResult> {
    const config = getWfClientConfig({
      vendorCode: DEFAULT_WF_VENDOR_CODE,
    });

    const form = {
      ...(request.context.shipment || {}),
      piecesLines: request.context.pieces || [],
      otp: request.otp || "",
    };

    const payload = buildWfBookingPayload(form, {}, config);
    const outcome = await callWorldFirstBookingApi(payload, config);

    if (outcome.success) {
      const documents: VendorDocumentDescriptor[] = outcome.documents.map((doc) => ({
        doc_type: toVendorDocType(doc.docType),
        label: doc.label,
        content_b64: doc.contentB64,
        mime_type: doc.mimeType,
        source_url: doc.dataUrl,
      }));

      return {
        status: "SUCCESS",
        message: outcome.message || "World-First AWB booking successful",
        vendorAwb: outcome.awbNo,
        vendorRef: outcome.refNo || payload.CustomerRefNo,
        vendorBookingId: outcome.awbNo || outcome.refNo,
        vendorTrackingNumber: outcome.awbNo,
        vendorProvider: "WORLD_FIRST",
        vendorServiceCode: payload.ServiceName,
        otpVerified: true,
        labelGenerated: documents.length > 0,
        syncStatus: "OK",
        apiStatus: "VENDOR_BOOKED",
        documents,
        rawResponse: outcome.rawResponse as Record<string, unknown>,
        request: payload as unknown as Record<string, unknown>,
      };
    }

    return {
      status: "ERROR",
      message: outcome.message,
      error: outcome.apiError || outcome.message,
      apiStatus: "FAILED",
      vendorProvider: "WORLD_FIRST",
      rawResponse: outcome.rawResponse as Record<string, unknown>,
      request: payload as unknown as Record<string, unknown>,
    };
  }
}
