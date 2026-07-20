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
import {
  DOCUMENT_STATUS_LABELS,
  documentObjectUrl,
  getShipmentDocument,
  isPreviewableMime,
  listShipmentDocuments,
  revokeDocumentObjectUrl,
  type ShipmentDocumentItem,
  type ShipmentDocumentStatus,
} from "@/lib/transactions/shipmentDocuments";
import { cn } from "@/lib/utils";

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
  const htmlPreview = preview?.htmlPreview ?? null;
  const canPreviewFile = preview ? isPreviewableMime(preview.mimeType) : false;

  useEffect(() => {
    revokeDocumentObjectUrl(blobUrl);
    setBlobUrl(null);
    if (!preview || htmlPreview) return;
    const href = documentObjectUrl(preview);
    setBlobUrl(href);
    return () => revokeDocumentObjectUrl(href);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only rebind when preview identity changes
  }, [preview?.id, preview?.type, preview?.contentB64, preview?.url, htmlPreview]);

  const canDownload = Boolean(preview && (preview.contentB64 || preview.url || preview.htmlPreview));

  return (
    <Sheet open={Boolean(preview)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[56vw]"
      >
        <SheetHeader className="border-b px-5 py-4 text-left">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div>
              <SheetTitle>{preview?.title ?? "Document"}</SheetTitle>
              <SheetDescription>
                {preview?.fileName || preview?.type || "Shipment document"}
                {preview?.version ? ` · v${preview.version}` : ""}
              </SheetDescription>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canDownload}
              onClick={() => preview && printDocument(preview)}
            >
              <Printer className="mr-1.5 h-3.5 w-3.5" />
              Print
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canDownload}
              onClick={() => preview && downloadDocument(preview)}
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
        <div className="min-h-0 flex-1 bg-slate-50">
          {htmlPreview ? (
            <iframe
              title={preview?.title ?? "Document preview"}
              srcDoc={htmlPreview}
              className="h-full min-h-[70vh] w-full border-0 bg-white"
            />
          ) : !blobUrl ? (
            <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
              No file available
            </div>
          ) : !canPreviewFile ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-sm">
              <p className="text-muted-foreground">Preview not supported for this file type.</p>
              <Button type="button" onClick={() => preview && downloadDocument(preview)}>
                Download instead
              </Button>
            </div>
          ) : (preview?.mimeType || "").toLowerCase().startsWith("image/") ? (
            <div className="flex h-full items-center justify-center overflow-auto p-4">
              <img
                src={blobUrl}
                alt={preview?.title ?? "Document"}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ) : (
            <iframe
              title={preview?.title ?? "Document preview"}
              src={blobUrl}
              className="h-full min-h-[70vh] w-full border-0"
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Compact CourierWala-style document links under AWB header after search/open. */
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
  const [busyType, setBusyType] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["shipment-documents-quick", shipmentId, refreshKey],
    queryFn: () => listShipmentDocuments(shipmentId),
    enabled: Boolean(shipmentId),
  });
  const docs = query.data ?? [];
  if (!shipmentId) return null;

  const writeHtmlToWindow = (w: Window, html: string, title: string) => {
    w.document.open();
    w.document.write(html);
    w.document.close();
    try {
      w.document.title = title;
    } catch {
      /* ignore */
    }
  };

  const openDoc = async (doc: ShipmentDocumentItem) => {
    const available = doc.available && doc.status === "AVAILABLE";
    const isSystemDoc = doc.type === "AWB_LABEL" || doc.type === "INVOICE";

    // Open tab synchronously inside the click gesture (await would get blocked).
    const pendingWindow =
      isSystemDoc && onEnsureDocument ? window.open("", "_blank") : null;
    if (isSystemDoc && onEnsureDocument && !pendingWindow) {
      toast.error("Pop-up blocked — allow pop-ups for this site to view documents");
    }

    setBusyType(doc.type);
    try {
      let latest = doc;

      if (onEnsureDocument && (isSystemDoc || !available)) {
        const generated = await onEnsureDocument(doc.type);
        if (generated?.htmlPreview) {
          if (pendingWindow) {
            writeHtmlToWindow(
              pendingWindow,
              generated.htmlPreview,
              generated.title || doc.title,
            );
          }
          setPreview(generated);
          void queryClient.invalidateQueries({ queryKey: ["shipment-documents-quick"] });
          void queryClient.invalidateQueries({ queryKey: ["shipment-documents"] });
          return;
        }
        pendingWindow?.close();
        if (generated?.available) {
          latest = generated;
        } else if (!available) {
          onOpenCenter?.();
          return;
        }
      } else if (!available) {
        pendingWindow?.close();
        onOpenCenter?.();
        return;
      } else if (!latest.contentB64 && !latest.url && !latest.htmlPreview) {
        const stored = await getShipmentDocument(shipmentId, doc.type);
        if (stored?.available) latest = { ...doc, ...stored, title: doc.title };
      }

      if (latest.htmlPreview) {
        if (pendingWindow) {
          writeHtmlToWindow(pendingWindow, latest.htmlPreview, latest.title || doc.title);
        } else {
          const w = window.open("", "_blank");
          if (w) writeHtmlToWindow(w, latest.htmlPreview, latest.title || doc.title);
        }
        setPreview(latest);
        return;
      }

      pendingWindow?.close();

      // Vendor docs (Authority Letter, etc.): open vendor URL in a new tab when present.
      if (latest.url) {
        window.open(latest.url, "_blank", "noopener,noreferrer");
        setPreview(latest);
        return;
      }

      if (!latest.contentB64) {
        toast.error(
          latest.type === "AUTHORITY_LETTER"
            ? "Authority Letter not received from vendor yet — complete live vendor booking"
            : `Could not open ${doc.title}`,
        );
        return;
      }
      setPreview(latest);
    } catch (e) {
      pendingWindow?.close();
      toast.error(e instanceof Error ? e.message : `Could not open ${doc.title}`);
    } finally {
      setBusyType(null);
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/60 pb-3 text-xs">
        {docs.map((doc) => {
          const available = doc.available && doc.status === "AVAILABLE";
          const canGenerate =
            (doc.type === "AWB_LABEL" || doc.type === "INVOICE") &&
            Boolean(onEnsureDocument);
          const active = available || canGenerate;
          return (
            <button
              key={doc.type}
              type="button"
              disabled={busyType === doc.type}
              onClick={() => void openDoc(doc)}
              className={cn(
                "inline-flex items-center gap-1.5 font-medium transition-colors",
                active
                  ? "text-sky-700 hover:text-sky-900 hover:underline"
                  : "text-muted-foreground hover:text-foreground hover:underline",
              )}
              title={
                available
                  ? `Preview ${doc.title}`
                  : canGenerate
                    ? `Generate ${doc.title}`
                    : `${DOCUMENT_STATUS_LABELS[doc.status] ?? "Not available"} — open Documents center`
              }
            >
              {busyType === doc.type ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
              {doc.title}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            void queryClient.invalidateQueries({ queryKey: ["shipment-documents"] });
            void queryClient.invalidateQueries({ queryKey: ["shipment-documents-quick"] });
            onOpenCenter?.();
          }}
          className="ml-auto text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          Documents center
        </button>
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
    const pendingWindow = isSystemDoc && onEnsure ? window.open("", "_blank") : null;
    if (isSystemDoc && onEnsure && !pendingWindow) {
      toast.error("Pop-up blocked — allow pop-ups to view documents");
    }
    try {
      if (onEnsure && isSystemDoc) {
        const generated = await onEnsure(doc.type);
        if (generated?.htmlPreview) {
          if (pendingWindow) {
            pendingWindow.document.open();
            pendingWindow.document.write(generated.htmlPreview);
            pendingWindow.document.close();
          }
          onPreview(generated);
          return;
        }
        pendingWindow?.close();
        if (generated?.available) {
          onPreview(generated);
          return;
        }
      }
      pendingWindow?.close();
      const stored = await getShipmentDocument(shipmentId, doc.type);
      if (stored?.url) {
        window.open(stored.url, "_blank", "noopener,noreferrer");
        onPreview({ ...doc, ...stored, title: doc.title });
        return;
      }
      if (stored?.available || stored?.contentB64) {
        onPreview({ ...doc, ...stored, title: doc.title });
        return;
      }
      toast.error(
        doc.type === "AUTHORITY_LETTER"
          ? "Authority Letter not received from vendor yet — complete live vendor booking"
          : `Could not open ${doc.title}`,
      );
    } catch (e) {
      pendingWindow?.close();
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
