/**
 * FE facade for Vendor Shipping — AWB Entry imports only this module.
 */
import { supabase } from "@/integrations/supabase/client";
import { resolveAdapterForIntegration } from "./registry";
import type {
  VendorActivityEvent,
  VendorApiStatus,
  VendorBookResult,
  VendorDocumentRow,
  VendorIntegrationRow,
  VendorShippingContext,
  VendorSyncStatus,
} from "./types";

function asObject(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
}

function asArray<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

export async function getVendorShippingContext(
  shipmentId: string,
): Promise<VendorShippingContext> {
  const { data, error } = await supabase.rpc("get_vendor_shipping_context", {
    p_shipment_id: shipmentId,
  });
  if (error) throw new Error(error.message);
  const raw = asObject(data);
  const integ = raw.integration ? asObject(raw.integration) : null;
  return {
    shippingApiEnabled: raw.shipping_api_enabled === true,
    shipment: asObject(raw.shipment),
    pieces: asArray<Record<string, unknown>>(raw.pieces),
    charges: asArray<Record<string, unknown>>(raw.charges),
    integration: integ
      ? {
          id: String(integ.id ?? ""),
          provider_code: String(integ.provider_code ?? ""),
          endpoint_url: (integ.endpoint_url as string | null) ?? null,
          requires_otp: integ.requires_otp !== false,
          account_number: (integ.account_number as string | null) ?? null,
          customer_code: (integ.customer_code as string | null) ?? null,
          enabled_services: asArray<string>(integ.enabled_services),
          supported_products: asArray<string>(integ.supported_products),
          credential_id: (integ.credential_id as string | null) ?? null,
          username: (integ.username as string | null) ?? null,
          has_username: integ.has_username === true,
          sandbox_mode: integ.sandbox_mode !== false,
        }
      : null,
  };
}

export async function setVendorApiStatus(args: {
  shipmentId: string;
  rowVersion: number;
  status: VendorApiStatus;
  eventType?: string;
  message?: string;
}): Promise<{ row_version: number; vendor_api_status: string }> {
  const { data, error } = await supabase.rpc("set_vendor_api_status", {
    p_shipment_id: args.shipmentId,
    p_row_version: args.rowVersion,
    p_status: args.status,
    p_event_type: args.eventType ?? null,
    p_message: args.message ?? null,
  });
  if (error) throw new Error(error.message);
  const raw = asObject(data);
  return {
    row_version: Number(raw.row_version ?? args.rowVersion),
    vendor_api_status: String(raw.vendor_api_status ?? args.status),
  };
}

async function applyVendorResult(args: {
  shipmentId: string;
  rowVersion: number;
  result: VendorBookResult;
}): Promise<{ row_version: number; vendor_api_status: string }> {
  const apiStatus =
    args.result.apiStatus ??
    (args.result.status === "SUCCESS"
      ? "VENDOR_BOOKED"
      : args.result.status === "OTP_REQUIRED"
        ? "OTP_REQUIRED"
        : "VENDOR_PENDING");

  const payload = {
    status: apiStatus,
    message: args.result.message,
    event_type:
      args.result.status === "SUCCESS"
        ? "VENDOR_BOOKING_SUCCESS"
        : args.result.status === "OTP_REQUIRED"
          ? "OTP_REQUESTED"
          : "BOOKING_FAILED",
    vendor_awb: args.result.vendorAwb ?? null,
    vendor_ref: args.result.vendorRef ?? null,
    vendor_booking_id: args.result.vendorBookingId ?? null,
    vendor_tracking_number: args.result.vendorTrackingNumber ?? null,
    vendor_provider: args.result.vendorProvider ?? null,
    vendor_service_code: args.result.vendorServiceCode ?? null,
    otp_verified: args.result.otpVerified ?? false,
    label_generated: args.result.labelGenerated ?? false,
    sync_status: (args.result.syncStatus ?? "IDLE") as VendorSyncStatus,
    error: args.result.error ?? null,
    raw_response: args.result.rawResponse ?? {},
    request: args.result.request ?? null,
    documents: (args.result.documents ?? []).map((d) => ({
      doc_type: d.doc_type,
      label: d.label ?? null,
      source_url: d.source_url ?? null,
      content_b64: d.content_b64 ?? null,
      mime_type: d.mime_type ?? "application/pdf",
      raw_meta: d.raw_meta ?? {},
    })),
  };

  const { data, error } = await supabase.rpc("apply_vendor_shipping_result", {
    p_shipment_id: args.shipmentId,
    p_row_version: args.rowVersion,
    p_result: payload,
  });
  if (error) throw new Error(error.message);
  const raw = asObject(data);
  return {
    row_version: Number(raw.row_version ?? args.rowVersion),
    vendor_api_status: String(raw.vendor_api_status ?? apiStatus),
  };
}

async function bookViaEdge(args: {
  shipmentId: string;
  action: "book" | "verify_otp" | "retry";
  otp?: string;
}): Promise<VendorBookResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke("vendor-shipping", {
      body: {
        action: args.action,
        shipmentId: args.shipmentId,
        otp: args.otp ?? null,
      },
    });
    if (error) return null;
    const raw = asObject(data);
    if (!raw.status) return null;
    return {
      status: raw.status as VendorBookResult["status"],
      message: String(raw.message ?? ""),
      vendorAwb: (raw.vendorAwb as string) ?? undefined,
      vendorRef: (raw.vendorRef as string) ?? undefined,
      vendorBookingId: (raw.vendorBookingId as string) ?? undefined,
      vendorTrackingNumber: (raw.vendorTrackingNumber as string) ?? undefined,
      vendorProvider: (raw.vendorProvider as string) ?? undefined,
      vendorServiceCode: (raw.vendorServiceCode as string) ?? undefined,
      otpVerified: raw.otpVerified === true,
      labelGenerated: raw.labelGenerated === true,
      syncStatus: (raw.syncStatus as VendorSyncStatus) ?? undefined,
      documents: asArray(raw.documents),
      rawResponse: asObject(raw.rawResponse),
      request: asObject(raw.request),
      error: (raw.error as string) ?? undefined,
      apiStatus: (raw.apiStatus as VendorApiStatus) ?? undefined,
    };
  } catch {
    return null;
  }
}

async function bookViaLocalAdapter(args: {
  shipmentId: string;
  otp?: string | null;
}): Promise<VendorBookResult> {
  const context = await getVendorShippingContext(args.shipmentId);
  if (!context.shippingApiEnabled || !context.integration) {
    return {
      status: "ERROR",
      message: "Vendor shipping API is not enabled for this vendor.",
      error: "NOT_CONFIGURED",
      apiStatus: "NONE",
    };
  }
  const adapter = resolveAdapterForIntegration(context.integration.provider_code);
  return adapter.book({
    context,
    otp: args.otp,
    credentials: {
      username: context.integration.username,
      password: null,
      customerCode: context.integration.customer_code,
      accountNumber: context.integration.account_number,
      endpointUrl: context.integration.endpoint_url,
      sandboxMode: context.integration.sandbox_mode !== false,
    },
  });
}

export type VendorBookingOutcome = {
  result: VendorBookResult;
  rowVersion: number;
  vendorApiStatus: string;
};

/** Start or continue vendor booking after internal confirm_booking. */
export async function startVendorBooking(args: {
  shipmentId: string;
  rowVersion: number;
  otp?: string | null;
  isRetry?: boolean;
}): Promise<VendorBookingOutcome> {
  let rowVersion = args.rowVersion;

  const pending = await setVendorApiStatus({
    shipmentId: args.shipmentId,
    rowVersion,
    status: "PENDING_CONFIRMATION",
    eventType: args.isRetry ? "RETRY_ATTEMPT" : "VENDOR_BOOKING_STARTED",
    message: args.isRetry ? "Retry vendor booking" : "Vendor booking started",
  });
  rowVersion = pending.row_version;

  const progress = await setVendorApiStatus({
    shipmentId: args.shipmentId,
    rowVersion,
    status: "BOOKING_IN_PROGRESS",
    eventType: "API_REQUEST_SENT",
    message: "Booking Shipment…",
  });
  rowVersion = progress.row_version;

  const action = args.otp ? "verify_otp" : args.isRetry ? "retry" : "book";
  let result =
    (await bookViaEdge({
      shipmentId: args.shipmentId,
      action,
      otp: args.otp ?? undefined,
    })) ?? (await bookViaLocalAdapter({ shipmentId: args.shipmentId, otp: args.otp }));

  if (args.otp && result.status === "SUCCESS") {
    result = { ...result, otpVerified: true };
  }

  const applied = await applyVendorResult({
    shipmentId: args.shipmentId,
    rowVersion,
    result,
  });

  return {
    result,
    rowVersion: applied.row_version,
    vendorApiStatus: applied.vendor_api_status,
  };
}

export async function verifyVendorOtp(args: {
  shipmentId: string;
  rowVersion: number;
  otp: string;
}): Promise<VendorBookingOutcome> {
  return startVendorBooking({
    shipmentId: args.shipmentId,
    rowVersion: args.rowVersion,
    otp: args.otp,
  });
}

export async function retryVendorBooking(args: {
  shipmentId: string;
  rowVersion: number;
}): Promise<VendorBookingOutcome> {
  return startVendorBooking({
    shipmentId: args.shipmentId,
    rowVersion: args.rowVersion,
    isRetry: true,
  });
}

export async function listVendorDocuments(shipmentId: string): Promise<VendorDocumentRow[]> {
  const { data, error } = await supabase.rpc("list_shipment_vendor_documents", {
    p_shipment_id: shipmentId,
  });
  if (error) throw new Error(error.message);
  return asArray<Record<string, unknown>>(data).map((d) => ({
    id: String(d.id ?? ""),
    doc_type: d.doc_type as VendorDocumentRow["doc_type"],
    label: (d.label as string) ?? null,
    file_id: (d.file_id as string) ?? null,
    source_url: (d.source_url as string) ?? null,
    content_b64: (d.content_b64 as string) ?? null,
    mime_type: (d.mime_type as string) ?? null,
    raw_meta: asObject(d.raw_meta),
    created_at: String(d.created_at ?? ""),
  }));
}

export async function listVendorActivity(shipmentId: string): Promise<VendorActivityEvent[]> {
  const { data, error } = await supabase.rpc("list_shipment_vendor_activity", {
    p_shipment_id: shipmentId,
  });
  if (error) throw new Error(error.message);
  return asArray<Record<string, unknown>>(data).map((a) => ({
    id: String(a.id ?? ""),
    event_type: String(a.event_type ?? ""),
    message: String(a.message ?? ""),
    created_at: String(a.created_at ?? ""),
    created_by: (a.created_by as string) ?? null,
  }));
}

export async function resyncVendorDocuments(args: {
  shipmentId: string;
  rowVersion: number;
}): Promise<VendorBookingOutcome> {
  // Re-run booking in sync-only fashion: retry path re-fetches provider docs when available
  return retryVendorBooking(args);
}

export async function listVendorIntegrations(): Promise<VendorIntegrationRow[]> {
  const { data, error } = await supabase.rpc("list_vendor_integrations");
  if (error) throw new Error(error.message);
  const rows = asArray<Record<string, unknown>>(asObject(data).rows);
  return rows.map((r) => ({
    id: String(r.id ?? ""),
    provider_code: String(r.provider_code ?? ""),
    credential_id: (r.credential_id as string) ?? null,
    endpoint_url: (r.endpoint_url as string) ?? null,
    is_enabled: r.is_enabled !== false,
    requires_otp: r.requires_otp !== false,
    account_number: (r.account_number as string) ?? null,
    customer_code: (r.customer_code as string) ?? null,
    enabled_services: asArray<string>(r.enabled_services),
    supported_products: asArray<string>(r.supported_products),
    mapped_vendor_ids: asArray<string>(r.mapped_vendor_ids),
    remark: (r.remark as string) ?? null,
    row_version: Number(r.row_version ?? 1),
    updated_at: r.updated_at ? String(r.updated_at) : undefined,
  }));
}

export async function saveVendorIntegration(args: {
  id?: string | null;
  rowVersion?: number | null;
  fields: Record<string, unknown>;
}): Promise<VendorIntegrationRow> {
  const { data, error } = await supabase.rpc("save_vendor_integration", {
    p_id: args.id ?? null,
    p_row_version: args.rowVersion ?? null,
    p_fields: args.fields,
  });
  if (error) throw new Error(error.message);
  const r = asObject(data);
  return {
    id: String(r.id ?? ""),
    provider_code: String(r.provider_code ?? ""),
    credential_id: (r.credential_id as string) ?? null,
    endpoint_url: (r.endpoint_url as string) ?? null,
    is_enabled: r.is_enabled !== false,
    requires_otp: r.requires_otp !== false,
    account_number: (r.account_number as string) ?? null,
    customer_code: (r.customer_code as string) ?? null,
    enabled_services: asArray<string>(r.enabled_services),
    supported_products: asArray<string>(r.supported_products),
    mapped_vendor_ids: asArray<string>(r.mapped_vendor_ids),
    remark: (r.remark as string) ?? null,
    row_version: Number(r.row_version ?? 1),
  };
}
