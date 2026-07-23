import { describe, expect, it } from "vitest";

import { mapCsvToImportRows, parseCsv } from "@/lib/masters/core/csv";
import {
  buildCountryImportMaps,
  COUNTRY_PINCODE_IMPORT_HEADER_ALIASES,
  countryPincodesResource,
  normalizeCountryPincodeImportRow,
  resolveCountryImportCode,
} from "@/lib/masters/resources/countryPincodes";

const SAMPLE_CSV = `Pincode,City Name,State Name,Country Name
00601,Adjuntas,PR,United States of America
J6A4X9,Repentigny,QC,Canada
`;

const COUNTRY_MAPS = buildCountryImportMaps([
  { code: "US", name: "UNITED STATES OF AMERICA" },
  { code: "CA", name: "CANADA" },
]);

describe("country pincode CSV import", () => {
  it("maps UI export headers onto import_master keys", () => {
    const parsed = parseCsv(SAMPLE_CSV);
    const mapped = mapCsvToImportRows(parsed.rows, countryPincodesResource.importColumns, {
      aliases: COUNTRY_PINCODE_IMPORT_HEADER_ALIASES,
    }).map((row) => normalizeCountryPincodeImportRow(row, COUNTRY_MAPS));

    expect(mapped).toHaveLength(2);
    expect(mapped[0]).toEqual({
      country_code: "US",
      pin_code: "00601",
      city_name: "Adjuntas",
      state_name: "PR",
    });
    expect(mapped[1]).toEqual({
      country_code: "CA",
      pin_code: "J6A4X9",
      city_name: "Repentigny",
      state_name: "QC",
    });
  });

  it("resolves country names and codes case-insensitively", () => {
    expect(resolveCountryImportCode("United States of America", COUNTRY_MAPS)).toBe("US");
    expect(resolveCountryImportCode("us", COUNTRY_MAPS)).toBe("US");
    expect(resolveCountryImportCode("CANADA", COUNTRY_MAPS)).toBe("CA");
  });
});
