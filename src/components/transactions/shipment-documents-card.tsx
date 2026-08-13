/**
 * Shipment Documents Center — post vendor booking success.
 * Provider-agnostic tiles with preview drawer, print, download.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
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

function triggerFileDownload(href: string, fileName: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadDocument(doc: ShipmentDocumentItem) {
  const fileName = doc.fileName || `${doc.type.toLowerCase()}.pdf`;
  if (doc.contentB64 || doc.url) {
    const href = documentObjectUrl(doc);
    if (!href) {
      toast.error("Nothing to download yet");
      return;
    }
    triggerFileDownload(href, fileName);
    toast.success("Download started");
    window.setTimeout(() => revokeDocumentObjectUrl(href), 2000);
    return;
  }
  if (doc.htmlPreview) {
    const blob = new Blob([doc.htmlPreview], { type: "text/html;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    triggerFileDownload(href, fileName.replace(/\.pdf$/i, ".html"));
    toast.success("Download started");
    window.setTimeout(() => URL.revokeObjectURL(href), 2000);
    return;
  }
  toast.error("Nothing to download yet");
}

const PRINT_COLOR_CSS = `
html, body, * {
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
  color-adjust: exact !important;
}
.hdr {
  background-color: #0b5c2e !important;
  background-image: linear-gradient(#0b5c2e, #0b5c2e) !important;
  color: #fff !important;
}
.logo-title { color: #0b5c2e !important; }
@media print {
  html, body, .hdr, .logo-title, table.wt th, table.goods th {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }
  .hdr {
    background-color: #0b5c2e !important;
    background-image: linear-gradient(#0b5c2e, #0b5c2e) !important;
    color: #fff !important;
  }
}
`;

function ensurePrintColors(doc: Document) {
  if (!doc.getElementById("print-color-exact")) {
    const style = doc.createElement("style");
    style.id = "print-color-exact";
    style.textContent = PRINT_COLOR_CSS;
    doc.head.appendChild(style);
  }
  doc.querySelectorAll(".hdr").forEach((el) => {
    if (el.querySelector(".hdr-bg")) return;
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "hdr-bg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("style", "position:absolute;inset:0;width:100%;height:100%;z-index:0");
    const rect = doc.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("width", "100%");
    rect.setAttribute("height", "100%");
    rect.setAttribute("fill", "#0b5c2e");
    svg.appendChild(rect);
    const host = el as HTMLElement;
    host.style.position = host.style.position || "relative";
    host.style.color = "#fff";
    const text = doc.createElement("span");
    text.style.position = "relative";
    text.style.zIndex = "1";
    text.style.color = "#fff";
    while (host.firstChild) text.appendChild(host.firstChild);
    host.insertBefore(svg, host.firstChild);
    host.appendChild(text);
  });
}

function printFrame(frame: HTMLIFrameElement | null) {
  const win = frame?.contentWindow;
  const doc = frame?.contentDocument;
  if (!win || !doc) return false;
  ensurePrintColors(doc);
  win.focus();
  win.print();
  return true;
}

function printHtmlNow(html: string) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute(
    "style",
    "position:fixed;left:-10000px;top:0;width:800px;height:1100px;border:0;opacity:0;pointer-events:none",
  );
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);
  const target = iframe.contentDocument;
  if (!target) {
    iframe.remove();
    return;
  }
  target.open();
  target.write(html);
  target.close();
  printFrame(iframe);
  window.setTimeout(() => iframe.remove(), 2000);
}

function printDocument(doc: ShipmentDocumentItem, previewFrame?: HTMLIFrameElement | null) {
  if (printFrame(previewFrame ?? null)) return;
  if (doc.htmlPreview) {
    printHtmlNow(doc.htmlPreview);
    return;
  }
  const href = documentObjectUrl(doc);
  if (!href) return;
  const mime = (doc.mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) {
    printHtmlNow(
      `<!doctype html><title>${doc.title ?? "Document"}</title><img src="${href}" style="max-width:100%" />`,
    );
    window.setTimeout(() => revokeDocumentObjectUrl(href), 4000);
    return;
  }
  const iframe = document.createElement("iframe");
  iframe.setAttribute(
    "style",
    "position:fixed;left:-10000px;top:0;width:800px;height:1100px;border:0;opacity:0;pointer-events:none",
  );
  iframe.src = href;
  document.body.appendChild(iframe);
  iframe.addEventListener("load", () => {
    printFrame(iframe);
    window.setTimeout(() => {
      iframe.remove();
      revokeDocumentObjectUrl(href);
    }, 2000);
  });
}

const FittedHtmlPreview = forwardRef<HTMLIFrameElement, { title: string; html: string }>(
  function FittedHtmlPreview({ title, html }, ref) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [docSize, setDocSize] = useState({ w: 780, h: 1100 });
  const [scale, setScale] = useState(1);

  const setFrame = (node: HTMLIFrameElement | null) => {
    frameRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };

  const fit = useCallback(() => {
    const wrap = wrapRef.current;
    const frame = frameRef.current;
    const root = frame?.contentDocument?.documentElement;
    const body = frame?.contentDocument?.body;
    if (!wrap || !root) return;
    const w = Math.max(root.scrollWidth, body?.scrollWidth ?? 0, 780);
    const h = Math.max(root.scrollHeight, body?.scrollHeight ?? 0, 1);
    const availW = Math.max(wrap.clientWidth - 24, 1);
    const availH = Math.max(wrap.clientHeight - 24, 1);
    const fitPage = Math.min(availW / w, availH / h);
    const fitWidth = availW / w;
    // Larger than full-page fit, still mostly on screen; slight scroll if needed.
    setDocSize({ w, h });
    setScale(Math.min(fitWidth, Math.max(fitPage * 1.42, fitPage)));
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(() => fit());
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [fit, html]);

  return (
    <div
      ref={wrapRef}
      className="flex h-full w-full items-start justify-center overflow-auto bg-slate-100 py-3"
    >
      <div
        style={{
          width: docSize.w * scale,
          height: docSize.h * scale,
          position: "relative",
          flexShrink: 0,
        }}
      >
        <iframe
          ref={setFrame}
          title={title}
          srcDoc={html}
          onLoad={fit}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: docSize.w,
            height: docSize.h,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            border: 0,
            background: "#fff",
          }}
        />
      </div>
    </div>
  );
});

function DocumentPreviewDrawer({
  preview,
  onClose,
}: {
  preview: ShipmentDocumentItem | null;
  onClose: () => void;
}) {
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [displayed, setDisplayed] = useState<ShipmentDocumentItem | null>(null);
  const [entered, setEntered] = useState(false);
  const [backdropLive, setBackdropLive] = useState(false);

  useEffect(() => {
    if (preview) {
      setDisplayed(preview);
      return;
    }
    setEntered(false);
    setBackdropLive(false);
    const timer = window.setTimeout(() => setDisplayed(null), 320);
    return () => window.clearTimeout(timer);
  }, [preview]);

  useLayoutEffect(() => {
    if (!preview) return;
    setEntered(false);
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setEntered(true));
    });
    const timer = window.setTimeout(() => setBackdropLive(true), 360);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [preview]);

  useEffect(() => {
    if (!preview) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [preview, onClose]);

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

  if (!active || typeof document === "undefined") return null;

  const open = entered;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="document-preview-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        pointerEvents: "auto",
      }}
    >
      <div
        aria-hidden
        onMouseDown={() => {
          if (backdropLive) onClose();
        }}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          opacity: open ? 1 : 0,
          transition: "opacity 320ms ease",
          pointerEvents: backdropLive ? "auto" : "none",
        }}
      />
      <aside
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          height: "100%",
          width: "min(1100px, 92vw)",
          maxWidth: "92vw",
          display: "flex",
          flexDirection: "column",
          background: "#fff",
          boxShadow: "-8px 0 24px rgba(0,0,0,0.15)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)",
          pointerEvents: "auto",
        }}
      >
        <header className="shrink-0 border-b px-5 py-4 text-left">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="document-preview-title" className="text-lg font-semibold text-foreground">
                {active.title ?? "Document"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {active.fileName || active.type || "Shipment document"}
                {active.version ? ` · v${active.version}` : ""}
              </p>
            </div>
            <Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canDownload}
              onClick={() => printDocument(active, previewFrameRef.current)}
            >
              <Printer className="mr-1.5 h-3.5 w-3.5" />
              Print
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canDownload}
              onClick={() => downloadDocument(active)}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download
            </Button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden bg-slate-50">
          {htmlPreview ? (
            <FittedHtmlPreview
              ref={previewFrameRef}
              title={active.title ?? "Document preview"}
              html={htmlPreview}
            />
          ) : !blobUrl ? (
            <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
              Loading document…
            </div>
          ) : !canPreviewFile ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-sm">
              <p className="text-muted-foreground">Preview not supported for this file type.</p>
              <Button type="button" onClick={() => downloadDocument(active)}>
                Download instead
              </Button>
            </div>
          ) : (active.mimeType || "").toLowerCase().startsWith("image/") ? (
            <div className="flex h-full items-center justify-center overflow-hidden p-4">
              <img
                src={blobUrl}
                alt={active.title ?? "Document"}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ) : (
            <iframe
              ref={previewFrameRef}
              title={active.title ?? "Document preview"}
              src={`${blobUrl}#view=Fit`}
              className="h-full w-full border-0"
            />
          )}
        </div>
      </aside>
    </div>,
    document.body,
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

    setPreview({
      ...doc,
      title: doc.title,
      status: doc.status === "AVAILABLE" ? doc.status : "GENERATING",
      available: true,
      htmlPreview:
        doc.htmlPreview ||
        `<!doctype html><html><body style="font-family:sans-serif;padding:24px;color:#444">Opening ${doc.title}…</body></html>`,
    });
    setBusyKey(key);
    try {
      let latest = doc;

      if (onEnsureDocument && (isSystemDoc || !available)) {
        const generated = await onEnsureDocument(doc.type);
        if (generated?.htmlPreview || generated?.available || generated?.url || generated?.contentB64) {
          setPreview({ ...generated, title: doc.title });
          void queryClient.invalidateQueries({ queryKey: ["shipment-documents-quick"] });
          void queryClient.invalidateQueries({ queryKey: ["shipment-documents"] });
          return;
        }
        if (!available) {
          setPreview(null);
          toast.info(`${doc.title} is not available yet`);
          return;
        }
      } else if (!available) {
        setPreview(null);
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

      setPreview(null);
      toast.error(
        latest.type === "AUTHORITY_LETTER"
          ? "Authority Letter not received from vendor yet — complete live vendor booking"
          : `Could not open ${doc.title}`,
      );
    } catch (e) {
      setPreview(null);
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
              disabled={!active}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void openDoc(def.key, resolved.doc, resolved);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 font-medium transition-colors",
                active
                  ? "cursor-pointer text-foreground hover:text-sky-800 hover:underline"
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
            className="cursor-pointer"
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
