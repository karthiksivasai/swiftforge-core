import { describe, expect, it } from "vitest";

import { mapCsvToImportRows, parseCsv } from "@/lib/masters/core/csv";
import {
  EXPENSE_IMPORT_HEADER_ALIASES,
  expenseHeadsResource,
  normalizeExpenseImportRow,
} from "@/lib/masters/resources/expenseHeads";

const SAMPLE_CSV = `"Name","Is Authorized"
"NSS CARGO","1"
"WORLD FIRST","1"
"ICL","1"
"ASD LOGISTICS","1"
"ATLANTIC","1"
"OFFICE EXPENSES","1"
"STATIONARY","1"
"FOOD","1"
`;

describe("expense CSV import (CourierWala Name/Is Authorized)", () => {
  it("maps Name/Is Authorized and fills codes from name", () => {
    const parsed = parseCsv(SAMPLE_CSV);
    expect(parsed.rows).toHaveLength(8);

    const mapped = mapCsvToImportRows(parsed.rows, expenseHeadsResource.importColumns, {
      aliases: EXPENSE_IMPORT_HEADER_ALIASES,
    }).map((rec) => normalizeExpenseImportRow(rec));

    expect(mapped[0]).toMatchObject({
      code: "NSS_CARGO",
      name: "NSS CARGO",
      kind: "EXPENSE",
      authorization_required: "1",
    });
    expect(mapped.every((r) => String(r.code || "").length > 0)).toBe(true);
    expect(mapped.every((r) => String(r.name || "").length > 0)).toBe(true);
  });
});
