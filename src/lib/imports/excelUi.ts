/**
 * Shared helpers to wire existing Excel Import screens to import_excel.
 * Accepts CSV and Excel (.xlsx/.xls); rows still land in `import_excel` RPC.
 */
import { toast } from "sonner";

import {
  EXCEL_IMPORT_COLUMNS,
  importExcelChunked,
  type ExcelImportType,
} from "@/lib/imports/excelImport";
import { parseTabularFile, exportTable } from "@/lib/io/tableIo";
import { csvTemplate, mapCsvToImportRows } from "@/lib/masters/core/csv";
import type { ImportRow } from "@/lib/masters/core/import";
import { importSummary, toErrorMessage } from "@/lib/masters/screen";

export function downloadExcelTemplate(importType: ExcelImportType, filename: string) {
  const cols = EXCEL_IMPORT_COLUMNS[importType];
  const blob = new Blob([csvTemplate(cols)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Download a real .xlsx template for excel-import screens. */
export async function downloadExcelXlsxTemplate(importType: ExcelImportType, filename: string) {
  const cols = EXCEL_IMPORT_COLUMNS[importType];
  await exportTable({
    format: "excel",
    filename: filename.replace(/\.(csv|xlsx)$/i, ""),
    title: importType,
    columns: cols.map((c) => ({ key: c, header: c })),
    rows: [],
  });
}

export async function runExcelImportFromFile(args: {
  file: File;
  importType: ExcelImportType;
  mode: "VALIDATE" | "COMMIT";
  params?: Record<string, unknown>;
}): Promise<void> {
  const parsed = await parseTabularFile(args.file);
  if (parsed.rows.length === 0) {
    toast.error("File is empty");
    return;
  }
  const rows = mapCsvToImportRows(
    parsed.rows,
    EXCEL_IMPORT_COLUMNS[args.importType],
  ) as ImportRow[];

  const res = await importExcelChunked(args.importType, args.mode, rows, args.params ?? {});
  if (args.mode === "VALIDATE") {
    const parts = [`Validated ${res.ok}`];
    if (res.skipped) parts.push(`would-skip ${res.skipped}`);
    if (res.error_count) parts.push(`${res.error_count} error${res.error_count === 1 ? "" : "s"}`);
    if (res.error_count && res.errors[0]) {
      toast.message(parts.join(", "), {
        description: `Row ${res.errors[0].row_no}: ${res.errors[0].message}`,
      });
    } else {
      toast.success(parts.join(", "));
    }
    return;
  }
  toast.success(importSummary(res));
  if (res.error_count && res.errors[0]) {
    toast.message("Row errors", {
      description: `Row ${res.errors[0].row_no}: ${res.errors[0].message}`,
    });
  }
}

export function excelImportErrorMessage(err: unknown): string {
  return toErrorMessage(err, "Import failed");
}
