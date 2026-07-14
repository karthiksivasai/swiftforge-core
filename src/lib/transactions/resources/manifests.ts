/**
 * Manifest resource — list + save/close/cancel RPCs (0034).
 */
import { supabase } from "@/integrations/supabase/client";
import type { BaseRow } from "@/lib/masters/core/baseCrud";
import { ConflictError, translateDbError } from "@/lib/masters/core/baseCrud";
import { MANIFEST_PERMISSIONS } from "@/lib/permissions";
import type {
  ManifestAttachmentInput,
  ManifestCommentInput,
  ManifestFields,
  ManifestLineInput,
} from "@/lib/transactions/schemas/manifests";

export type ManifestStatus = "DRAFT" | "CLOSED" | "CANCELLED" | "OPEN" | "DISPATCHED" | "ARRIVED";

type NamedRef = { code: string; name: string } | null;

export type ManifestRow = BaseRow & {
  manifest_no: string;
  manifest_kind: string;
  manifest_date: string;
  manifest_time: string | null;
  to_type: "SERVICE_CENTER" | "THIRD_PARTY";
  to_service_center_id: string | null;
  vendor_id: string | null;
  origin_branch_id: string | null;
  location_code: string | null;
  connect_station: string | null;
  master_awb_no: string | null;
  cd_no: string | null;
  obc_name: string | null;
  total_bags: number;
  vendor_weight: number;
  reference_no: string | null;
  flight1: string | null;
  flight2: string | null;
  departure: string | null;
  arrival: string | null;
  remark: string | null;
  flight: string | null;
  status: ManifestStatus;
  status_at: string;
  is_locked: boolean;
  wizard_extras: Record<string, unknown>;
  service_centers: NamedRef;
  vendors: NamedRef;
  branches: NamedRef;
};

export type ManifestLineRow = {
  seq: number;
  shipment_id: string;
  awb_no: string;
  forwarding_no: string | null;
  bag_no: string | null;
  crn_mhbs_no: string | null;
  pieces: number;
  charge_weight: number;
  book_date: string | null;
  origin_code: string | null;
  origin_name: string | null;
  destination_code: string | null;
  destination_name: string | null;
  customer_code: string | null;
  customer_name: string | null;
  consignee_name: string | null;
  instruction: string | null;
  reference_no: string | null;
};

export type ManifestChildren = {
  lines: ManifestLineRow[];
  comments: { seq: number; comment: string; file_id: string | null; commented_at: string }[];
  attachments: { seq: number; file_id: string; label: string | null }[];
};

const MANIFEST_COLUMNS = `
  id, tenant_id, manifest_no, manifest_kind, manifest_date, manifest_time,
  to_type, to_service_center_id, vendor_id, origin_branch_id,
  location_code, connect_station, master_awb_no, cd_no, obc_name,
  total_bags, vendor_weight, reference_no,
  flight1, flight2, departure, arrival, remark, flight,
  status, status_at, is_locked, wizard_extras,
  created_at, created_by, updated_at, updated_by, deleted_at, row_version,
  service_centers:service_centers!manifests_to_sc_fk(code,name),
  vendors(code,name),
  branches:branches!manifests_origin_branch_fk(code,name)
`
  .replace(/\s+/g, " ")
  .trim();

export const manifestsResource = {
  key: "manifests",
  table: "manifests",
  permission: MANIFEST_PERMISSIONS.manifests,
  label: { singular: "Manifest", plural: "Manifests" },
  columns: MANIFEST_COLUMNS,
  searchColumns: ["manifest_no", "master_awb_no", "cd_no", "reference_no"] as const,
  orderBy: "manifest_date",
  ascending: false as const,
};

export async function listManifests(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
}): Promise<{ rows: ManifestRow[]; count: number }> {
  const page = Math.max(1, params?.page ?? 1);
  const pageSize = Math.min(Math.max(1, params?.pageSize ?? 100), 500);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("manifests")
    .select(MANIFEST_COLUMNS, { count: "exact" })
    .is("deleted_at", null);

  const search = params?.search?.trim();
  if (search) {
    const q = search.replace(/[%,()]/g, " ");
    query = query.or(
      `manifest_no.ilike.%${q}%,master_awb_no.ilike.%${q}%,cd_no.ilike.%${q}%,reference_no.ilike.%${q}%`,
    );
  }

  const { data, error, count } = await query
    .order("manifest_date", { ascending: false })
    .order("manifest_no", { ascending: false })
    .range(from, to);
  if (error) throw translateDbError(error);
  return { rows: (data ?? []) as unknown as ManifestRow[], count: count ?? 0 };
}

export async function fetchManifestChildren(manifestId: string): Promise<ManifestChildren> {
  const [lines, comments, attachments] = await Promise.all([
    supabase
      .from("manifest_lines")
      .select(
        "seq, shipment_id, awb_no, forwarding_no, bag_no, crn_mhbs_no, pieces, charge_weight, book_date, origin_code, origin_name, destination_code, destination_name, customer_code, customer_name, consignee_name, instruction, reference_no",
      )
      .eq("manifest_id", manifestId)
      .order("seq", { ascending: true }),
    supabase
      .from("manifest_comments")
      .select("seq, comment, file_id, commented_at")
      .eq("manifest_id", manifestId)
      .order("seq", { ascending: true }),
    supabase
      .from("manifest_attachments")
      .select("seq, file_id, label")
      .eq("manifest_id", manifestId)
      .order("seq", { ascending: true }),
  ]);
  for (const res of [lines, comments, attachments]) {
    if (res.error) throw new Error(res.error.message);
  }
  return {
    lines: (lines.data ?? []) as ManifestLineRow[],
    comments: (comments.data ?? []) as ManifestChildren["comments"],
    attachments: (attachments.data ?? []) as ManifestChildren["attachments"],
  };
}

export async function saveManifest(args: {
  id: string | null;
  rowVersion: number | null;
  fields: ManifestFields;
  lines?: ManifestLineInput[];
  comments?: ManifestCommentInput[];
  attachments?: ManifestAttachmentInput[];
}): Promise<ManifestRow> {
  const { data, error } = await supabase.rpc("save_manifest", {
    p_id: args.id,
    p_row_version: args.rowVersion,
    p_fields: args.fields,
    p_lines: args.lines ?? [],
    p_comments: args.comments ?? [],
    p_attachments: args.attachments ?? [],
  });
  if (error) {
    if (error.code === "40001") throw new ConflictError(error.message);
    throw translateDbError(error);
  }
  return data as ManifestRow;
}

export async function closeManifest(args: {
  id: string;
  rowVersion: number;
}): Promise<ManifestRow> {
  const { data, error } = await supabase.rpc("close_manifest", {
    p_id: args.id,
    p_row_version: args.rowVersion,
  });
  if (error) {
    if (error.code === "40001") throw new ConflictError(error.message);
    throw translateDbError(error);
  }
  return data as ManifestRow;
}

export async function cancelManifest(args: {
  id: string;
  rowVersion: number;
  reason?: string;
}): Promise<ManifestRow> {
  const { data, error } = await supabase.rpc("cancel_manifest", {
    p_id: args.id,
    p_row_version: args.rowVersion,
    p_reason: args.reason ?? null,
  });
  if (error) {
    if (error.code === "40001") throw new ConflictError(error.message);
    throw translateDbError(error);
  }
  return data as ManifestRow;
}
