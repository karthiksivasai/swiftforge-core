import { describe, expect, it } from "vitest";

import { mapCsvToImportRows, parseCsv } from "@/lib/masters/core/csv";
import {
  normalizeServiceMappingImportRow,
  SERVICE_MAPPING_IMPORT_HEADER_ALIASES,
  serviceMappingsResource,
} from "@/lib/masters/resources/serviceMappings";

const SAMPLE_CSV = `Vendor,Service Type,Billing Vendor,Min Weight,Max Weight,Status
COURIERWALA,ECONOMY,,0.5,60,Active
FEDEX,FEDEX PROMO,,0.5,999,Active
CAPTAIN INDIA,DHL PROMO,CAPTAIN INDIA,0.5,999,In-Active
`;

describe("service mapping CSV import (CourierWala ServiceMap)", () => {
  it("maps Service Type onto service and Vendor onto vendor_code", () => {
    const parsed = parseCsv(SAMPLE_CSV);
    const mapped = mapCsvToImportRows(parsed.rows, serviceMappingsResource.importColumns, {
      aliases: SERVICE_MAPPING_IMPORT_HEADER_ALIASES,
    }).map((rec) => normalizeServiceMappingImportRow(rec));

    expect(mapped).toHaveLength(3);
    expect(mapped[0]).toMatchObject({
      vendor_code: "COURIERWALA",
      service: "ECONOMY",
      service_type: "ECONOMY",
      billing_vendor_code: "",
      min_weight: "0.5",
      max_weight: "60",
      status: "ACTIVE",
    });
    expect(mapped[1]).toMatchObject({
      vendor_code: "FEDEX",
      service: "FEDEX PROMO",
      status: "ACTIVE",
    });
    expect(mapped[2]).toMatchObject({
      vendor_code: "CAPTAIN INDIA",
      service: "DHL PROMO",
      billing_vendor_code: "CAPTAIN INDIA",
      status: "INACTIVE",
    });
  });
});
