/**
 * PostShipping (DTDC) Vendor Shipping Adapter
 * Handles dry-run / preview payload generation and live PostShipping API booking via server-side Edge Function.
 * Station keys and third-party tokens are stored strictly server-side.
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  VendorBookRequest,
  VendorBookResult,
  VendorShippingAdapter,
  VendorDocumentDescriptor,
  VendorSyncStatus,
  VendorApiStatus,
} from "../../types";
import { buildPostShippingPayload } from "./mapper";

export class PostShippingAdapter implements VendorShippingAdapter {
  readonly providerCode = "POSTSHIPPING";
  supportsRegenerate = true;

  async book(request: VendorBookRequest): Promise<VendorBookResult> {
    const { context } = request;
    const shipment = context.shipment;
    const shipmentId = String(shipment.id || "");
    const vendorId = String(shipment.vendor_id || "");
    const serviceCode = String(shipment.service_code || shipment.service || "");
    const awbNo = String(shipment.awb_no || "PREVIEW_AWB");

    // 1. Fetch vendor carrier metadata (safe client-facing RPC — no raw secret keys)
    let carrierConfig: {
      configured?: boolean;
      vendor_code?: string;
      carrier_provider?: string;
      api_base_url?: string;
      station_code?: string;
      is_live_mode?: boolean;
      has_station_key?: boolean;
      has_service_token?: boolean;
    } = {};

    if (vendorId) {
      try {
        const { data, error } = await supabase.rpc("get_vendor_carrier_config", {
          p_vendor_id: vendorId,
          p_service_code: serviceCode || null,
        });
        if (!error && data) {
          carrierConfig = data as typeof carrierConfig;
        }
      } catch (err) {
        console.warn("Failed to fetch vendor carrier config:", err);
      }
    }

    const baseUrl = carrierConfig.api_base_url || "https://api.postshipping.com/api2";
    const endpoint = `${baseUrl.replace(/\/+$/, "")}/shipments`;
    const isLiveMode = Boolean(carrierConfig.is_live_mode);
    const stationCode = carrierConfig.station_code || "MEL";

    // 2. Try server-side Edge Function booking first (handles both live and dry-run with server-stored secrets)
    if (shipmentId) {
      try {
        const { data, error } = await supabase.functions.invoke("vendor-shipping", {
          body: {
            action: "book",
            shipmentId,
          },
        });

        if (!error && data && typeof data === "object") {
          const raw = data as Record<string, unknown>;
          if (raw.status) {
            return {
              status: raw.status as VendorBookResult["status"],
              message: String(raw.message ?? ""),
              vendorAwb: (raw.vendorAwb as string) ?? undefined,
              vendorRef: (raw.vendorRef as string) ?? undefined,
              vendorBookingId: (raw.vendorBookingId as string) ?? undefined,
              vendorTrackingNumber: (raw.vendorTrackingNumber as string) ?? undefined,
              vendorProvider: (raw.vendorProvider as string) ?? "POSTSHIPPING",
              vendorServiceCode: (raw.vendorServiceCode as string) ?? serviceCode,
              otpVerified: true,
              labelGenerated: raw.labelGenerated === true,
              syncStatus: (raw.syncStatus as VendorSyncStatus) ?? "OK",
              documents: (Array.isArray(raw.documents) ? raw.documents : []) as VendorDocumentDescriptor[],
              rawResponse: (raw.rawResponse as Record<string, unknown>) ?? {},
              request: (raw.request as Record<string, unknown>) ?? null,
              error: (raw.error as string) ?? undefined,
              apiStatus: (raw.apiStatus as VendorApiStatus) ?? undefined,
            };
          }
        }
      } catch (edgeErr) {
        console.warn("Edge function vendor-shipping invocation error:", edgeErr);
      }
    }

    // 3. Client-side DRY-RUN / PREVIEW fallback (e.g. offline dev or mock preview)
    const { body, tokenMissing, warnings } = buildPostShippingPayload(context, "");
    const previewRef = `DTDC-PREVIEW-${awbNo}`;

    if (!isLiveMode) {
      return {
        status: "SUCCESS",
        message: "PostShipping request payload generated (DRY-RUN / PREVIEW mode — no live wallet charge)",
        vendorAwb: previewRef,
        vendorRef: String(shipment.reference_no || awbNo),
        vendorBookingId: `DRYRUN-${Date.now()}`,
        vendorTrackingNumber: previewRef,
        vendorProvider: "POSTSHIPPING",
        vendorServiceCode: serviceCode,
        otpVerified: true,
        labelGenerated: false,
        syncStatus: "OK",
        apiStatus: "VENDOR_BOOKED",
        request: {
          endpoint,
          headers: {
            Token: "(server-side only)",
            "Content-Type": "application/json",
          },
          body,
        },
        rawResponse: {
          mode: "DRY_RUN",
          endpoint,
          stationCode,
          tokenMissing: !carrierConfig.has_service_token,
          warnings: carrierConfig.has_service_token
            ? warnings.filter((w) => !w.includes("ThirdPartyToken"))
            : warnings,
          simulatedPayload: body,
        },
        documents: [],
      };
    }

    // 4. If live mode is enabled but Edge function is unreachable
    return {
      status: "ERROR",
      message: "Live PostShipping booking must be executed through the secure server environment.",
      error: "Edge function connection required for live booking",
      apiStatus: "FAILED",
      vendorProvider: "POSTSHIPPING",
      request: {
        endpoint,
        headers: {
          Token: "(server-side only)",
          "Content-Type": "application/json",
        },
        body,
      },
    };
  }
}
