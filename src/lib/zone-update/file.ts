import type { CsvRecord } from "@/lib/masters/core/csv";

/** Columns a zone file must use. Service is accepted as ServiceType. */
export const ZONE_IMPORT_COLUMNS = [
  "Origin",
  "Vendor",
  "Product",
  "Country",
  "Destination",
  "Zone",
  "ServiceType",
] as const;

export type ZoneImportColumn = (typeof ZONE_IMPORT_COLUMNS)[number];

export type ZoneFileRow = {
  row_no: number;
  origin: string;
  vendor: string;
  product: string;
  country: string;
  destination: string;
  zone: string;
  service: string;
};

const HEADER_ALIASES: Record<string, ZoneImportColumn> = {
  origin: "Origin",
  vendor: "Vendor",
  product: "Product",
  country: "Country",
  destination: "Destination",
  zone: "Zone",
  servicetype: "ServiceType",
  service: "ServiceType",
};

function headerKey(header: string): ZoneImportColumn | null {
  return HEADER_ALIASES[header.trim().toLowerCase()] ?? null;
}

/** Map a parsed sheet onto the import columns. Row numbers match the sheet (header is row 1). */
export function zoneRowsFromTable(headers: string[], rows: CsvRecord[]): {
  rows: ZoneFileRow[];
  missing: string[];
} {
  const byColumn = new Map<ZoneImportColumn, string>();
  for (const header of headers) {
    const column = headerKey(header);
    if (column && !byColumn.has(column)) byColumn.set(column, header);
  }
  const missing = ZONE_IMPORT_COLUMNS.filter((column) => !byColumn.has(column));
  if (missing.length > 0) return { rows: [], missing };

  const parsed: ZoneFileRow[] = [];
  rows.forEach((row, index) => {
    const value = (column: ZoneImportColumn) => (row[byColumn.get(column)!] ?? "").trim();
    const item: ZoneFileRow = {
      row_no: index + 2,
      origin: value("Origin"),
      vendor: value("Vendor"),
      product: value("Product"),
      country: value("Country"),
      destination: value("Destination"),
      zone: value("Zone"),
      service: value("ServiceType"),
    };
    if (
      item.origin ||
      item.vendor ||
      item.product ||
      item.country ||
      item.destination ||
      item.zone ||
      item.service
    ) {
      parsed.push(item);
    }
  });
  return { rows: parsed, missing: [] };
}

export type ZoneCandidate = {
  originId?: string | null;
  destinationId?: string | null;
  countryId?: string | null;
  vendorId?: string | null;
  productId?: string | null;
  service?: string | null;
  zoneId: string;
  zoneCode: string;
  effectiveDate: string;
};

export type ZoneQuery = {
  originId?: string | null;
  destinationId?: string | null;
  countryId?: string | null;
  vendorId?: string | null;
  productId?: string | null;
  service?: string | null;
  asOf: string;
};

function blank(value: string | null | undefined): boolean {
  return !value || !value.trim();
}

function same(left: string | null | undefined, right: string | null | undefined): boolean {
  return (left ?? "").trim().toUpperCase() === (right ?? "").trim().toUpperCase();
}

/** Same choice as app.resolve_rating_zone: the most specific mapping in force, else none. */
export function pickZone(mappings: ZoneCandidate[], query: ZoneQuery): ZoneCandidate | null {
  const matches = mappings
    .filter((row) => row.effectiveDate <= query.asOf)
    .filter((row) => blank(row.originId) || row.originId === query.originId)
    .filter((row) => blank(row.vendorId) || row.vendorId === query.vendorId)
    .filter((row) => blank(row.productId) || row.productId === query.productId)
    .filter((row) => blank(row.service) || same(row.service, query.service))
    .filter((row) => blank(row.destinationId) || row.destinationId === query.destinationId)
    .filter((row) => blank(row.countryId) || row.countryId === query.countryId);
  matches.sort((a, b) => {
    const score = (row: ZoneCandidate) =>
      (blank(row.destinationId) ? 0 : 16) +
      (blank(row.countryId) ? 0 : 8) +
      (blank(row.originId) ? 0 : 4) +
      (blank(row.vendorId) ? 0 : 2) +
      (blank(row.productId) ? 0 : 2) +
      (blank(row.service) ? 0 : 1);
    const byScore = score(b) - score(a);
    if (byScore !== 0) return byScore;
    return b.effectiveDate.localeCompare(a.effectiveDate);
  });
  return matches[0] ?? null;
}
