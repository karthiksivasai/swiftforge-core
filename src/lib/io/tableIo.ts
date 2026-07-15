/**
 * Shared tabular Import / Export helpers.
 *
 * Import: CSV + Excel (.xlsx/.xls) → header-keyed row records.
 * Export: CSV, Excel, PDF download, or browser Print.
 *
 * Backend persistence stays on existing RPCs (`import_master` / `import_excel`):
 * the client normalizes any supported file into the same row shape those RPCs expect.
 */
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { parseCsv, toCsv, type CsvParseResult, type CsvRecord } from "@/lib/masters/core/csv";

export type ExportFormat = "csv" | "excel" | "pdf" | "print";

export type IoColumn = {
  /** Row object key */
  key: string;
  /** Human header shown in files / print */
  header: string;
};

export type IoRow = Record<string, unknown>;

const IMPORT_ACCEPT = ".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const TABLE_IO_IMPORT_ACCEPT = IMPORT_ACCEPT;

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function isExcelFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    file.type.includes("spreadsheet") ||
    file.type === "application/vnd.ms-excel"
  );
}

/** Parse CSV or Excel into the same header-keyed records used by master imports. */
export async function parseTabularFile(file: File): Promise<CsvParseResult> {
  if (isExcelFile(file)) {
    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount < 1) return { headers: [], rows: [] };

    const matrix: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        while (cells.length < colNumber - 1) cells.push("");
        const text =
          cell.text != null && String(cell.text).length
            ? String(cell.text).trim()
            : cell.value == null
              ? ""
              : String(cell.value).trim();
        cells[colNumber - 1] = text;
      });
      if (cells.some((c) => c.length > 0)) matrix.push(cells);
    });

    if (matrix.length === 0) return { headers: [], rows: [] };
    const headers = matrix[0].map((h) => h.trim());
    const rows: CsvRecord[] = matrix.slice(1).map((cells) => {
      const rec: CsvRecord = {};
      headers.forEach((h, idx) => {
        rec[h] = (cells[idx] ?? "").trim();
      });
      return rec;
    });
    return { headers, rows };
  }

  const text = await file.text();
  return parseCsv(text);
}

export async function exportTable(opts: {
  format: ExportFormat;
  filename: string;
  title: string;
  columns: readonly IoColumn[];
  rows: readonly IoRow[];
}): Promise<void> {
  const { format, title, columns, rows } = opts;
  const base = opts.filename.replace(/\.(csv|xlsx|pdf)$/i, "");
  const records = rows.map((r) => {
    const out: Record<string, string> = {};
    for (const c of columns) out[c.key] = cellText(r[c.key]);
    return out;
  });

  if (format === "csv") {
    const csv = toCsv(
      records.map((r) => {
        const labeled: Record<string, string> = {};
        for (const c of columns) labeled[c.header] = r[c.key] ?? "";
        return labeled;
      }),
      columns.map((c) => c.header),
    );
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `${base}.csv`);
    return;
  }

  if (format === "excel") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(title.slice(0, 31) || "Data");
    sheet.addRow(columns.map((c) => c.header));
    for (const r of records) {
      sheet.addRow(columns.map((c) => r[c.key] ?? ""));
    }
    sheet.getRow(1).font = { bold: true };
    columns.forEach((_, i) => {
      sheet.getColumn(i + 1).width = Math.min(
        40,
        Math.max(12, columns[i].header.length + 4),
      );
    });
    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(
      new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      `${base}.xlsx`,
    );
    return;
  }

  if (format === "pdf") {
    const doc = new jsPDF({ orientation: columns.length > 6 ? "landscape" : "portrait" });
    doc.setFontSize(14);
    doc.text(title, 14, 16);
    autoTable(doc, {
      startY: 22,
      head: [columns.map((c) => c.header)],
      body: records.map((r) => columns.map((c) => r[c.key] ?? "")),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [33, 37, 41] },
    });
    doc.save(`${base}.pdf`);
    return;
  }

  // print
  const tableHtml = [
    `<h1 style="font-family:system-ui,sans-serif;font-size:18px;margin:0 0 12px">${escapeHtml(title)}</h1>`,
    "<table style=\"border-collapse:collapse;width:100%;font-family:system-ui,sans-serif;font-size:12px\">",
    "<thead><tr>",
    ...columns.map(
      (c) =>
        `<th style="border:1px solid #ccc;padding:6px;text-align:left;background:#f3f4f6">${escapeHtml(c.header)}</th>`,
    ),
    "</tr></thead><tbody>",
    ...records.map(
      (r) =>
        `<tr>${columns
          .map(
            (c) =>
              `<td style="border:1px solid #ccc;padding:6px">${escapeHtml(r[c.key] ?? "")}</td>`,
          )
          .join("")}</tr>`,
    ),
    "</tbody></table>",
  ].join("");

  const win = window.open("", "_blank", "noopener,noreferrer,width=960,height=720");
  if (!win) throw new Error("Pop-up blocked. Allow pop-ups to print.");
  win.document.write(
    `<!doctype html><html><head><title>${escapeHtml(title)}</title></head><body onload="window.print()">${tableHtml}</body></html>`,
  );
  win.document.close();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
