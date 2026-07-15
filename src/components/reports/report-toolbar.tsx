/**
 * Report action bar — run / reset / optional CSV|XLSX export (5G).
 */
import { Download, RefreshCw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";

type Props = {
  title: string;
  description?: string | null;
  running?: boolean;
  exporting?: boolean;
  onRun: () => void;
  onReset?: () => void;
  onExportCsv?: () => void;
  onExportXlsx?: () => void;
  disabled?: boolean;
};

export function ReportToolbar({
  title,
  description,
  running,
  exporting,
  onRun,
  onReset,
  onExportCsv,
  onExportXlsx,
  disabled,
}: Props) {
  const busy = Boolean(disabled || running || exporting);
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onReset ? (
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onReset}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Reset
          </Button>
        ) : null}
        {onExportCsv ? (
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onExportCsv}>
            <Download className="mr-1.5 h-4 w-4" />
            CSV
          </Button>
        ) : null}
        {onExportXlsx ? (
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onExportXlsx}>
            <Download className="mr-1.5 h-4 w-4" />
            XLSX
          </Button>
        ) : null}
        <Button type="button" size="sm" disabled={busy} onClick={onRun}>
          <Search className="mr-1.5 h-4 w-4" />
          {running ? "Running…" : "Run"}
        </Button>
      </div>
    </div>
  );
}
