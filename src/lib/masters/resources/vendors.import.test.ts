import { describe, expect, it } from "vitest";

import { mapCsvToImportRows, parseCsv } from "@/lib/masters/core/csv";
import {
  VENDOR_IMPORT_HEADER_ALIASES,
  normalizeVendorImportRow,
  vendorsResource,
} from "@/lib/masters/resources/vendors";

const SAMPLE_CSV = `"Vendor Code","Vendor Name","Address","Phone 1","Phone 2","Contact Person","Address 2","Address3","Address4","VENDOR_EMAIL","VENDOR_FAX","VENDOR_MOBILE","origin","Status","Currency","GSTNo"
"AIC","ATLANTIC INTERNATIONAL COURIER","\u00a0","\u00a0","\u00a0","","","Hyderabad","TELANGANA","","","","HYDERABAD","False","INR",""
"ARX","ARAMEX","\u00a0","\u00a0","\u00a0","","","","","","","","HYDERABAD","True","INR",""
`;

describe("vendor CSV import (CourierWala)", () => {
  it("maps Vendor Code/Name and fills mobile + global from Status", () => {
    const parsed = parseCsv(SAMPLE_CSV);
    const mapped = mapCsvToImportRows(parsed.rows, vendorsResource.importColumns, {
      aliases: VENDOR_IMPORT_HEADER_ALIASES,
    }).map((rec) => normalizeVendorImportRow(rec));

    expect(mapped).toHaveLength(2);
    expect(mapped[0]).toMatchObject({
      code: "AIC",
      name: "ATLANTIC INTERNATIONAL COURIER",
      city: "Hyderabad",
      state_code: "TELANGANA",
      origin_destination_code: "HYDERABAD",
      mobile: "0000000000",
      status: "ACTIVE",
      is_global: "False",
      currency: "INR",
    });
    expect(mapped[1]).toMatchObject({
      code: "ARX",
      is_global: "True",
      status: "ACTIVE",
    });
  });
});
