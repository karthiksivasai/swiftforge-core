import { describe, expect, it } from "vitest";
import { pickZone, zoneRowsFromTable, ZONE_IMPORT_COLUMNS, type ZoneCandidate } from "./file";

describe("zone file columns", () => {
  it("accepts Service as ServiceType and keeps the sheet row number", () => {
    const parsed = zoneRowsFromTable(
      ["Origin", "Vendor", "Product", "Country", "Destination", "Zone", "Service"],
      [
        {
          Origin: "HYD",
          Vendor: "UPS",
          Product: "DOX",
          Country: "AF",
          Destination: "Afghanistan",
          Zone: "8",
          Service: "WORLDWIDE EXPRESS SAVER",
        },
      ],
    );
    expect(parsed.missing).toEqual([]);
    expect(parsed.rows).toEqual([
      {
        row_no: 2,
        origin: "HYD",
        vendor: "UPS",
        product: "DOX",
        country: "AF",
        destination: "Afghanistan",
        zone: "8",
        service: "WORLDWIDE EXPRESS SAVER",
      },
    ]);
    expect(ZONE_IMPORT_COLUMNS).toEqual([
      "Origin",
      "Vendor",
      "Product",
      "Country",
      "Destination",
      "Zone",
      "ServiceType",
    ]);
  });

  it("names every missing column", () => {
    expect(zoneRowsFromTable(["Origin"], []).missing).toContain("Zone");
  });
});

const usa: ZoneCandidate = {
  originId: "hyd",
  destinationId: "usa",
  countryId: "us",
  vendorId: "ups",
  productId: "dox",
  service: "WORLDWIDE EXPRESS SAVER",
  zoneId: "zone-us",
  zoneCode: "US",
  effectiveDate: "2026-01-01",
};

describe("pickZone", () => {
  it("gives USA the file zone and leaves a different UPS service unmatched", () => {
    const query = {
      originId: "hyd",
      destinationId: "usa",
      countryId: "us",
      vendorId: "ups",
      productId: "dox",
      service: "WORLDWIDE EXPRESS SAVER",
      asOf: "2026-11-11",
    };
    expect(pickZone([usa], query)?.zoneCode).toBe("US");
    expect(pickZone([usa], { ...query, service: "EXPEDITED" })).toBeNull();
  });

  it("gives Afghanistan zone 8 and prefers a later effective date", () => {
    const older: ZoneCandidate = {
      ...usa,
      destinationId: "af",
      countryId: "af-country",
      zoneId: "zone-7",
      zoneCode: "7",
      effectiveDate: "2026-01-01",
    };
    const newer: ZoneCandidate = { ...older, zoneId: "zone-8", zoneCode: "8", effectiveDate: "2026-06-01" };
    const query = {
      originId: "hyd",
      destinationId: "af",
      countryId: "af-country",
      vendorId: "ups",
      productId: "dox",
      service: "WORLDWIDE EXPRESS SAVER",
      asOf: "2026-11-11",
    };
    expect(pickZone([older, newer], query)?.zoneCode).toBe("8");
    expect(pickZone([older, newer], { ...query, asOf: "2026-03-01" })?.zoneCode).toBe("7");
  });

  it("prefers the destination row over a country-only row", () => {
    const countryOnly: ZoneCandidate = {
      ...usa,
      destinationId: null,
      zoneCode: "COUNTRY",
      zoneId: "zone-country",
    };
    expect(
      pickZone([countryOnly, usa], {
        originId: "hyd",
        destinationId: "usa",
        countryId: "us",
        vendorId: "ups",
        productId: "dox",
        service: "WORLDWIDE EXPRESS SAVER",
        asOf: "2026-11-11",
      })?.zoneCode,
    ).toBe("US");
  });
});
