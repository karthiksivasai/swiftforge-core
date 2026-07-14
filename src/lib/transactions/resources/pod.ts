/**
 * POD resource — save/update/cancel + get_pod_by_awb RPCs (0038).
 */
import { supabase } from "@/integrations/supabase/client";
import { ConflictError, translateDbError } from "@/lib/masters/core/baseCrud";
import { POD_PERMISSIONS } from "@/lib/permissions";
import { podFieldsSchema, type PodFields, type PodRecord } from "@/lib/transactions/schemas/pod";

export type PodLookupResult = {
  found: boolean;
  awb_no?: string;
  shipment_id?: string;
  current_status?: string;
  pod_status?: string | null;
  pod_date?: string | null;
  pod_receiver?: string | null;
  pod_remark?: string | null;
  delivered_at?: string | null;
  receiver?: string | null;
  pod?: {
    id: string;
    row_version: number;
    pod_date: string;
    receiver_name: string;
    remark: string | null;
    status: string;
    signature_file_id: string | null;
    photo_file_id: string | null;
    source: string;
  } | null;
};

export const podResource = {
  key: "pod",
  table: "pod_records",
  permission: POD_PERMISSIONS.podEntry,
  label: { singular: "POD", plural: "PODs" },
};

function mapPodRow(raw: Record<string, unknown>): PodRecord {
  return {
    id: String(raw.id),
    row_version: Number(raw.row_version),
    awb_no: String(raw.awb_no),
    shipment_id: String(raw.shipment_id),
    pod_date: String(raw.pod_date),
    receiver_name: String(raw.receiver_name),
    remark: (raw.remark as string | null) ?? null,
    status: raw.status as PodRecord["status"],
    signature_file_id: (raw.signature_file_id as string | null) ?? null,
    photo_file_id: (raw.photo_file_id as string | null) ?? null,
    source: (raw.source as PodRecord["source"]) ?? "MANUAL",
  };
}

export async function getPodByAwb(awbNo: string): Promise<PodLookupResult> {
  const { data, error } = await supabase.rpc("get_pod_by_awb", {
    p_awb_no: awbNo.trim(),
  });
  if (error) throw translateDbError(error);
  if (data == null) return { found: false, awb_no: awbNo.trim() };
  const raw = data as Record<string, unknown>;
  const podRaw = raw.pod as Record<string, unknown> | null | undefined;
  return {
    found: Boolean(raw.found),
    awb_no: raw.awb_no ? String(raw.awb_no) : awbNo.trim(),
    shipment_id: raw.shipment_id ? String(raw.shipment_id) : undefined,
    current_status: raw.current_status ? String(raw.current_status) : undefined,
    pod_status: (raw.pod_status as string | null) ?? null,
    pod_date: (raw.pod_date as string | null) ?? null,
    pod_receiver: (raw.pod_receiver as string | null) ?? null,
    pod_remark: (raw.pod_remark as string | null) ?? null,
    delivered_at: (raw.delivered_at as string | null) ?? null,
    receiver: (raw.receiver as string | null) ?? null,
    pod: podRaw
      ? {
          id: String(podRaw.id),
          row_version: Number(podRaw.row_version),
          pod_date: String(podRaw.pod_date),
          receiver_name: String(podRaw.receiver_name),
          remark: (podRaw.remark as string | null) ?? null,
          status: String(podRaw.status),
          signature_file_id: (podRaw.signature_file_id as string | null) ?? null,
          photo_file_id: (podRaw.photo_file_id as string | null) ?? null,
          source: String(podRaw.source ?? "MANUAL"),
        }
      : null,
  };
}

export async function savePod(input: {
  shipment_id?: string | null;
  awb_no?: string | null;
  fields: PodFields;
}): Promise<PodRecord> {
  const fields = podFieldsSchema.parse(input.fields);
  const { data, error } = await supabase.rpc("save_pod", {
    p_shipment_id: input.shipment_id ?? null,
    p_awb_no: input.awb_no ?? null,
    p_fields: fields,
  });
  if (error) throw translateDbError(error);
  return mapPodRow(data as Record<string, unknown>);
}

export async function updatePod(input: {
  id: string;
  row_version: number;
  fields: Partial<PodFields>;
}): Promise<PodRecord> {
  const { data, error } = await supabase.rpc("update_pod", {
    p_id: input.id,
    p_row_version: input.row_version,
    p_fields: input.fields,
  });
  if (error) throw translateDbError(error);
  if (!data) throw new ConflictError();
  return mapPodRow(data as Record<string, unknown>);
}

export async function cancelPod(input: {
  id: string;
  row_version: number;
  reason?: string | null;
}): Promise<PodRecord> {
  const { data, error } = await supabase.rpc("cancel_pod", {
    p_id: input.id,
    p_row_version: input.row_version,
    p_reason: input.reason ?? null,
  });
  if (error) throw translateDbError(error);
  if (!data) throw new ConflictError();
  return mapPodRow(data as Record<string, unknown>);
}
