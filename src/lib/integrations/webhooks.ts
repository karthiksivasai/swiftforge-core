/**
 * Webhooks + public tracking — Milestone 7C.
 */
import { supabase } from "@/integrations/supabase/client";
import { ConflictError, translateDbError } from "@/lib/masters/core/baseCrud";

export const WEBHOOK_EVENT_OPTIONS = [
  { code: "SHIPMENT_BOOKED", label: "Shipment Booked" },
  { code: "SHIPMENT_CANCELLED", label: "Shipment Cancelled" },
  { code: "SHIPMENT_DELIVERED", label: "Shipment Delivered" },
  { code: "SHIPMENT_UNDELIVERED", label: "Shipment Undelivered" },
  { code: "POD_UPDATED", label: "POD Updated" },
  { code: "TRACKING_UPDATED", label: "Tracking Updated" },
] as const;

export type WebhookEventCode = (typeof WEBHOOK_EVENT_OPTIONS)[number]["code"];

export type WebhookRow = {
  id: string;
  name: string;
  endpoint_url: string;
  subscribed_events: string[];
  is_active: boolean;
  remark: string | null;
  has_signing_secret: boolean;
  row_version: number;
  created_at?: string;
  updated_at?: string;
};

export type WebhookDeliveryRow = {
  id: string;
  webhook_id: string;
  event_type: string;
  response_status: number | null;
  latency_ms: number | null;
  attempt_number: number;
  error_message: string | null;
  created_at: string;
  payload?: Record<string, unknown>;
};

export type PublicTrackingResult = {
  found: boolean;
  shipment_number?: string;
  carrier_tracking_number?: string | null;
  current_status?: string;
  origin?: string;
  destination?: string;
  carrier_name?: string;
  pod_status?: string | null;
  estimated_delivery?: string | null;
  tracking_timeline?: Array<Record<string, unknown>>;
  shipment_timeline?: Array<Record<string, unknown>>;
};

export type WebhookFields = {
  name: string;
  endpoint_url: string;
  subscribed_events: string[];
  is_active?: boolean;
  remark?: string | null;
  signing_secret?: string | null;
  regenerate_secret?: boolean;
};

function asObject(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return {};
}

function asArray<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

function throwRpcError(error: { code?: string; message: string }): never {
  if (error.code === "40001" || error.code === "CMS04") {
    if (/Optimistic lock/i.test(error.message)) throw new ConflictError(error.message);
  }
  throw translateDbError(error as Parameters<typeof translateDbError>[0]);
}

function mapWebhook(row: Record<string, unknown>): WebhookRow {
  const events = row.subscribed_events;
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    endpoint_url: String(row.endpoint_url ?? ""),
    subscribed_events: Array.isArray(events) ? events.map(String) : asArray<string>(events),
    is_active: row.is_active !== false && row.is_active !== "false",
    remark: (row.remark as string | null) ?? null,
    has_signing_secret: row.has_signing_secret === true || row.has_signing_secret === "true",
    row_version: Number(row.row_version ?? 1),
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export async function listWebhooks(): Promise<WebhookRow[]> {
  const { data, error } = await supabase.rpc("list_webhooks");
  if (error) throw translateDbError(error);
  return asArray<Record<string, unknown>>(asObject(data).rows).map(mapWebhook);
}

export async function getWebhook(id: string): Promise<WebhookRow | null> {
  const { data, error } = await supabase.rpc("get_webhook", { p_id: id });
  if (error) throw translateDbError(error);
  if (data == null) return null;
  return mapWebhook(asObject(data));
}

export async function saveWebhook(params: {
  fields: WebhookFields;
  id?: string | null;
  rowVersion?: number | null;
}): Promise<WebhookRow> {
  const payload: Record<string, unknown> = { ...params.fields };
  if (!payload.signing_secret || String(payload.signing_secret).trim() === "") {
    delete payload.signing_secret;
  }
  const { data, error } = await supabase.rpc("save_webhook", {
    p_fields: payload,
    p_id: params.id ?? null,
    p_row_version: params.rowVersion ?? null,
  });
  if (error) throwRpcError(error);
  return mapWebhook(asObject(data));
}

export async function deleteWebhook(id: string, rowVersion?: number | null): Promise<void> {
  const { error } = await supabase.rpc("delete_webhook", {
    p_id: id,
    p_row_version: rowVersion ?? null,
  });
  if (error) throwRpcError(error);
}

export async function dispatchWebhook(params: {
  webhookId: string;
  eventType: string;
  data?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc("dispatch_webhook", {
    p_webhook_id: params.webhookId,
    p_event_type: params.eventType,
    p_data: params.data ?? {},
  });
  if (error) throwRpcError(error);
  return asObject(data);
}

export async function listWebhookDeliveries(
  webhookId: string,
  limit = 50,
): Promise<WebhookDeliveryRow[]> {
  const { data, error } = await supabase.rpc("list_webhook_deliveries", {
    p_webhook_id: webhookId,
    p_limit: limit,
  });
  if (error) throw translateDbError(error);
  return asArray<Record<string, unknown>>(asObject(data).rows).map((row) => ({
    id: String(row.id ?? ""),
    webhook_id: String(row.webhook_id ?? ""),
    event_type: String(row.event_type ?? ""),
    response_status: row.response_status != null ? Number(row.response_status) : null,
    latency_ms: row.latency_ms != null ? Number(row.latency_ms) : null,
    attempt_number: Number(row.attempt_number ?? 1),
    error_message: (row.error_message as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    payload: asObject(row.payload),
  }));
}

/** Unauthenticated public tracking (anon-safe RPC). */
export async function publicTrackShipment(params: {
  awbNo?: string | null;
  carrierTrackingNo?: string | null;
}): Promise<PublicTrackingResult> {
  const { data, error } = await supabase.rpc("public_track_shipment", {
    p_awb_no: params.awbNo ?? null,
    p_carrier_tracking_no: params.carrierTrackingNo ?? null,
  });
  if (error) throw translateDbError(error);
  const row = asObject(data);
  return {
    found: row.found === true,
    shipment_number: row.shipment_number ? String(row.shipment_number) : undefined,
    carrier_tracking_number: (row.carrier_tracking_number as string | null) ?? null,
    current_status: row.current_status ? String(row.current_status) : undefined,
    origin: row.origin != null ? String(row.origin) : undefined,
    destination: row.destination != null ? String(row.destination) : undefined,
    carrier_name: row.carrier_name != null ? String(row.carrier_name) : undefined,
    pod_status: (row.pod_status as string | null) ?? null,
    estimated_delivery: (row.estimated_delivery as string | null) ?? null,
    tracking_timeline: asArray(row.tracking_timeline),
    shipment_timeline: asArray(row.shipment_timeline),
  };
}
