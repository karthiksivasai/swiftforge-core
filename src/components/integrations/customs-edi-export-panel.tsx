import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, FileDown, RefreshCw, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  downloadCsbExport,
  downloadTextFile,
  generateCsbExport,
  getCustomsProviderStatus,
  listCsbExports,
  testCustomsConnection,
  validateCsbExport,
  type CsbExportType,
} from "@/lib/integrations/customs-edi";
import { toErrorMessage } from "@/lib/masters/screen";

type Props = {
  authed: boolean;
};

const EXPORT_TYPES: CsbExportType[] = ["CSB_III", "CSB_IV", "CSB_V"];

export function CustomsEdiExportPanel({ authed }: Props) {
  const queryClient = useQueryClient();
  const [exportType, setExportType] = useState<CsbExportType>("CSB_III");
  const [manifestId, setManifestId] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ["customs-provider-status"],
    queryFn: () => getCustomsProviderStatus(),
    enabled: authed,
  });

  const historyQuery = useQuery({
    queryKey: ["csb-exports"],
    queryFn: () => listCsbExports({ limit: 30 }),
    enabled: authed,
  });

  const status = statusQuery.data;
  const rows = historyQuery.data ?? [];

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
    <Card className="min-w-0 space-y-4 overflow-hidden border p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Customs EDI / CSB Export</h2>
          <p className="text-sm text-muted-foreground">
            Generate CSB-III / IV / V from manifest + shipment data. Sandbox stub — no live Customs
            submission.
          </p>
          {status ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Provider: {String(status.provider)} · Sandbox:{" "}
              {status.sandbox_mode === false ? "No" : "Yes"} · CHA:{" "}
              {status.cha_configured ? "yes" : "no"} · IEC: {status.iec_configured ? "yes" : "no"}
            </p>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              if (!authed) {
                toast.success("Customs EDI Connected (demo)");
                return;
              }
              const result = await testCustomsConnection(null);
              toast.success(String(result.message ?? "Customs connection OK"));
              await statusQuery.refetch();
            })
          }
        >
          <Zap className="mr-1 h-4 w-4" />
          Test Connection
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-medium">
          Export type
          <Select value={exportType} onValueChange={(v) => setExportType(v as CsbExportType)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPORT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t.replace("_", "-")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium md:col-span-2">
          Manifest ID
          <Input
            className="h-9"
            value={manifestId}
            onChange={(e) => setManifestId(e.target.value)}
            placeholder="UUID of bagging/outbound manifest"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !manifestId.trim()}
          onClick={() =>
            void run(async () => {
              if (!authed) {
                setPreview(
                  JSON.stringify({ ok: true, demo: true, export_type: exportType }, null, 2),
                );
                toast.success("Validation preview (demo)");
                return;
              }
              const result = await validateCsbExport({
                export_type: exportType,
                manifest_id: manifestId.trim(),
              });
              setPreview(JSON.stringify(result, null, 2));
              toast[result.ok ? "success" : "error"](
                result.ok ? "Validation passed" : "Validation failed",
              );
            })
          }
        >
          <Eye className="mr-1 h-4 w-4" />
          Validation Preview
        </Button>
        <Button
          size="sm"
          disabled={busy || !manifestId.trim()}
          onClick={() =>
            void run(async () => {
              if (!authed) {
                toast.success(`${exportType} generated (demo)`);
                return;
              }
              const result = await generateCsbExport({
                export_type: exportType,
                manifest_id: manifestId.trim(),
              });
              setPreview(
                JSON.stringify(
                  {
                    ok: result.ok,
                    export: result.export,
                    errors: result.errors,
                    warnings: result.warnings,
                  },
                  null,
                  2,
                ),
              );
              await queryClient.invalidateQueries({ queryKey: ["csb-exports"] });
              if (result.ok) toast.success(result.message ?? "Export generated");
              else toast.error(result.message ?? "Generation failed");
            })
          }
        >
          <FileDown className="mr-1 h-4 w-4" />
          Generate CSB Export
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || !authed}
          onClick={() => void historyQuery.refetch()}
        >
          <RefreshCw className="mr-1 h-4 w-4" />
          Refresh History
        </Button>
      </div>

      {preview ? (
        <pre className="max-h-48 overflow-auto rounded-md bg-muted/40 p-3 text-xs whitespace-pre-wrap">
          {preview}
        </pre>
      ) : null}

      <div>
        <h3 className="mb-2 text-sm font-semibold">Export History</h3>
        <Table>
          <TableHeader>
            <TableRow className="bg-sidebar hover:bg-sidebar">
              {["Type", "File", "Status", "Lines", "Downloads", "Generated", "Action"].map((h) => (
                <TableHead key={h} className="text-sidebar-foreground">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {!authed ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  Demo mode — sign in to view live export history.
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  No CSB exports yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="odd:bg-muted/50">
                  <TableCell>{row.export_type.replace("_", "-")}</TableCell>
                  <TableCell className="max-w-[12rem] truncate">{row.file_name}</TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell>{row.line_count}</TableCell>
                  <TableCell>{row.download_count}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.generated_at ? new Date(row.generated_at).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy || !["GENERATED", "DOWNLOADED"].includes(row.status)}
                      onClick={() =>
                        void run(async () => {
                          const result = await downloadCsbExport(row.id);
                          downloadTextFile(result.file_name, result.content, result.mime);
                          await queryClient.invalidateQueries({ queryKey: ["csb-exports"] });
                          toast.success(`Downloaded ${result.file_name}`);
                        })
                      }
                    >
                      <Download className="mr-1 h-4 w-4" />
                      Download
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
