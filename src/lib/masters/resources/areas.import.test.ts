import { describe, expect, it } from "vitest";

import { mapCsvToImportRows, parseCsv } from "@/lib/masters/core/csv";
import { formatImportToast } from "@/lib/masters/screen/helpers";
import { areaCreateSchema } from "@/lib/masters/schemas/areas";
import { AREA_IMPORT_HEADER_ALIASES, areasResource } from "@/lib/masters/resources/areas";

const TEMPLATE = `Area Name,Service Center,Destination,Location Name
Banjara Hills,HYD,HYDERABAD,SHOULD NOT BE THE AREA
,NO-SUCH,HYDERABAD,OTHER
`;

describe("area import template", () => {
  it("maps Area Name and Service Center, and does not treat Destination as the area name", () => {
    const parsed = parseCsv(TEMPLATE);
    const mapped = mapCsvToImportRows(parsed.rows, areasResource.importColumns, {
      aliases: AREA_IMPORT_HEADER_ALIASES,
    });

    expect(mapped[0]).toEqual({
      name: "Banjara Hills",
      service_center_code: "HYD",
      destination_code: "HYDERABAD",
    });
    expect(mapped[0]?.name).not.toBe("HYDERABAD");
    expect(mapped[0]?.name).not.toBe("SHOULD NOT BE THE AREA");
    expect(mapped[1]).toEqual({
      name: "",
      service_center_code: "NO-SUCH",
      destination_code: "HYDERABAD",
    });
  });

  it("accepts the Service Centre header spelling", () => {
    const parsed = parseCsv("Area Name,Service Centre\nWEST,BAN\n");
    const mapped = mapCsvToImportRows(parsed.rows, areasResource.importColumns, {
      aliases: AREA_IMPORT_HEADER_ALIASES,
    });
    expect(mapped[0]).toMatchObject({ name: "WEST", service_center_code: "BAN" });
  });

  it("requires an area name and a service center on the form", () => {
    expect(() =>
      areaCreateSchema.parse({
        name: " ",
        service_center_id: "11111111-1111-4111-8111-111111111111",
      }),
    ).toThrow(/Area Name is required/);
    expect(() => areaCreateSchema.parse({ name: "WEST", service_center_id: "HYD" })).toThrow(
      /Service Center/,
    );
  });

  it("reports a bad import row with its row number", () => {
    const toast = formatImportToast({
      ok: 0,
      skipped: 0,
      error_count: 2,
      errors: [
        { row_no: 1, message: 'Service center "NO-SUCH" was not found' },
        { row_no: 2, message: 'Area name "BANJARA HILLS" already exists' },
      ],
    });
    expect(toast.ok).toBe(false);
    expect(toast.message).toContain("Row 1:");
    expect(toast.message).toContain('Service center "NO-SUCH" was not found');
    expect(toast.message).toContain("Row 2:");
    expect(toast.message).toContain("already exists");
  });
});
