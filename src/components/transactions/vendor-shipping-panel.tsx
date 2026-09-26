/**
 * Vendor Shipping UX for AWB Entry — status strip, OTP modal, documents, timeline.
 * Provider-agnostic: no adapter brand names in UI copy.
 */
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Copy, Download, Eye, Loader2, Printer, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listVendorActivity,
  listVendorDocuments,
  resyncVendorDocuments,
  retryVendorBooking,
  verifyVendorOtp,
  VENDOR_API_STATUS_LABELS,
  VENDOR_DOC_TYPE_LABELS,
  type VendorActivityEvent,
  type VendorApiStatus,
  type VendorDocumentRow,
  type VendorBookResult,
} from "@/lib/integrations/vendor-shipping";
import { cn } from "@/lib/utils";

export type VendorShippingMeta = {
  status?: VendorApiStatus | string | null;
  vendorAwb?: string | null;
  trackingNumber?: string | null;
  bookingId?: string | null;
  provider?: string | null;
  serviceCode?: string | null;
  otpVerified?: boolean;
  bookedAt?: string | null;
  syncStatus?: string | null;
  lastError?: string | null;
  lastSyncAt?: string | null;
};

export function VendorOtpDialog({
  open,
  busy,
  error,
  shipperMobile,
  onVerify,
  onResend,
  onCancel,
}: {
  open: boolean;
  busy?: boolean;
  error?: string | null;
  /** Masked or full shipper mobile shown in copy */
  shipperMobile?: string | null;
  /** Shown only when SMS is sandbox (no live phone delivery). */
  sandboxOtp?: string | null;
  onVerify: (otp: string) => void;
  onResend: () => void;
  onCancel: () => void;
}) {
  const [otp, setOtp] = useState("");
  useEffect(() => {
    if (open) setOtp("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vendor Verification</DialogTitle>
          <DialogDescription>
            {shipperMobile
              ? `OTP is for shipper mobile ${shipperMobile}.`
              : "OTP is for the shipper mobile number in Shipper details."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Enter the OTP sent to the shipper. The code is not shown here.
          </p>
          <label className="text-sm font-medium">Enter OTP</label>
          <Input
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="______"
            inputMode="numeric"
            autoFocus
            disabled={busy}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="ghost" disabled={busy} onClick={onResend}>
            Resend OTP
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy || otp.length < 4}
              onClick={() => onVerify(otp)}
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Verify
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Dry-run payload preview card — shown when status is VENDOR_BOOKED in dry-run
// ---------------------------------------------------------------------------
export function DtdcDryRunPreviewCard({
  result,
}: {
  result?: VendorBookResult | null;
}) {
  const [expanded, setExpanded] = useState(false);

  const requestPayload = result?.request;
  if (!requestPayload) return null;

  // Only show for POSTSHIPPING dry-run results
  const rawResp = result?.rawResponse as Record<string, unknown> | undefined;
  if (!rawResp || rawResp["mode"] !== "DRY_RUN") return null;

  const endpoint = String(requestPayload["endpoint"] ?? "");
  const headers = requestPayload["headers"] as Record<string, string> | undefined;
  const body = requestPayload["body"];
  const stationCode = String(rawResp["stationCode"] ?? "");
  const warnings = (rawResp["warnings"] as string[]) ?? [];

  const bodyJson = JSON.stringify(body, null, 2);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy");
    }
  };

  const fullRequestJson = JSON.stringify(
    {
      method: "POST",
      endpoint,
      headers: {
        Token: headers?.["Token"] ?? "(station key — server-side only)",
        "Content-Type": "application/json",
      },
      body,
    },
    null,
    2,
  );

  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60">
      {/* Header */}
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
        onClick={() => setExpanded((p) => !p)}
      >
        <div className="flex items-center gap-2">
          <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-900 tracking-wide">
            DRY-RUN
          </span>
          <span className="text-sm font-semibold text-amber-900">
            PostShipping Payload Preview
          </span>
          {stationCode && (
            <Badge variant="outline" className="text-xs">
              Station: {stationCode}
            </Badge>
          )}
        </div>
        <span className="text-amber-700">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="border-t border-amber-200 bg-amber-100/60 px-4 py-2">
          {warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-800">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

      {/* Expanded payload */}
      {expanded && (
        <div className="border-t border-amber-200 px-4 py-3 space-y-3">
          {/* Endpoint */}
          <div>
            <p className="mb-1 text-xs font-semibold text-amber-900">Endpoint</p>
            <code className="block rounded bg-amber-100 px-3 py-1.5 text-xs font-mono text-amber-900 break-all">
              POST {endpoint}
            </code>
          </div>

          {/* Headers */}
          <div>
            <p className="mb-1 text-xs font-semibold text-amber-900">Headers</p>
            <div className="rounded bg-amber-100 px-3 py-1.5 text-xs font-mono text-amber-900 space-y-0.5">
              <div>
                <span className="text-amber-600">Token:</span>{" "}
                {headers?.["Token"] ?? "(server-side only — not exposed to client)"}
              </div>
              <div>
                <span className="text-amber-600">Content-Type:</span> application/json
              </div>
            </div>
          </div>

          {/* Body */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-semibold text-amber-900">
                Request Body (Array — 1 shipment)
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 gap-1 px-2 text-xs text-amber-800 hover:bg-amber-200"
                onClick={() => void copyToClipboard(fullRequestJson)}
              >
                <Copy className="h-3 w-3" />
                Copy full
              </Button>
            </div>
            <pre className="max-h-96 overflow-auto rounded bg-amber-100 px-3 py-2 text-xs font-mono text-amber-950 whitespace-pre-wrap">
              {bodyJson}
            </pre>
          </div>

          {/* Note */}
          <p className="text-xs text-amber-700">
            <strong>No wallet charge.</strong> Live mode is OFF by default. Enable{" "}
            <code className="bg-amber-100 px-1 rounded">is_live_mode</code> on the vendor row in
            the database to send this payload to PostShipping.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main status strip
// ---------------------------------------------------------------------------
export function VendorBookingStatusStrip({
  meta,
  bookingInProgress,
  onRetry,
  canRetry,
  lastResult,
}: {
  meta: VendorShippingMeta;
  bookingInProgress?: boolean;
  onRetry?: () => void;
  canRetry?: boolean;
  /** Last VendorBookResult — used to show dry-run payload when applicable */
  lastResult?: VendorBookResult | null;
}) {
  const status = (meta.status || "NONE") as VendorApiStatus;
  if (status === "NONE" && !bookingInProgress) return null;

  const isDryRun =
    lastResult?.rawResponse &&
    (lastResult.rawResponse as Record<string, unknown>)["mode"] === "DRY_RUN";

  const label = bookingInProgress
    ? VENDOR_API_STATUS_LABELS.BOOKING_IN_PROGRESS
    : (VENDOR_API_STATUS_LABELS[status as VendorApiStatus] ?? status);

  return (
    <div className="mt-4 rounded-lg border bg-muted/20 px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Vendor Booking</span>
          <Badge
            variant={
              status === "VENDOR_BOOKED"
                ? isDryRun
                  ? "outline"
                  : "default"
                : status === "FAILED" || status === "VENDOR_PENDING"
                  ? "destructive"
                  : "secondary"
            }
            className={isDryRun ? "border-amber-400 text-amber-700 bg-amber-50" : ""}
          >
            {bookingInProgress ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                {label}
              </span>
            ) : isDryRun ? (
              `${label} (DRY-RUN)`
            ) : (
              label
            )}
          </Badge>
        </div>
        {canRetry && onRetry ? (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onRetry}>
            <RotateCcw className="h-3.5 w-3.5" />
            Retry Vendor Booking
          </Button>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground md:grid-cols-4">
        <span>
          Provider: <span className="text-foreground">{meta.provider || "—"}</span>
        </span>
        <span>
          Vendor AWB: <span className="text-foreground">{meta.vendorAwb || "—"}</span>
        </span>
        <span>
          Tracking: <span className="text-foreground">{meta.trackingNumber || "—"}</span>
        </span>
        <span>
          Booking ID: <span className="text-foreground">{meta.bookingId || "—"}</span>
        </span>
        <span>
          Service: <span className="text-foreground">{meta.serviceCode || "—"}</span>
        </span>
        <span>
          OTP:{" "}
          <span className="text-foreground">{meta.otpVerified ? "Verified" : "—"}</span>
        </span>
        <span>
          Sync: <span className="text-foreground">{meta.syncStatus || "—"}</span>
        </span>
        <span>
          Booked:{" "}
          <span className="text-foreground">
            {meta.bookedAt ? new Date(meta.bookedAt).toLocaleString() : "—"}
          </span>
        </span>
      </div>
      {meta.lastError ? (
        <p className="mt-2 text-xs text-destructive">{meta.lastError}</p>
      ) : null}

      {/* Dry-run payload preview (PostShipping / DTDC only) */}
      {isDryRun && <DtdcDryRunPreviewCard result={lastResult} />}
    </div>
  );
}

function openDoc(doc: VendorDocumentRow) {
  if (doc.source_url) {
    window.open(doc.source_url, "_blank", "noopener,noreferrer");
    return;
  }
  if (doc.content_b64) {
    const mime = doc.mime_type || "application/pdf";
    const w = window.open();
    if (w) {
      w.document.write(
        `<iframe src="data:${mime};base64,${doc.content_b64}" style="width:100%;height:100%;border:0"></iframe>`,
      );
    }
    return;
  }
  toast.info("No preview available for this document yet");
}

function downloadDoc(doc: VendorDocumentRow) {
  if (doc.source_url) {
    const a = document.createElement("a");
    a.href = doc.source_url;
    a.download = doc.label || doc.doc_type;
    a.target = "_blank";
    a.click();
    return;
  }
  if (doc.content_b64) {
    const a = document.createElement("a");
    a.href = `data:${doc.mime_type || "application/pdf"};base64,${doc.content_b64}`;
    a.download = `${doc.label || doc.doc_type}.pdf`;
    a.click();
    return;
  }
  toast.info("Nothing to download yet");
}

export function VendorDocumentsPanel({
  shipmentId,
  rowVersion,
  onRowVersion,
  refreshKey,
}: {
  shipmentId: string;
  rowVersion: number;
  onRowVersion?: (v: number) => void;
  refreshKey?: number;
}) {
  const [docs, setDocs] = useState<VendorDocumentRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setDocs(await listVendorDocuments(shipmentId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipmentId, refreshKey]);

  const onResync = async () => {
    try {
      const outcome = await resyncVendorDocuments({ shipmentId, rowVersion });
      onRowVersion?.(outcome.rowVersion);
      toast.success("Re-sync requested");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Re-sync failed");
    }
  };

  return (
    <div className="mt-4 rounded-lg border">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h3 className="text-sm font-semibold">Shipment Documents</h3>
        <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => void onResync()}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Re-sync
        </Button>
      </div>
      <div className="divide-y">
        {docs.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {loading ? "Loading…" : "No vendor documents yet"}
          </p>
        ) : (
          docs.map((doc) => (
            <div
              key={doc.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
            >
              <div>
                <div className="font-medium">
                  {VENDOR_DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}
                </div>
                <div className="text-xs text-muted-foreground">{doc.label || doc.doc_type}</div>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openDoc(doc)}>
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => downloadDoc(doc)}
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => {
                    openDoc(doc);
                    toast.info("Use your browser print dialog");
                  }}
                >
                  <Printer className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function VendorActivityTimeline({
  shipmentId,
  refreshKey,
}: {
  shipmentId: string;
  refreshKey?: number;
}) {
  const [events, setEvents] = useState<VendorActivityEvent[]>([]);

  useEffect(() => {
    void listVendorActivity(shipmentId)
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [shipmentId, refreshKey]);

  if (events.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border">
      <div className="border-b px-4 py-2">
        <h3 className="text-sm font-semibold">Vendor Activity Timeline</h3>
      </div>
      <ol className="space-y-0 px-4 py-3">
        {events.map((ev, i) => (
          <li key={ev.id} className="relative flex gap-3 pb-4 last:pb-0">
            <div className="flex flex-col items-center">
              <span className="mt-1 h-2.5 w-2.5 rounded-full bg-sidebar" />
              {i < events.length - 1 ? <span className="w-px flex-1 bg-border" /> : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted-foreground">
                {ev.created_at ? new Date(ev.created_at).toLocaleString() : ""}
              </div>
              <div className="text-sm font-medium">{ev.event_type.replace(/_/g, " ")}</div>
              {ev.message ? (
                <div className="text-xs text-muted-foreground">{ev.message}</div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Imperative helpers re-exported for AWB Entry book flow */
export { retryVendorBooking, verifyVendorOtp };
