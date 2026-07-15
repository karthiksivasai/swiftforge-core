import { useState } from "react";
import { Eye, QrCode, RefreshCw, XCircle, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  cancelIrn,
  generateIrn,
  getIrnStatus,
  type EinvoiceDocument,
  type EinvoiceDocumentType,
} from "@/lib/integrations/irn";
import { toErrorMessage } from "@/lib/masters/screen";

type Props = {
  documentType: EinvoiceDocumentType;
  document: EinvoiceDocument | null;
  demo?: boolean;
  onUpdated?: (doc: EinvoiceDocument) => void;
};

export function IrnActionsPanel({ documentType, document, demo, onUpdated }: Props) {
  const [busy, setBusy] = useState(false);
  const [cancelReason, setCancelReason] = useState("Incorrect details");
  const [detail, setDetail] = useState<string | null>(null);

  if (!document) {
    return (
      <Card className="border p-4">
        <p className="text-sm text-muted-foreground">Select or save a document to manage IRN.</p>
      </Card>
    );
  }

  const run = async (fn: () => Promise<void>) => {
    try {
      setBusy(true);
      await fn();
    } catch (e) {
      toast.error(toErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3 border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">E-Invoice / IRN</h3>
          <p className="text-xs text-muted-foreground">
            {document.document_no} · {document.irn_status}
            {document.irn ? ` · ${document.irn}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy || document.irn_status === "GENERATED"}
            onClick={() =>
              void run(async () => {
                if (demo) {
                  toast.success("IRN generated (demo)");
                  return;
                }
                const result = await generateIrn({
                  documentType,
                  documentId: document.id,
                  rowVersion: document.row_version,
                });
                onUpdated?.(result.document);
                setDetail(JSON.stringify(result.result, null, 2));
                toast.success(`IRN generated via ${result.provider}`);
              })
            }
          >
            <Zap className="mr-1 h-4 w-4" />
            Generate IRN
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (demo) {
                  setDetail(JSON.stringify({ status: document.irn_status, demo: true }, null, 2));
                  toast.success("Status loaded (demo)");
                  return;
                }
                const result = await getIrnStatus({
                  documentType,
                  documentId: document.id,
                });
                onUpdated?.(result.document);
                setDetail(
                  JSON.stringify(
                    { document: result.document, latest_logs: result.logs.slice(0, 5) },
                    null,
                    2,
                  ),
                );
                toast.success(`Status: ${result.document.irn_status}`);
              })
            }
          >
            <RefreshCw className="mr-1 h-4 w-4" />
            View Status
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !document.irn_qr_payload}
            onClick={() => {
              setDetail(document.irn_qr_payload ?? "(no QR)");
              toast.success("QR payload shown");
            }}
          >
            <QrCode className="mr-1 h-4 w-4" />
            View QR
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !document.irn_payload}
            onClick={() => {
              setDetail(JSON.stringify(document.irn_payload, null, 2));
              toast.success("Provider response shown");
            }}
          >
            <Eye className="mr-1 h-4 w-4" />
            View Response
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-xs text-muted-foreground">Cancel reason</label>
          <Input
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Cancellation reason"
          />
        </div>
        <Button
          size="sm"
          variant="destructive"
          disabled={busy || document.irn_status !== "GENERATED"}
          onClick={() =>
            void run(async () => {
              if (demo) {
                toast.success("IRN cancelled (demo)");
                return;
              }
              const result = await cancelIrn({
                documentType,
                documentId: document.id,
                reason: cancelReason,
                rowVersion: document.row_version,
              });
              onUpdated?.(result.document);
              setDetail(JSON.stringify(result.result, null, 2));
              toast.success("IRN cancelled");
            })
          }
        >
          <XCircle className="mr-1 h-4 w-4" />
          Cancel IRN
        </Button>
      </div>
      {detail ? (
        <pre className="max-h-48 overflow-auto rounded-md bg-muted/40 p-3 text-xs whitespace-pre-wrap">
          {detail}
        </pre>
      ) : null}
    </Card>
  );
}
