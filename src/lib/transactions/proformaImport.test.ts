import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  excelBytesLookValid,
  importProformaRows,
  missingProformaHeaders,
  parseProformaNumber,
  proformaErrorReportCsv,
  proformaImportErrorText,
  PROFORMA_IMPORT_MAX_ROWS,
  recalculateProformaAmounts,
  rowsFromProformaWorkbook,
} from "./proformaImport";

const valid = {
  "Box No": "1",
  Packages: "2",
  Description: "Shirts",
  "HSN Code": "6109",
  Quantity: "3",
  Weight: "1.5",
  Unit: "PCS",
  Rate: "100",
  "IGST %": "18",
  "IGST Amount": "54",
};

describe("proforma import", () => {
  it("prices a valid row and keeps a short HSN", () => {
    const result = importProformaRows([valid], { units: ["PCS"], ids: ["line-1"] });
    expect(result.errors).toEqual([]);
    expect(result.lines[0]).toMatchObject({
      id: "line-1",
      boxNo: "1",
      packages: "2",
      hsCode: "6109",
      quantity: "3",
      amount: "300.00",
      igstAmount: "54.00",
      unit: "PCS",
    });
  });

  it("defaults a blank box and unit, and warns when IGST amount does not match", () => {
    const result = importProformaRows(
      [{ ...valid, "Box No": "", Unit: "", "IGST Amount": "10" }],
      { units: ["PCS", "KGS"] },
    );
    expect(result.errors).toEqual([]);
    expect(result.lines[0]?.boxNo).toBe("Box-1");
    expect(result.lines[0]?.unit).toBe("PCS");
    expect(result.lines[0]?.igstAmount).toBe("54.00");
    expect(result.warnings[0]).toContain("replaced with calculated value (54.00)");
  });

  it("imports nothing when any row is invalid", () => {
    const result = importProformaRows(
      [valid, { ...valid, "HSN Code": "12AB", Unit: "BOX" }],
      { units: ["PCS"] },
    );
    expect(result.lines).toEqual([]);
    expect(result.errors.map(proformaImportErrorText)).toEqual([
      "Row 3 | HSN Code | 12AB | HSN Code must be 4, 6, or 8 digits",
      "Row 3 | Unit | BOX | Unit 'BOX' not found. Add it via Add Unit",
    ]);
  });

  it("names a missing template header", () => {
    expect(missingProformaHeaders(["Box No", "Packages"])).toContain("HSN Code");
  });

  it("keeps a text HSN that starts with zero", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Box No", "Packages", "Description", "HSN Code", "Quantity", "Weight", "Unit", "Rate", "IGST %", "IGST Amount"],
      ["", 1, "Caps", "0610", 2, 0, "", 10, 0, 0],
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Proforma");
    const hsnCell = sheet.D2;
    if (hsnCell) {
      hsnCell.t = "s";
      hsnCell.v = "0610";
    }
    const parsed = rowsFromProformaWorkbook(XLSX.write(book, { type: "array", bookType: "xlsx" }));
    const result = importProformaRows(parsed.rows, { units: ["PCS"] });
    expect(result.lines[0]?.hsCode).toBe("0610");
    expect(result.lines[0]?.boxNo).toBe("Box-1");
    expect(result.lines[0]?.unit).toBe("PCS");
  });

  it("accepts a grouped number and rejects text in a numeric field", () => {
    expect(parseProformaNumber("1,000.50")).toBe(1000.5);
    const result = importProformaRows([{ ...valid, Quantity: "12abc" }], { units: ["PCS"] });
    expect(result.lines).toEqual([]);
    expect(result.errors[0]?.column).toBe("Quantity");
  });

  it("keeps HSN 0401 and ignores an extra column in any header order", () => {
    const result = importProformaRows(
      [{ Rate: "10", "HSN Code": "0401", Extra: "ignore", Description: "Tea", Quantity: "1", Unit: "pcs" }],
      { units: ["PCS"] },
    );
    expect(result.errors).toEqual([]);
    expect(result.lines[0]).toMatchObject({
      boxNo: "Box-1",
      packages: "1",
      hsCode: "0401",
      amount: "10.00",
      unit: "PCS",
    });
  });

  it("rejects a file with only headers as having no priced rows", () => {
    expect(importProformaRows([], { units: ["PCS"] }).lines).toEqual([]);
  });

  it("rejects more than the row limit", () => {
    const rows = Array.from({ length: PROFORMA_IMPORT_MAX_ROWS + 1 }, () => valid);
    const result = importProformaRows(rows, { units: ["PCS"] });
    expect(result.lines).toEqual([]);
    expect(result.errors[0]?.message).toContain(String(PROFORMA_IMPORT_MAX_ROWS));
  });

  it("prefixes formula-like error values in the CSV report", () => {
    const csv = proformaErrorReportCsv([
      { row: 2, column: "Description", value: "=cmd", message: "no" },
    ]);
    expect(csv).toContain(`"'=cmd"`);
  });

  it("rejects a renamed file that is not an Excel workbook", () => {
    expect(excelBytesLookValid("notes.xlsx", new Uint8Array([1, 2, 3, 4]))).toBe(false);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Box No"]]), "Sheet1");
    const xlsx = new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }));
    const xls = new Uint8Array(XLSX.write(book, { type: "array", bookType: "biff8" }));
    expect(excelBytesLookValid("AWBPerforma.xlsx", xlsx)).toBe(true);
    expect(excelBytesLookValid("AWBPerforma.xls", xls)).toBe(true);
  });

  it("recalculates stored amounts from quantity and rate", () => {
    const stored = recalculateProformaAmounts({
      currency: "INR",
      lines: [{ quantity: "2", rate: "10.5", igstPercent: "5", amount: "999", igstAmount: "1" }],
    });
    expect(stored.lines[0]).toMatchObject({ amount: "21.00", igstAmount: "1.05" });
  });
});