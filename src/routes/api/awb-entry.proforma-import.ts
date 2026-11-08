import { createFileRoute } from "@tanstack/react-router";

import {
  excelBytesLookValid,
  importProformaRows,
  missingProformaHeaders,
  PROFORMA_IMPORT_HEADERS,
  rowsFromProformaWorkbook,
} from "@/lib/transactions/proformaImport";
import { requireApiAuth } from "@/lib/security/require-api-auth.server";

const MAX_BYTES = 5 * 1024 * 1024;

function failure(errors: { row: number; column: string; value: string; message: string }[], status = 422) {
  return Response.json({ success: false, rows: [], errors, warnings: [], totals: emptyTotals() }, { status });
}

function emptyTotals() {
  return { records: 0, quantity: "0", weight: "0.00", amount: "0.00", igstAmount: "0.00" };
}

function totalsOf(rows: { quantity: string; weight: string; amount: string; igstAmount: string }[]) {
  const sum = (pick: (row: (typeof rows)[number]) => string) =>
    rows.reduce((total, row) => total + (Number.parseFloat(pick(row)) || 0), 0);
  return {
    records: rows.length,
    quantity: String(sum((row) => row.quantity)),
    weight: sum((row) => row.weight).toFixed(2),
    amount: sum((row) => row.amount).toFixed(2),
    igstAmount: sum((row) => row.igstAmount).toFixed(2),
  };
}

export const Route = createFileRoute("/api/awb-entry/proforma-import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const started = Date.now();
        const auth = await requireApiAuth(request, {
          anyOf: [
            { slug: "txn.awb-entry", action: "add" },
            { slug: "txn.awb-entry", action: "modify" },
          ],
        });
        if (auth instanceof Response) return auth;

        let fileName = "";
        let fileSize = 0;
        let awbNo = "";
        try {
          const form = await request.formData();
          awbNo = String(form.get("awbNo") ?? "");
          const file = form.get("file");
          if (!(file instanceof File)) {
            return failure([{ row: 0, column: "File", value: "", message: "Please select a file" }]);
          }
          fileName = file.name;
          fileSize = file.size;
          const name = file.name.toLowerCase();
          const mime = file.type.toLowerCase();
          const mimeOk =
            mime === "" ||
            mime === "application/octet-stream" ||
            mime.includes("excel") ||
            mime.includes("spreadsheet");
          if ((!name.endsWith(".xls") && !name.endsWith(".xlsx")) || !mimeOk) {
            return failure([
              { row: 0, column: "File", value: file.name, message: "Only .xls and .xlsx files can be imported" },
            ]);
          }
          if (file.size > MAX_BYTES) {
            return failure([
              { row: 0, column: "File", value: file.name, message: "File must be 5 MB or smaller" },
            ]);
          }

          const bytes = new Uint8Array(await file.arrayBuffer());
          if (!excelBytesLookValid(file.name, bytes)) {
            return failure([
              { row: 0, column: "File", value: file.name, message: "The file content is not an Excel workbook" },
            ]);
          }

          const units = String(form.get("units") ?? "PCS")
            .split(",")
            .map((unit) => unit.trim())
            .filter(Boolean);
          const parsed = rowsFromProformaWorkbook(bytes.buffer);
          if (parsed.headers.length === 0) {
            return failure([{ row: 1, column: "File", value: "", message: "The workbook has no sheet" }]);
          }
          const missing = missingProformaHeaders(parsed.headers);
          if (missing.length > 0) {
            return failure([
              {
                row: 1,
                column: missing.join(", "),
                value: "",
                message: `Missing column(s): ${missing.join(", ")}. Expected: ${PROFORMA_IMPORT_HEADERS.join(" | ")}`,
              },
            ]);
          }

          const result = importProformaRows(parsed.rows, { units });
          const outcome = result.errors.length > 0 ? "rejected" : "validated";
          console.info(
            JSON.stringify({
              event: "proforma_import",
              userId: auth.userId,
              awbNo,
              fileName,
              fileSize,
              rows: result.lines.length,
              errors: result.errors.length,
              warnings: result.warnings.length,
              durationMs: Date.now() - started,
              outcome,
            }),
          );
          if (result.errors.length > 0) return failure(result.errors);
          return Response.json({
            success: true,
            rows: result.lines,
            lines: result.lines,
            errors: [],
            warnings: result.warnings,
            totals: totalsOf(result.lines),
            currency: String(form.get("currency") ?? ""),
            awbNo,
          });
        } catch (error) {
          console.error(
            JSON.stringify({
              event: "proforma_import",
              userId: auth.userId,
              awbNo,
              fileName,
              fileSize,
              durationMs: Date.now() - started,
              outcome: "failed",
              detail: error instanceof Error ? error.message : String(error),
            }),
          );
          return failure(
            [{ row: 0, column: "File", value: fileName, message: "The file could not be read" }],
            500,
          );
        }
      },
    },
  },
});
