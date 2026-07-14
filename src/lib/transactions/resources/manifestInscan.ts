/**
 * Manifest Inscan resource — scan_manifest + board RPCs (0035).
 */
import { supabase } from "@/integrations/supabase/client";
import { translateDbError } from "@/lib/masters/core/baseCrud";
import { MANIFEST_PERMISSIONS } from "@/lib/permissions";
import {
  manifestInscanResultSchema,
  type ManifestInscanResult,
  type ManifestInscanScanInput,
} from "@/lib/transactions/schemas/manifestInscan";

export type ManifestInscanBoardLine = {
  seq: number;
  shipment_id: string;
  awb_no: string;
  bag_no: string | null;
  shipment_status: string;
  scanned: boolean;
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
    lines: ((raw.lines as ManifestInscanBoardLine[]) ?? []).map((l) => ({
      seq: Number(l.seq),
      shipment_id: String(l.shipment_id),
      awb_no: String(l.awb_no),
      bag_no: l.bag_no ?? null,
      shipment_status: String(l.shipment_status),
      scanned: Boolean(l.scanned),
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
  });
  if (error) throw translateDbError(error);
  return manifestInscanResultSchema.parse(data);
}
