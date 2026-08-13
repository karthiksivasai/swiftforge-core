/**
 * Manifest Inscan resource — scan_manifest + board RPCs (0035).
 */
import { supabase } from "@/integrations/supabase/client";
import { translateDbError } from "@/lib/masters/core/baseCrud";
import { MANIFEST_PERMISSIONS } from "@/lib/permissions";
import {
  manifestInscanBagResultSchema,
  manifestInscanResultSchema,
  type ManifestInscanBagInput,
  type ManifestInscanBagResult,
  type ManifestInscanResult,
  type ManifestInscanScanInput,
} from "@/lib/transactions/schemas/manifestInscan";

export type ManifestInscanBoardLine = {
  seq: number;
  shipment_id: string;
  awb_no: string;
  forwarding_no?: string | null;
  bag_no: string | null;
  origin_name?: string | null;
  destination_name?: string | null;
  customer_name?: string | null;
  consignee_name?: string | null;
  pieces?: number | string | null;
  charge_weight?: number | string | null;
  shipment_status: string;
  scanned: boolean;
  inscan_at?: string | null;
  inscan_weight?: number | null;
  has_weight_discrepancy?: boolean;
};

export type ManifestInscanBoard = {
  manifest_id: string;
  manifest_no: string;
  status: string;
  scanned_count: number;
  pending_count: number;
  lines: ManifestInscanBoardLine[];
};

export const manifestInscanResource = {
  key: "manifest-inscan",
  permission: MANIFEST_PERMISSIONS.inscan,
  label: { singular: "Manifest Inscan", plural: "Manifest Inscans" },
};

export async function getManifestInscanBoard(manifestId: string): Promise<ManifestInscanBoard> {
  const { data, error } = await supabase.rpc("get_manifest_inscan_board", {
    p_manifest_id: manifestId,
  });
  if (error) throw translateDbError(error);
  const raw = data as Record<string, unknown>;
  return {
    manifest_id: String(raw.manifest_id),
    manifest_no: String(raw.manifest_no),
    status: String(raw.status),
    scanned_count: Number(raw.scanned_count ?? 0),
    pending_count: Number(raw.pending_count ?? 0),
    lines: ((raw.lines as any[]) ?? []).map((l) => ({
      seq: Number(l.seq),
      shipment_id: String(l.shipment_id),
      awb_no: String(l.awb_no),
      forwarding_no: l.forwarding_no ?? null,
      bag_no: l.bag_no ?? null,
      origin_name: l.origin_name ?? null,
      destination_name: l.destination_name ?? null,
      customer_name: l.customer_name ?? null,
      consignee_name: l.consignee_name ?? null,
      pieces: l.pieces ?? 1,
      charge_weight: l.charge_weight ?? 0,
      shipment_status: String(l.shipment_status),
      scanned: Boolean(l.scanned),
      inscan_at: l.inscan_at ?? null,
      inscan_weight: l.inscan_weight != null ? Number(l.inscan_weight) : null,
      has_weight_discrepancy: Boolean(l.has_weight_discrepancy),
    })),
  };
}

export async function scanManifest(input: ManifestInscanScanInput): Promise<ManifestInscanResult> {
  const { data, error } = await supabase.rpc("scan_manifest", {
    p_manifest_id: input.manifest_id,
    p_awb_no: input.awb_no ?? null,
    p_shipment_id: input.shipment_id ?? null,
    p_bag_no: input.bag_no ?? null,
    p_mode: input.mode ?? "AWB",
    p_weight: input.weight ?? null,
    p_length: input.length ?? null,
    p_breadth: input.breadth ?? null,
    p_height: input.height ?? null,
    p_vol_weight: input.vol_weight ?? null,
    p_remark: input.remark ?? null,
    p_is_booking_weight: input.is_booking_weight ?? false,
  });
  if (error) throw translateDbError(error);
  return manifestInscanResultSchema.parse(data);
}

export async function scanManifestBag(input: ManifestInscanBagInput): Promise<ManifestInscanBagResult> {
  const { data, error } = await supabase.rpc("scan_manifest_bag", {
    p_manifest_id: input.manifest_id,
    p_bag_no: input.bag_no,
  });
  if (error) throw translateDbError(error);
  return manifestInscanBagResultSchema.parse(data);
}
