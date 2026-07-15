import { describe, it, expect } from "vitest";

import { mapCsvToImportRows } from "@/lib/masters/core/csv";

describe("table io import column aliases (smoke)", () => {
  it("maps Product Code style headers used by DataIoToolbar exports", () => {
    const rows = mapCsvToImportRows(
      [{ "Product Code": "DOX", "Product Name": "Documents", "Product Type": "Domestic" }],
      ["code", "name", "product_type_code"],
      {
        aliases: {
          code: ["Product Code"],
          name: ["Product Name"],
          product_type_code: ["Product Type"],
        },
      },
    );
    expect(rows[0]).toEqual({
      code: "DOX",
      name: "Documents",
      product_type_code: "Domestic",
    });
  });
});
