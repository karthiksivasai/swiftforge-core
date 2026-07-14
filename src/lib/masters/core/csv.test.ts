import { describe, it, expect } from "vitest";

import { parseCsv, toCsv, mapCsvToImportRows, csvTemplate } from "./csv";

describe("parseCsv", () => {
  it("parses a simple file into header-keyed records", () => {
    const { headers, rows } = parseCsv("code,name\nIN,India\nUS,United States");
    expect(headers).toEqual(["code", "name"]);
    expect(rows).toEqual([
      { code: "IN", name: "India" },
      { code: "US", name: "United States" },
    ]);
  });

  it("strips a leading UTF-8 BOM (Excel exports)", () => {
    const { headers } = parseCsv("\uFEFFcode,name\nIN,India");
    expect(headers).toEqual(["code", "name"]);
  });

  it("handles quoted fields with embedded commas, quotes, and newlines", () => {
    const text = 'code,name\n"IN","Delhi, ""HQ""\nline2"';
    const { rows } = parseCsv(text);
    expect(rows[0]).toEqual({ code: "IN", name: 'Delhi, "HQ"\nline2' });
  });

  it("handles CRLF line endings", () => {
    const { rows } = parseCsv("code,name\r\nIN,India\r\nUS,USA\r\n");
    expect(rows).toEqual([
      { code: "IN", name: "India" },
      { code: "US", name: "USA" },
    ]);
  });

  it("ignores blank lines and trims cells/headers", () => {
    const { headers, rows } = parseCsv(" code , name \n\n IN , India \n\n");
    expect(headers).toEqual(["code", "name"]);
    expect(rows).toEqual([{ code: "IN", name: "India" }]);
  });

  it("fills absent trailing cells with empty strings", () => {
    const { rows } = parseCsv("code,name,zone\nIN,India");
    expect(rows[0]).toEqual({ code: "IN", name: "India", zone: "" });
  });

  it("returns empty structures for empty input", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });

  it("supports a custom delimiter", () => {
    const { rows } = parseCsv("code;name\nIN;India", { delimiter: ";" });
    expect(rows[0]).toEqual({ code: "IN", name: "India" });
  });
});

describe("toCsv", () => {
  it("serializes records in the given column order with a header row", () => {
    const csv = toCsv([{ code: "IN", name: "India", extra: "drop" }], ["code", "name"]);
    expect(csv).toBe("code,name\r\nIN,India");
  });

  it("quotes cells containing delimiters, quotes, or newlines", () => {
    const csv = toCsv([{ a: 'x,"y"', b: "line1\nline2" }], ["a", "b"]);
    expect(csv).toBe('a,b\r\n"x,""y""","line1\nline2"');
  });

  it("renders null/undefined cells as empty", () => {
    const csv = toCsv([{ a: null, b: undefined }], ["a", "b"]);
    expect(csv).toBe("a,b\r\n,");
  });

  it("round-trips through parseCsv", () => {
    const records = [{ code: "IN", name: "Delhi, HQ" }];
    const parsed = parseCsv(toCsv(records, ["code", "name"]));
    expect(parsed.rows).toEqual(records);
  });
});

describe("mapCsvToImportRows", () => {
  const cols = ["zone_code", "name"] as const;

  it("matches headers ignoring case, spaces, and underscores", () => {
    const rows = mapCsvToImportRows(
      [
        { "Zone Code": "Z1", Name: "North" },
        { ZONECODE: "Z2", name: "South" },
      ],
      cols,
    );
    expect(rows).toEqual([
      { zone_code: "Z1", name: "North" },
      { zone_code: "Z2", name: "South" },
    ]);
  });

  it("drops unknown columns and fills missing ones with empty strings", () => {
    const rows = mapCsvToImportRows([{ name: "North", junk: "x" }], cols);
    expect(rows).toEqual([{ zone_code: "", name: "North" }]);
  });
});

describe("csvTemplate", () => {
  it("emits a header-only row for the columns", () => {
    expect(csvTemplate(["code", "name"])).toBe("code,name");
  });
});
