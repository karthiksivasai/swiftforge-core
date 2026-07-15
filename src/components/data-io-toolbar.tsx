/**
 * Shared Export (CSV / Excel / PDF / Print) + Import (CSV / Excel) toolbar controls.
 * Drop-in replacement for per-screen Download/Upload IconButtons.
 */
import { useRef, useState } from "react";
import { Download, Upload, Printer, FileSpreadsheet, FileText, FileType } from "lucide-react";
import { toast } from "sonner";

import { IconButton, IconTooltipBubble } from "@/components/master-table-kit";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  exportTable,
  parseTabularFile,
  TABLE_IO_IMPORT_ACCEPT,
  type ExportFormat,
  type IoColumn,
  type IoRow,
} from "@/lib/io/tableIo";
import type { CsvRecord } from "@/lib/masters/core/csv";
import { toErrorMessage } from "@/lib/masters/screen";
import { cn } from "@/lib/utils";

export type DataIoExportConfig = {
  filename: string;
  title: string;
  columns: readonly IoColumn[];
  /** Snapshot of rows at export time (usually filtered table rows). */
  getRows: () => readonly IoRow[];
};

export type DataIoImportConfig = {
  /** Called with header-keyed records after CSV/Excel parse. */
  onRows: (rows: CsvRecord[], file: File) => void | Promise<void>;
};

export function DataIoToolbar({
  export: exportCfg,
  import: importCfg,
  disabled,
}: {
  export?: DataIoExportConfig | null;
  import?: DataIoImportConfig | null;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const exportBtnRef = useRef<HTMLButtonElement | null>(null);
  const [exportHover, setExportHover] = useState(false);

  const runExport = async (format: ExportFormat) => {
    if (!exportCfg) return;
    try {
      const rows = exportCfg.getRows();
      await exportTable({
        format,
        filename: exportCfg.filename,
        title: exportCfg.title,
        columns: exportCfg.columns,
        rows,
      });
      if (format === "print") toast.success("Print dialog opened");
      else toast.success(`Exported ${exportCfg.filename}.${format === "excel" ? "xlsx" : format}`);
    } catch (err) {
      toast.error(toErrorMessage(err, "Export failed"));
    }
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !importCfg) return;
    try {
      const parsed = await parseTabularFile(file);
      if (parsed.rows.length === 0) {
        toast.error("File is empty");
        return;
      }
      await importCfg.onRows(parsed.rows, file);
    } catch (err) {
      toast.error(toErrorMessage(err, "Failed to import file"));
    }
  };

  return (
    <>
      {importCfg ? (
        <input
          ref={inputRef}
          type="file"
          accept={TABLE_IO_IMPORT_ACCEPT}
          className="hidden"
          onChange={onPickFile}
        />
      ) : null}

      {exportCfg ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              ref={exportBtnRef}
              type="button"
              variant="outline"
              size="icon"
              disabled={disabled}
              aria-label="Export"
              className={cn("h-9 w-9")}
              onMouseEnter={() => setExportHover(true)}
              onMouseLeave={() => setExportHover(false)}
              onFocus={() => setExportHover(true)}
              onBlur={() => setExportHover(false)}
            >
              <Download className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <IconTooltipBubble anchorRef={exportBtnRef} label="Export" visible={exportHover} />
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem disabled={disabled} onClick={() => void runExport("csv")}>
              <FileText className="mr-2 h-4 w-4" />
              CSV
            </DropdownMenuItem>
            <DropdownMenuItem disabled={disabled} onClick={() => void runExport("excel")}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Excel
            </DropdownMenuItem>
            <DropdownMenuItem disabled={disabled} onClick={() => void runExport("pdf")}>
              <FileType className="mr-2 h-4 w-4" />
              PDF
            </DropdownMenuItem>
            <DropdownMenuItem disabled={disabled} onClick={() => void runExport("print")}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {importCfg ? (
        <IconButton
          label="Import"
          onClick={() => inputRef.current?.click()}
          className={disabled ? "pointer-events-none opacity-50" : ""}
        >
          <Upload className="h-4 w-4" />
        </IconButton>
      ) : null}
    </>
  );
}
