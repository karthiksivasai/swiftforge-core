import { describe, expect, it } from "vitest";

import { mapCsvToImportRows, parseCsv } from "@/lib/masters/core/csv";
import { formatImportToast } from "@/lib/masters/screen/helpers";
import { airlineCreateSchema } from "@/lib/masters/schemas/airlines";
import {
  AIRLINE_IMPORT_HEADER_ALIASES,
  airlinesResource,
} from "@/lib/masters/resources/airlines";

const TEMPLATE = `Airlines Name,Product Code,Product Name
Emirates Airline,DOCS,DOCUMENTS
,NOPE,Parcels
`;

describe("airline import template", () => {
  it("maps Airlines Name and Product Code, and does not treat Product Name as the airline", () => {
    const parsed = parseCsv(TEMPLATE);
    const mapped = mapCsvToImportRows(parsed.rows, airlinesResource.importColumns, {
      aliases: AIRLINE_IMPORT_HEADER_ALIASES,
    });

    expect(mapped[0]).toEqual({ name: "Emirates Airline", product_code: "DOCS" });
    expect(mapped[0]?.name).not.toBe("DOCUMENTS");
    expect(mapped[1]).toEqual({ name: "", product_code: "NOPE" });
  });

  it("rejects a blank name and a product that is not a uuid", () => {
    expect(() => airlineCreateSchema.parse({ name: " ", product_id: "11111111-1111-4111-8111-111111111111" })).toThrow(
      /Airline Name is required/,
    );
    expect(() => airlineCreateSchema.parse({ name: "Emirates", product_id: "DOCS" })).toThrow(
      /Product is required/,
    );
  });

  it("reports a bad import row with its row number", () => {
    const toast = formatImportToast({
      ok: 0,
      skipped: 0,
      error_count: 2,
      errors: [
        { row_no: 2, message: 'Product code "NOPE" not found' },
        { row_no: 3, message: 'Airline name "EMIRATES AIRLINE" already exists' },
      ],
    });
    expect(toast.ok).toBe(false);
    expect(toast.message).toContain("Row 2:");
    expect(toast.message).toContain('Product code "NOPE" not found');
    expect(toast.message).toContain("Row 3:");
    expect(toast.message).toContain("already exists");
  });
});
