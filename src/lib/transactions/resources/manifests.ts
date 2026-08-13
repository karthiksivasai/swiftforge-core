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
  attachments: {
    seq: number;
    file_id: string;
    label: string | null;
    original_name?: string | null;
    size_bytes?: number | null;
  }[];
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
      .select("seq, file_id, label, files(original_name, size_bytes)")
      .eq("manifest_id", manifestId)
      .order("seq", { ascending: true }),
  ]);
  for (const res of [lines, comments, attachments]) {
    if (res.error) throw new Error(res.error.message);
  }
  const mappedAttachments = (attachments.data ?? []).map((a: any) => ({
    seq: a.seq,
    file_id: a.file_id,
    label: a.label,
    original_name: a.files?.original_name || null,
    size_bytes: a.files?.size_bytes || null,
  }));
  return {
    lines: (lines.data ?? []) as ManifestLineRow[],
    comments: (comments.data ?? []) as ManifestChildren["comments"],
    attachments: mappedAttachments,
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

export async function recordManifestProgress(args: {
  manifestId: string;
  bagNo?: string | null;
  progressDate?: string;
  progressTime?: string | null;
  serviceCenterId?: string | null;
  serviceCenterCode?: string | null;
  exceptionCode?: string | null;
  mode?: "add" | "delete";
}): Promise<{ success: boolean; affected_shipments: number; manifest_no: string }> {
  const { data, error } = await supabase.rpc("record_manifest_progress", {
    p_manifest_id: args.manifestId,
    p_bag_no: args.bagNo || null,
    p_progress_date: args.progressDate || new Date().toISOString().slice(0, 10),
    p_progress_time: args.progressTime || null,
    p_service_center_id: args.serviceCenterId || null,
    p_service_center_code: args.serviceCenterCode || null,
    p_exception_code: args.exceptionCode || null,
    p_mode: args.mode || "add",
  });
  if (error) throw translateDbError(error);
  return data as { success: boolean; affected_shipments: number; manifest_no: string };
}

export async function uploadManifestAttachment(args: {
  manifestId: string;
  originalName: string;
  mime: string;
  sizeBytes: number;
  storageKey: string;
  label?: string | null;
}): Promise<{ file_id: string; seq: number; original_name: string }> {
  const { data, error } = await supabase.rpc("upload_manifest_attachment", {
    p_manifest_id: args.manifestId,
    p_original_name: args.originalName,
    p_mime: args.mime,
    p_size_bytes: args.sizeBytes,
    p_storage_key: args.storageKey,
    p_label: args.label || null,
  });
  if (error) throw translateDbError(error);
  return data as { file_id: string; seq: number; original_name: string };
}

export type ManifestScanShipmentValidation = {
  valid: boolean;
  error?: string;
  line?: ManifestLineRow & {
    id: string;
    refNo: string;
    awbNo: string;
    forwardingNo: string;
    crnMhbsNo: string;
    bagNo: string;
    pieces: string;
    chargeWeight: string;
    bookDate: string;
    origin: string;
    destination: string;
    code: string;
    customer: string;
    consignee: string;
    instruction: string;
  };
};

/**
 * Validates and fetches a shipment for addition to an outbound manifest.
 * Enforces:
 *  1. Status is BOOKED or PICKUP_INSCANNED (0030/0101)
 *  2. is_held = false with hold reason reporting (0101)
 *  3. International KYC gate (0104)
 *  4. Active manifest idempotency / cross-manifest conflict guard (0034/0101)
 *  5. Returns real shipment fields (pieces, weight, customer, consignee, etc.)
 */
export async function fetchShipmentForManifestScan(args: {
  scanInput: string;
  currentManifestId?: string | null;
  existingShipmentIds?: string[];
  existingAwbNos?: string[];
  bagNo?: string;
  crnMhbsNo?: string;
  forwardingNo?: string;
}): Promise<ManifestScanShipmentValidation> {
  const scan = args.scanInput.trim();
  if (!scan) {
    return { valid: false, error: "AWB or Forwarding No is required" };
  }

  // Check duplicate in current draft
  if (
    args.existingAwbNos?.some(
      (a) => a.toLowerCase() === scan.toLowerCase()
    )
  ) {
    return {
      valid: false,
      error: `Shipment "${scan}" is already added to this manifest`,
    };
  }

  const cleanScan = scan.replace(/[%,()]/g, "");
  const { data: shipments, error } = await supabase
    .from("shipments")
    .select(`
      id,
      awb_no,
      reference_no,
      forwarding_awb,
      book_date,
      current_status,
      is_held,
      is_hold,
      hold_reason,
      pieces,
      charge_weight,
      instruction,
      destination_id,
      origin_destination_id,
      shipper,
      consignee,
      customers(id, code, name),
      destination:destinations!shipments_destination_id_fkey(id, code, name, dest_type),
      origin:destinations!shipments_origin_destination_id_fkey(id, code, name),
      branches:branches!shipments_branch_id_fkey(id, code, name),
      shipment_attachments(id, file_id)
    `)
    .or(`awb_no.eq.${cleanScan},forwarding_awb.eq.${cleanScan},reference_no.eq.${cleanScan}`)
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    return { valid: false, error: translateDbError(error).message };
  }

  if (!shipments || shipments.length === 0) {
    return { valid: false, error: `Shipment not found for "${scan}"` };
  }

  const ship = shipments[0] as any;

  // Duplicate in current draft check by shipment id
  if (args.existingShipmentIds?.includes(ship.id)) {
    return {
      valid: false,
      error: `Shipment ${ship.awb_no} is already added to this manifest`,
    };
  }

  // 1. Status gate (BOOKED or PICKUP_INSCANNED only)
  if (ship.current_status === "DRAFT") {
    return {
      valid: false,
      error: `DRAFT shipments cannot be manifested (AWB ${ship.awb_no}). Complete AWB booking first.`,
    };
  }
  if (ship.current_status === "CANCELLED" || ship.current_status === "VOID") {
    return {
      valid: false,
      error: `Cancelled shipment cannot be manifested (AWB ${ship.awb_no} is ${ship.current_status}).`,
    };
  }
  if (
    ship.current_status !== "BOOKED" &&
    ship.current_status !== "PICKUP_INSCANNED"
  ) {
    return {
      valid: false,
      error: `Only BOOKED or PICKUP_INSCANNED shipments may be manifested (AWB ${ship.awb_no} is ${ship.current_status}).`,
    };
  }

  // 2. Hold gate (0101)
  const isHeld = Boolean(ship.is_held || ship.is_hold);
  if (isHeld) {
    const reason = ship.hold_reason?.trim() || "HOLD";
    return {
      valid: false,
      error: `Shipment is on HOLD (reason: ${reason}) and cannot be manifested (AWB ${ship.awb_no}).`,
    };
  }

  // 3. International KYC gate (0104)
  const destType = ship.destination?.dest_type || "DOMESTIC";
  if (String(destType).toUpperCase() === "INTERNATIONAL") {
    const shipper = (ship.shipper && typeof ship.shipper === "object" ? ship.shipper : {}) as Record<string, unknown>;
    const hasKycDoc = Boolean(
      shipper.documentNo ||
      shipper.document_no ||
      shipper.iecNo ||
      shipper.iec_no ||
      shipper.pan ||
      shipper.gstin ||
      shipper.aadhaar
    );
    const hasAttachments = Array.isArray(ship.shipment_attachments) && ship.shipment_attachments.length > 0;
    if (!hasKycDoc && !hasAttachments) {
      return {
        valid: false,
        error: `International shipment must have at least one valid KYC document attached before it can be manifested (AWB ${ship.awb_no}).`,
      };
    }
  }

  // 4. Cross-manifest active check (0034/0101)
  let manifestCheck = supabase
    .from("manifest_lines")
    .select("manifest_id, manifests!manifest_lines_manifest_fk(manifest_no, status, deleted_at)")
    .eq("shipment_id", ship.id)
    .is("deleted_at", null);

  if (args.currentManifestId) {
    manifestCheck = manifestCheck.neq("manifest_id", args.currentManifestId);
  }

  const { data: existingLines, error: lineCheckError } = await manifestCheck;
  if (!lineCheckError && existingLines && existingLines.length > 0) {
    const activeLine = existingLines.find(
      (l: any) => l.manifests && l.manifests.status !== "CANCELLED" && !l.manifests.deleted_at
    );
    if (activeLine) {
      const activeManifestNo = (activeLine as any).manifests?.manifest_no || "another manifest";
      return {
        valid: false,
        error: `Shipment ${ship.awb_no} is already on active manifest ${activeManifestNo}`,
      };
    }
  }

  // 5. Construct real line item
  const consigneeObj = (ship.consignee && typeof ship.consignee === "object" ? ship.consignee : {}) as Record<string, unknown>;
  const consigneeName = String(
    consigneeObj.name ||
    consigneeObj.company_name ||
    consigneeObj.contact_name ||
    ""
  );
  const customerObj = (ship.customers && typeof ship.customers === "object" ? ship.customers : {}) as Record<string, unknown>;

  const bookDateFormatted = ship.book_date
    ? String(ship.book_date).includes("-")
      ? ship.book_date.split("-").reverse().join("/")
      : String(ship.book_date)
    : "";

  const line: any = {
    id: crypto.randomUUID(),
    seq: (args.existingShipmentIds?.length ?? 0) + 1,
    shipment_id: ship.id,
    shipmentId: ship.id,
    awb_no: ship.awb_no,
    awbNo: ship.awb_no,
    reference_no: ship.reference_no ?? null,
    refNo: ship.reference_no ?? "",
    forwarding_no: args.forwardingNo?.trim() || ship.forwarding_awb || `FWD${ship.awb_no}`,
    forwardingNo: args.forwardingNo?.trim() || ship.forwarding_awb || `FWD${ship.awb_no}`,
    crn_mhbs_no: args.crnMhbsNo?.trim() || null,
    crnMhbsNo: args.crnMhbsNo?.trim() || "",
    bag_no: args.bagNo?.trim() || null,
    bagNo: args.bagNo?.trim() || "",
    pieces: String(ship.pieces ?? 1),
    charge_weight: ship.charge_weight ?? 0,
    chargeWeight: String(ship.charge_weight ?? 0),
    book_date: ship.book_date ?? null,
    bookDate: bookDateFormatted,
    origin_code: ship.origin?.code || ship.branches?.code || "HYD",
    origin_name: ship.origin?.name || ship.branches?.name || "HYDERABAD",
    origin: ship.origin?.name || ship.origin?.code || ship.branches?.code || "HYD",
    destination_code: ship.destination?.code || "",
    destination_name: ship.destination?.name || "",
    destination: ship.destination?.name || ship.destination?.code || "",
    customer_code: String(customerObj.code ?? ""),
    code: String(customerObj.code ?? ""),
    customer_name: String(customerObj.name ?? ""),
    customer: String(customerObj.name ?? ""),
    consignee_name: consigneeName,
    consignee: consigneeName,
    instruction: ship.instruction ?? "",
  };

  return { valid: true, line };
}
