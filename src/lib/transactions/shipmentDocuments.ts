/**
 * Shipment Documents Center — catalog + client for versioned shipment files.
 * UI is provider-agnostic; adapters only save into this store.
 */
import { supabase } from "@/integrations/supabase/client";

export type ShipmentDocumentType =
  | "AUTHORITY_LETTER"
  | "AWB_LABEL"
  | "INVOICE"
  | "VENDOR_AWB"
  | "VENDOR_INVOICE"
  | "KYC"
  | "OTHER";

export type ShipmentDocumentStatus =
  | "AVAILABLE"
  | "GENERATING"
  | "WAITING"
  | "FAILED"
  | "NOT_REQUIRED";

export type ShipmentDocumentSource = "SYSTEM" | "VENDOR" | "USER_UPLOAD";

export type ShipmentDocumentItem = {
  type: ShipmentDocumentType;
  title: string;
  status: ShipmentDocumentStatus;
  id?: string | null;
  url?: string | null;
  contentB64?: string | null;
  /** Client-only HTML preview (system generators). Prefer over PDF iframe. */
  htmlPreview?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  version?: number | null;
  source?: ShipmentDocumentSource | null;
  vendor?: string | null;
  createdAt?: string | null;
  available: boolean;
  hasContent?: boolean;
};

export const SHIPMENT_DOCUMENT_CATALOG: ReadonlyArray<{
  type: ShipmentDocumentType;
  title: string;
}> = [
  { type: "AUTHORITY_LETTER", title: "Authority Letter" },
  { type: "AWB_LABEL", title: "AWB Label" },
  { type: "INVOICE", title: "Invoice" },
  { type: "VENDOR_AWB", title: "Vendor AWB" },
  { type: "VENDOR_INVOICE", title: "Vendor Invoice" },
  { type: "KYC", title: "KYC" },
] as const;

export const DOCUMENT_STATUS_LABELS: Record<ShipmentDocumentStatus, string> = {
  AVAILABLE: "Available",
  GENERATING: "Generating",
  WAITING: "Waiting",
  FAILED: "Failed",
  NOT_REQUIRED: "Not required",
};

function asArray<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

function mapDocRow(row: Record<string, unknown>): ShipmentDocumentItem {
  return {
    type: String(row.type ?? "OTHER") as ShipmentDocumentType,
    title: String(row.title ?? row.type ?? "Document"),
    status: String(row.status ?? "WAITING") as ShipmentDocumentStatus,
    id: row.id != null ? String(row.id) : null,
    url: (row.url as string) ?? null,
    contentB64: (row.content_b64 as string) ?? null,
    fileName: (row.fileName as string) ?? null,
    mimeType: (row.mimeType as string) ?? "application/pdf",
    fileSize: row.fileSize != null ? Number(row.fileSize) : null,
    version: row.version != null ? Number(row.version) : null,
    source: (row.source as ShipmentDocumentSource) ?? null,
    vendor: (row.vendor as string) ?? null,
    createdAt: row.createdAt != null ? String(row.createdAt) : null,
    available: row.available === true,
    hasContent: row.hasContent === true || row.content_b64 != null,
  };
}

export async function listShipmentDocuments(
  shipmentId: string,
): Promise<ShipmentDocumentItem[]> {
  const { data, error } = await supabase.rpc("list_shipment_documents", {
    p_shipment_id: shipmentId,
  });
  if (error) throw new Error(error.message);
  return asArray<Record<string, unknown>>(data).map(mapDocRow);
}

/** Load file bytes for one document type (list no longer embeds content_b64). */
export async function getShipmentDocument(
  shipmentId: string,
  documentType: ShipmentDocumentType | string,
): Promise<ShipmentDocumentItem | null> {
  const { data, error } = await supabase.rpc("get_shipment_document", {
    p_shipment_id: shipmentId,
    p_document_type: documentType,
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const title =
    SHIPMENT_DOCUMENT_CATALOG.find((c) => c.type === String(row.type))?.title ??
    String(row.type ?? "Document");
  return mapDocRow({ ...row, title, available: row.available === true });
}

export async function saveShipmentDocument(args: {
  shipmentId: string;
  documentType: ShipmentDocumentType;
  source?: ShipmentDocumentSource;
  vendor?: string | null;
  fileName?: string | null;
  fileUrl?: string | null;
  contentB64?: string | null;
  mimeType?: string | null;
  status?: ShipmentDocumentStatus;
  rawMeta?: Record<string, unknown>;
}): Promise<string> {
  const { data, error } = await supabase.rpc("save_shipment_document", {
    p_shipment_id: args.shipmentId,
    p_fields: {
      document_type: args.documentType,
      source: args.source ?? "VENDOR",
      vendor: args.vendor ?? null,
      file_name: args.fileName ?? null,
      file_url: args.fileUrl ?? null,
      content_b64: args.contentB64 ?? null,
      mime_type: args.mimeType ?? "application/pdf",
      status: args.status ?? "AVAILABLE",
      raw_meta: args.rawMeta ?? {},
    },
  });
  if (error) throw new Error(error.message);
  const raw = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  return String(raw.id ?? "");
}

/**
 * Do not invent vendor PDFs. Authority Letter / Vendor AWB / Vendor Invoice
 * become Available only when the live vendor API returns a real file/URL.
 */
export async function ensureVendorDocumentPlaceholders(_args: {
  shipmentId: string;
  vendor?: string | null;
}): Promise<boolean> {
  return false;
}

function base64ToBlob(b64: string, mime: string): Blob {
  const clean = b64.includes(",") ? b64.split(",")[1]! : b64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime || "application/pdf" });
}

/** Prefer blob: URLs — Chrome often blocks large data: PDFs inside iframes. */
export function documentObjectUrl(doc: ShipmentDocumentItem): string | null {
  if (doc.url) return doc.url;
  if (doc.contentB64) {
    try {
      return URL.createObjectURL(base64ToBlob(doc.contentB64, doc.mimeType || "application/pdf"));
    } catch {
      const mime = doc.mimeType || "application/pdf";
      return `data:${mime};base64,${doc.contentB64}`;
    }
  }
  return null;
}

export function revokeDocumentObjectUrl(href: string | null | undefined) {
  if (href && href.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(href);
    } catch {
      /* ignore */
    }
  }
}

export function isPreviewableMime(mime?: string | null): boolean {
  const m = (mime || "").toLowerCase();
  return m.includes("pdf") || m.startsWith("image/");
}
