import { createFileRoute } from "@tanstack/react-router";

import {
  importProformaRows,
  missingProformaHeaders,
  PROFORMA_IMPORT_HEADERS,
  rowsFromProformaWorkbook,
} from "@/lib/transactions/proformaImport";
import { requireApiAuth } from "@/lib/security/require-api-auth.server";

const MAX_BYTES = 5 * 1024 * 1024;

export const Route = createFileRoute("/api/awb-entry/proforma-import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireApiAuth(request, {
          anyOf: [
            { slug: "txn.awb-entry", action: "add" },
            { slug: "txn.awb-entry", action: "modify" },
          ],
        });
        if (auth instanceof Response) return auth;

        try {
          const form = await request.formData();
          const file = form.get("file");
          if (!(file instanceof File)) {
            return Response.json(
              { errors: [{ row: 0, column: "File", value: "", message: "Select an Excel file" }] },
              { status: 422 },
            );
          }
          const name = file.name.toLowerCase();
          if (!name.endsWith(".xls") && !name.endsWith(".xlsx")) {
            return Response.json(
              { errors: [{ row: 0, column: "File", value: file.name, message: "Only .xls and .xlsx files can be imported" }] },
              { status: 422 },
            );
          }
          if (file.size > MAX_BYTES) {
            return Response.json(
              { errors: [{ row: 0, column: "File", value: file.name, message: "File must be 5 MB or smaller" }] },
              { status: 422 },
            );
          }

          const units = String(form.get("units") ?? "PCS")
            .split(",")
            .map((unit) => unit.trim())
            .filter(Boolean);
          const parsed = rowsFromProformaWorkbook(await file.arrayBuffer());
          if (parsed.headers.length === 0) {
            return Response.json(
              { errors: [{ row: 1, column: "File", value: "", message: "The workbook has no sheet" }] },
              { status: 422 },
            );
          }
          const missing = missingProformaHeaders(parsed.headers);
          if (missing.length > 0) {
            return Response.json(
              {
                errors: missing.map((header) => ({
                  row: 1,
                  column: header,
                  value: "",
                  message: `Missing header. Expected: ${PROFORMA_IMPORT_HEADERS.join(" | ")}`,
                })),
              },
              { status: 422 },
            );
          }

          const result = importProformaRows(parsed.rows, { units });
          if (result.errors.length > 0) {
            return Response.json({ errors: result.errors }, { status: 422 });
          }
          return Response.json({
            awbNo: String(form.get("awbNo") ?? ""),
            currency: String(form.get("currency") ?? ""),
            lines: result.lines,
            warnings: result.warnings,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return Response.json(
            { errors: [{ row: 0, column: "File", value: "", message }] },
            { status: 500 },
          );
        }
      },
    },
  },
});
