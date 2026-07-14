/**
 * Tracking resource — timeline / progress / comment / hold RPCs (0039).
 */
import { supabase } from "@/integrations/supabase/client";
import { ConflictError, translateDbError } from "@/lib/masters/core/baseCrud";
import { TRACKING_PERMISSIONS } from "@/lib/permissions";
import {
  trackingCommentSchema,
  trackingHoldSchema,
  trackingProgressSchema,
  type TrackingCommentFields,
  type TrackingHoldFields,
  type TrackingProgressFields,
} from "@/lib/transactions/schemas/tracking";

export type ShipmentTrackingResult = {
  found: boolean;
  awb_no?: string;
  current_status?: string;
  is_hold?: boolean;
  shipment?: Record<string, unknown>;
  tracking_events?: Array<Record<string, unknown>>;
  shipment_events?: Array<Record<string, unknown>>;
  comments?: Array<Record<string, unknown>>;
  holds?: Array<Record<string, unknown>>;
  pod?: Record<string, unknown> | null;
};

export const trackingResource = {
  key: "tracking",
  permission: TRACKING_PERMISSIONS.awbQuery,
  label: { singular: "Tracking", plural: "Tracking" },
};

export async function getShipmentTracking(awbNo: string): Promise<ShipmentTrackingResult> {
  const { data, error } = await supabase.rpc("get_shipment_tracking", {
    p_awb_no: awbNo.trim(),
  });
  if (error) throw translateDbError(error);
  if (data == null) return { found: false, awb_no: awbNo.trim() };
  return data as ShipmentTrackingResult;
}

export async function addTrackingProgress(input: {
  awb_no: string;
  fields: TrackingProgressFields;
}): Promise<Record<string, unknown>> {
  const fields = trackingProgressSchema.parse(input.fields);
  const { data, error } = await supabase.rpc("add_tracking_progress", {
    p_awb_no: input.awb_no.trim(),
    p_fields: fields,
  });
  if (error) throw translateDbError(error);
  return (data ?? {}) as Record<string, unknown>;
}

export async function addTrackingComment(input: {
  awb_no: string;
  fields: TrackingCommentFields;
}): Promise<Record<string, unknown>> {
  const fields = trackingCommentSchema.parse(input.fields);
  const { data, error } = await supabase.rpc("add_tracking_comment", {
    p_awb_no: input.awb_no.trim(),
    p_fields: fields,
  });
  if (error) throw translateDbError(error);
  return (data ?? {}) as Record<string, unknown>;
}

export async function holdShipment(input: {
  awb_no: string;
  row_version: number;
  fields: TrackingHoldFields;
}): Promise<Record<string, unknown>> {
  const fields = trackingHoldSchema.parse(input.fields);
  const { data, error } = await supabase.rpc("hold_shipment", {
    p_awb_no: input.awb_no.trim(),
    p_row_version: input.row_version,
    p_fields: fields,
  });
  if (error) throw translateDbError(error);
  if (!data) throw new ConflictError();
  return data as Record<string, unknown>;
}

export async function releaseShipmentHold(input: {
  awb_no: string;
  row_version: number;
  fields: TrackingHoldFields;
}): Promise<Record<string, unknown>> {
  const fields = trackingHoldSchema.parse(input.fields);
  const { data, error } = await supabase.rpc("release_shipment_hold", {
    p_awb_no: input.awb_no.trim(),
    p_row_version: input.row_version,
    p_fields: fields,
  });
  if (error) throw translateDbError(error);
  if (!data) throw new ConflictError();
  return data as Record<string, unknown>;
}
