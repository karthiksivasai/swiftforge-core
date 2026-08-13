/**
 * Shipment Documents Center — post vendor booking success.
 * Provider-agnostic tiles with preview drawer, print, download.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Loader2,
  Printer,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { listVendorDocuments } from "@/lib/integrations/vendor-shipping/client";
import type { VendorDocType, VendorDocumentRow } from "@/lib/integrations/vendor-shipping/types";
import {
  DOCUMENT_STATUS_LABELS,
  documentObjectUrl,
  getShipmentDocument,
  isPreviewableMime,
  listShipmentDocuments,
  revokeDocumentObjectUrl,
  type ShipmentDocumentItem,
  type ShipmentDocumentStatus,
  type ShipmentDocumentType,
} from "@/lib/transactions/shipmentDocuments";
import { cn } from "@/lib/utils";

/** Fixed CourierWala-style quick-link row — only enable when vendor/system data exists. */
const AWB_DOCUMENT_QUICK_LINKS: ReadonlyArray<{
  key: string;
  label: string;
  /** Prefer center catalog type when present. */
  centerType?: ShipmentDocumentType;
  /** Prefer raw vendor doc_type when present (labels/box/etc.). */
  vendorDocType?: VendorDocType;
  /** System docs that can be generated client-side. */
  canGenerate?: boolean;
  kind?: "link" | "excel";
}> = [
  { key: "LOI", label: "LOI" },
  { key: "AUTHORITY_LETTER", label: "Authority Letter", centerType: "AUTHORITY_LETTER", vendorDocType: "AUTHORITY_LETTER" },
  { key: "AWB", label: "AWB", centerType: "AWB_LABEL", canGenerate: true },
  { key: "LABEL", label: "Label", centerType: "AWB_LABEL", vendorDocType: "SHIPPING_LABEL", canGenerate: true },
  { key: "INVOICE", label: "Invoice", centerType: "INVOICE", canGenerate: true },
  { key: "VENDOR_AWB", label: "Vendor AWB", centerType: "VENDOR_AWB", vendorDocType: "VENDOR_AWB" },
  { key: "VENDOR_INVOICE", label: "Vendor Invoice", centerType: "VENDOR_INVOICE", vendorDocType: "VENDOR_INVOICE" },
  { key: "FORWARDING_AWB", label: "Forwarding AWB" },
  { key: "FORWARDING_BOX", label: "Forwarding Box", vendorDocType: "BOX_LABEL" },
  { key: "FORWARDING_LABEL", label: "Forwarding Label", vendorDocType: "SHIPPING_LABEL" },
  { key: "FIRST_MILE_LABEL", label: "First Mile Label" },
  { key: "KYC", label: "KYC", centerType: "KYC", vendorDocType: "KYC" },
  { key: "EXCEL", label: "Excel", kind: "excel" },
];

function vendorDocToItem(row: VendorDocumentRow, title: string): ShipmentDocumentItem {
  const hasFile = Boolean(row.source_url || row.content_b64);
  return {
    type: (row.doc_type as ShipmentDocumentType) || "OTHER",
    title,
    status: hasFile ? "AVAILABLE" : "WAITING",
    id: row.id,
    url: row.source_url ?? null,
    contentB64: row.content_b64 ?? null,
    mimeType: row.mime_type ?? "application/pdf",
    source: "VENDOR",
    available: hasFile,
    hasContent: hasFile,
  };
}

function statusBadgeClass(status: ShipmentDocumentStatus): string {
  switch (status) {
    case "AVAILABLE":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "GENERATING":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "WAITING":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "FAILED":
      return "border-red-200 bg-red-50 text-red-800";
    case "NOT_REQUIRED":
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function downloadDocument(doc: ShipmentDocumentItem) {
  if (doc.htmlPreview && !doc.contentB64 && !doc.url) {
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) return;
    w.document.open();
    w.document.write(doc.htmlPreview);
    w.document.close();
    return;
  }
  const href = documentObjectUrl(doc);
  if (!href) return;
  const a = document.createElement("a");
  a.href = href;
  a.download = doc.fileName || `${doc.type.toLowerCase()}.pdf`;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
  revokeDocumentObjectUrl(href);
}

function printDocument(doc: ShipmentDocumentItem) {
  if (doc.htmlPreview) {
    const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
    if (!w) return;
    w.document.open();
    w.document.write(doc.htmlPreview);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
    return;
  }
  const href = documentObjectUrl(doc);
  if (!href) return;
  const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!w) {
    downloadDocument(doc);
    return;
  }
  const mime = (doc.mimeType || "").toLowerCase();
  const title = doc.title;
  if (mime.startsWith("image/")) {
    w.document.write(
      `<!doctype html><title>${title}</title><img src="${href}" style="max-width:100%" onload="window.focus();window.print();" />`,
    );
  } else {
    w.document.write(
      `<!doctype html><title>${title}</title><iframe src="${href}" style="border:0;width:100%;height:100vh" onload="setTimeout(function(){window.focus();window.print();},400)"></iframe>`,
    );
  }
  w.document.close();
}

function DocumentPreviewDrawer({
  preview,
  onClose,
}: {
  preview: ShipmentDocumentItem | null;
  onClose: () => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  /** Keep last document mounted during Sheet exit so the slide-out isn't blank. */
  const [displayed, setDisplayed] = useState<ShipmentDocumentItem | null>(null);

  useEffect(() => {
    if (preview) setDisplayed(preview);
  }, [preview]);

  const active = preview ?? displayed;
  const htmlPreview = active?.htmlPreview ?? null;
  const canPreviewFile = active ? isPreviewableMime(active.mimeType) : false;

  useEffect(() => {
    revokeDocumentObjectUrl(blobUrl);
    setBlobUrl(null);
    if (!active || htmlPreview) return;
    const href = documentObjectUrl(active);
    setBlobUrl(href);
    return () => revokeDocumentObjectUrl(href);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only rebind when preview identity changes
  }, [active?.id, active?.type, active?.contentB64, active?.url, htmlPreview]);

  const canDownload = Boolean(active && (active.contentB64 || active.url || active.htmlPreview));

  return (
    <Sheet open={Boolean(preview)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className={cn(
          "flex h-dvh w-[min(1100px,92vw)] max-w-[92vw] flex-col gap-0 overflow-hidden border-l p-0 sm:max-w-[92vw]",
          "shadow-[-8px_0_24px_rgba(0,0,0,0.15)]",
          "ease-in-out duration-300 data-[state=open]:duration-300 data-[state=closed]:duration-300",
        )}
      >
        <SheetHeader className="shrink-0 border-b px-5 py-4 text-left">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div>
              <SheetTitle>{active?.title ?? "Document"}</SheetTitle>
              <SheetDescription>
                {active?.fileName || active?.type || "Shipment document"}
                {active?.version ? ` · v${active.version}` : ""}
              </SheetDescription>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canDownload}
              onClick={() => active && printDocument(active)}
            >
              <Printer className="mr-1.5 h-3.5 w-3.5" />
              Print
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canDownload}
              onClick={() => active && downloadDocument(active)}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>
              <X className="mr-1.5 h-3.5 w-3.5" />
              Close
            </Button>
          </div>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-auto bg-slate-50">
          {htmlPreview ? (
            <iframe
              title={active?.title ?? "Document preview"}
              srcDoc={htmlPreview}
              className="h-full min-h-full w-full border-0 bg-white"
            />
          ) : !blobUrl ? (
            <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
              No file available
            </div>
          ) : !canPreviewFile ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-sm">
              <p className="text-muted-foreground">Preview not supported for this file type.</p>
              <Button type="button" onClick={() => active && downloadDocument(active)}>
                Download instead
              </Button>
            </div>
          ) : (active?.mimeType || "").toLowerCase().startsWith("image/") ? (
            <div className="flex h-full items-center justify-center overflow-auto p-4">
              <img
                src={blobUrl}
                alt={active?.title ?? "Document"}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ) : (
            <iframe
              title={active?.title ?? "Document preview"}
              src={blobUrl}
              className="h-full min-h-full w-full border-0"
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Compact CourierWala-style document links under AWB header after save/edit. */
export function ShipmentDocumentQuickLinks({
  shipmentId,
  refreshKey = 0,
  onOpenCenter,
  onEnsureDocument,
}: {
  shipmentId: string;
  refreshKey?: number;
  onOpenCenter?: () => void;
  /** Generate/refresh a document type (e.g. internal AWB Label) then return latest item. */
  onEnsureDocument?: (type: ShipmentDocumentItem["type"]) => Promise<ShipmentDocumentItem | null>;
}) {
  const [preview, setPreview] = useState<ShipmentDocumentItem | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const centerQuery = useQuery({
    queryKey: ["shipment-documents-quick", shipmentId, refreshKey],
    queryFn: () => listShipmentDocuments(shipmentId),
    enabled: Boolean(shipmentId),
  });
  const vendorQuery = useQuery({
    queryKey: ["shipment-vendor-documents-quick", shipmentId, refreshKey],
    queryFn: () => listVendorDocuments(shipmentId),
    enabled: Boolean(shipmentId),
  });
  const centerDocs = centerQuery.data ?? [];
  const vendorDocs = vendorQuery.data ?? [];

  const resolveLink = (def: (typeof AWB_DOCUMENT_QUICK_LINKS)[number]) => {
    const vendorHit = def.vendorDocType
      ? vendorDocs.find(
          (d) =>
            d.doc_type === def.vendorDocType && Boolean(d.source_url || d.content_b64),
        )
      : undefined;
    if (vendorHit) {
      return {
        doc: vendorDocToItem(vendorHit, def.label),
        canGenerate: false,
        available: true,
      };
    }
    const centerHit = def.centerType
      ? centerDocs.find((d) => d.type === def.centerType)
      : undefined;
    const available = Boolean(centerHit?.available && centerHit.status === "AVAILABLE");
    const canGenerate =
      Boolean(def.canGenerate && def.centerType && onEnsureDocument) &&
      (def.centerType === "AWB_LABEL" || def.centerType === "INVOICE");
    return {
      doc: centerHit
        ? { ...centerHit, title: def.label }
        : ({
            type: def.centerType ?? "OTHER",
            title: def.label,
            status: "WAITING" as const,
            available: false,
          } satisfies ShipmentDocumentItem),
      canGenerate,
      available,
    };
  };

  if (!shipmentId) return null;

  const openDoc = async (
    key: string,
    doc: ShipmentDocumentItem,
    opts: { canGenerate: boolean; available: boolean },
  ) => {
    const { canGenerate, available } = opts;
    if (!available && !canGenerate) {
      toast.info(`${doc.title} is not available from the vendor yet`);
      return;
    }

    const isSystemDoc = doc.type === "AWB_LABEL" || doc.type === "INVOICE";

    setBusyKey(key);
    try {
      let latest = doc;

      if (onEnsureDocument && (isSystemDoc || !available)) {
        const generated = await onEnsureDocument(doc.type);
        if (generated?.htmlPreview || generated?.available) {
          setPreview({ ...generated, title: doc.title });
          void queryClient.invalidateQueries({ queryKey: ["shipment-documents-quick"] });
          void queryClient.invalidateQueries({ queryKey: ["shipment-documents"] });
          return;
        }
        if (!available) {
          toast.info(`${doc.title} is not available yet`);
          return;
        }
      } else if (!available) {
        toast.info(`${doc.title} is not available yet`);
        return;
      } else if (!latest.contentB64 && !latest.url && !latest.htmlPreview && doc.type) {
        const stored = await getShipmentDocument(shipmentId, doc.type);
        if (stored?.available) latest = { ...doc, ...stored, title: doc.title };
      }

      if (latest.htmlPreview || latest.url || latest.contentB64) {
        setPreview(latest);
        return;
      }

      toast.error(
        latest.type === "AUTHORITY_LETTER"
          ? "Authority Letter not received from vendor yet — complete live vendor booking"
          : `Could not open ${doc.title}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Could not open ${doc.title}`);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-b border-border/60 pb-3 text-xs">
        {AWB_DOCUMENT_QUICK_LINKS.map((def) => {
          if (def.kind === "excel") {
            return (
              <label
                key={def.key}
                className="inline-flex items-center gap-1.5 text-muted-foreground"
                title="Excel export is not available for this booking yet"
              >
                <span className="font-medium">{def.label}</span>
                <Checkbox checked={false} disabled className="h-3.5 w-3.5" />
              </label>
            );
          }

          const resolved = resolveLink(def);
          const active = resolved.available || resolved.canGenerate;
          return (
            <button
              key={def.key}
              type="button"
              disabled={!active || busyKey === def.key}
              onClick={() => void openDoc(def.key, resolved.doc, resolved)}
              className={cn(
                "inline-flex items-center gap-1.5 font-medium transition-colors",
                active
                  ? "text-foreground hover:text-sky-800 hover:underline"
                  : "cursor-not-allowed text-muted-foreground/50",
              )}
              title={
                resolved.available
                  ? `Open ${def.label}`
                  : resolved.canGenerate
                    ? `Generate ${def.label}`
                    : `${DOCUMENT_STATUS_LABELS[resolved.doc.status] ?? "Not available"}`
              }
            >
              {busyKey === def.key ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
              {def.label}
            </button>
          );
        })}
        {onOpenCenter ? (
          <button
            type="button"
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ["shipment-documents"] });
              void queryClient.invalidateQueries({ queryKey: ["shipment-documents-quick"] });
              void queryClient.invalidateQueries({
                queryKey: ["shipment-vendor-documents-quick"],
              });
              onOpenCenter();
            }}
            className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            Documents center
          </button>
        ) : null}
      </div>
      <DocumentPreviewDrawer preview={preview} onClose={() => setPreview(null)} />
    </>
  );
}

export function ShipmentBookedBanner({
  vendorAwb,
  trackingNumber,
  provider,
}: {
  vendorAwb?: string | null;
  trackingNumber?: string | null;
  provider?: string | null;
}) {
  const track = trackingNumber || vendorAwb;
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-base font-semibold tracking-tight text-emerald-950">
            Shipment Booked Successfully
          </h3>
          <p className="text-sm text-emerald-900/80">Vendor booking completed</p>
          {vendorAwb ? (
            <p className="pt-1 text-sm text-emerald-950">
              Vendor AWB: <span className="font-mono font-semibold">{vendorAwb}</span>
            </p>
          ) : null}
          {provider ? (
            <p className="text-xs text-emerald-800/70">Provider: {provider}</p>
          ) : null}
          {track ? (
            <div className="pt-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-50"
                onClick={() => {
                  void navigator.clipboard?.writeText(track);
                }}
              >
                Track Shipment
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DocumentTile({
  doc,
  shipmentId,
  onPreview,
  onEnsure,
  ensuring,
}: {
  doc: ShipmentDocumentItem;
  shipmentId: string;
  onPreview: (doc: ShipmentDocumentItem) => void;
  onEnsure?: (type: ShipmentDocumentItem["type"]) => Promise<ShipmentDocumentItem | null>;
  ensuring?: boolean;
}) {
  const available = doc.available && doc.status === "AVAILABLE";
  const isSystemDoc = doc.type === "AWB_LABEL" || doc.type === "INVOICE";
  const canOpen = available || (isSystemDoc && Boolean(onEnsure));

  const open = async () => {
    try {
      if (onEnsure && isSystemDoc) {
        const generated = await onEnsure(doc.type);
        if (generated?.htmlPreview || generated?.available) {
          onPreview(generated);
          return;
        }
      }
      const stored = await getShipmentDocument(shipmentId, doc.type);
      if (stored?.htmlPreview || stored?.url || stored?.available || stored?.contentB64) {
        onPreview({ ...doc, ...stored, title: doc.title });
        return;
      }
      toast.error(
        doc.type === "AUTHORITY_LETTER"
          ? "Authority Letter not received from vendor yet — complete live vendor booking"
          : `Could not open ${doc.title}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Could not open ${doc.title}`);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-border/80 bg-white p-5 shadow-sm transition-colors",
        canOpen ? "hover:border-slate-300" : "opacity-90",
      )}
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
        <FileText className="h-5 w-5" />
      </div>
      <div className="mb-2 text-sm font-semibold text-foreground">{doc.title}</div>
      <Badge
        variant="outline"
        className={cn("mb-4 w-fit font-normal", statusBadgeClass(doc.status))}
      >
        {DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status}
      </Badge>
      {canOpen ? (
        <div className="mt-auto flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={ensuring}
            onClick={() => void open()}
          >
            {ensuring ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Eye className="mr-1.5 h-3.5 w-3.5" />
            )}
            Preview
          </Button>
        </div>
      ) : (
        <p className="mt-auto text-xs text-muted-foreground">
          {doc.status === "NOT_REQUIRED"
            ? "Will be available when generated"
            : doc.status === "FAILED"
              ? "Vendor document failed"
              : "Waiting for vendor"}
        </p>
      )}
    </div>
  );
}

function DocumentsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-44 animate-pulse rounded-xl border border-border/60 bg-slate-100/80"
        />
      ))}
    </div>
  );
}

export function ShipmentDocumentsCard({
  shipmentId,
  refreshKey = 0,
  poll = false,
  onEnsureDocument,
}: {
  shipmentId: string;
  refreshKey?: number;
  /** Poll until at least one vendor doc is available (post-OTP). */
  poll?: boolean;
  onEnsureDocument?: (type: ShipmentDocumentItem["type"]) => Promise<ShipmentDocumentItem | null>;
}) {
  const [preview, setPreview] = useState<ShipmentDocumentItem | null>(null);
  const [ensuringType, setEnsuringType] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["shipment-documents", shipmentId, refreshKey],
    queryFn: () => listShipmentDocuments(shipmentId),
    enabled: Boolean(shipmentId),
    refetchInterval: (q) => {
      if (!poll) return false;
      const rows = q.state.data ?? [];
      const hasVendorFile = rows.some(
        (d) =>
          d.available &&
          (d.type === "AUTHORITY_LETTER" ||
            d.type === "VENDOR_AWB" ||
            d.type === "VENDOR_INVOICE"),
      );
      return hasVendorFile ? false : 2500;
    },
  });

  const docs = query.data ?? [];
  const waitingVendor = useMemo(() => {
    const vendorTypes = ["AUTHORITY_LETTER", "VENDOR_AWB", "VENDOR_INVOICE"] as const;
    return vendorTypes.every((t) => {
      const row = docs.find((d) => d.type === t);
      return !row?.available;
    });
  }, [docs]);

  const ensureDoc = async (type: ShipmentDocumentItem["type"]) => {
    if (!onEnsureDocument) return null;
    setEnsuringType(type);
    try {
      const generated = await onEnsureDocument(type);
      await queryClient.invalidateQueries({ queryKey: ["shipment-documents"] });
      await queryClient.invalidateQueries({ queryKey: ["shipment-documents-quick"] });
      return generated;
    } finally {
      setEnsuringType(null);
    }
  };

  return (
    <>
      <div className="rounded-xl border border-border/80 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold tracking-tight">Shipment Documents</h3>
            <p className="text-sm text-muted-foreground">
              Preview, print, or download documents from one place
            </p>
          </div>
          {query.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : null}
        </div>

        {query.isLoading ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading documents…
            </div>
            <DocumentsSkeleton />
          </div>
        ) : query.isError ? (
          <p className="text-sm text-destructive">Could not load shipment documents.</p>
        ) : waitingVendor && poll ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Waiting for vendor documents…
            </div>
            <DocumentsSkeleton />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {docs.map((doc) => (
              <DocumentTile
                key={doc.type}
                doc={doc}
                shipmentId={shipmentId}
                onPreview={setPreview}
                onEnsure={onEnsureDocument ? ensureDoc : undefined}
                ensuring={ensuringType === doc.type}
              />
            ))}
          </div>
        )}
      </div>

      <DocumentPreviewDrawer preview={preview} onClose={() => setPreview(null)} />
    </>
  );
}
