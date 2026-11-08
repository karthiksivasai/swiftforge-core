/** Validate and price AWB proforma rows imported from the Excel template. */
import * as XLSX from "xlsx";

export const PROFORMA_IMPORT_HEADERS = [
  "Box No",
  "Packages",
  "Description",
  "HSN Code",
  "Quantity",
  "Weight",
  "Unit",
  "Rate",
  "IGST %",
  "IGST Amount",
] as const;

export type ProformaImportLine = {
  id: string;
  boxNo: string;
  packages: string;
  description: string;
  hsCode: string;
  quantity: string;
  weight: string;
  unit: string;
  rate: string;
  amount: string;
  igstPercent: string;
  igstAmount: string;
};

export type ProformaImportError = {
  row: number;
  column: string;
  value: string;
  message: string;
};

export type ProformaImportResult = {
  lines: ProformaImportLine[];
  warnings: string[];
  errors: ProformaImportError[];
};

const DEFAULT_UNIT = "PCS";

function cell(row: Record<string, string>, header: string): string {
  const wanted = header.trim().toLowerCase();
  const key = Object.keys(row).find((name) => name.trim().toLowerCase() === wanted);
  return key ? String(row[key] ?? "").trim() : "";
}

function num(value: string): number {
  const parsed = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function money(value: number): string {
  return (Number.isFinite(value) ? value : 0).toFixed(2);
}

function rowIsBlank(row: Record<string, string>): boolean {
  return PROFORMA_IMPORT_HEADERS.every((header) => !cell(row, header));
}

function matchUnit(value: string, units: string[]): string | null {
  const wanted = value.trim().toUpperCase();
  return units.find((unit) => unit.trim().toUpperCase() === wanted) ?? null;
}

export function proformaImportErrorText(error: ProformaImportError): string {
  return `Row ${error.row} | ${error.column} | ${error.value} | ${error.message}`;
}

function cellText(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.v == null) return "";
  if (cell.t === "s" || cell.t === "str") return String(cell.v).trim();
  if (typeof cell.w === "string" && cell.w.trim()) return cell.w.trim();
  return String(cell.v).trim();
}

/** Read row 1 as headers and every following row as text, so an HSN stored as text keeps its zeros. */
export function rowsFromProformaWorkbook(buffer: ArrayBuffer): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  if (!sheet?.["!ref"]) return { headers: [], rows: [] };
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const headers: string[] = [];
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })] as XLSX.CellObject | undefined;
    headers.push(cellText(cell));
  }
  const rows: Record<string, string>[] = [];
  for (let rowIndex = range.s.r + 1; rowIndex <= range.e.r; rowIndex += 1) {
    const record: Record<string, string> = {};
    headers.forEach((header, offset) => {
      if (!header) return;
      const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: range.s.c + offset })] as
        | XLSX.CellObject
        | undefined;
      record[header] = cellText(cell);
    });
    rows.push(record);
  }
  return { headers, rows };
}

export function missingProformaHeaders(headers: string[]): string[] {
  const present = new Set(headers.map((header) => header.trim().toLowerCase()));
  return PROFORMA_IMPORT_HEADERS.filter((header) => !present.has(header.toLowerCase()));
}

/** Amount and IGST are derived. A supplied IGST amount that differs becomes a warning. */
export function importProformaRows(
  rows: Record<string, string>[],
  options?: { units?: string[]; ids?: string[] },
): ProformaImportResult {
  const units = options?.units?.length ? options.units : [DEFAULT_UNIT];
  const lines: ProformaImportLine[] = [];
  const warnings: string[] = [];
  const errors: ProformaImportError[] = [];
  let idIndex = 0;

  rows.forEach((row, index) => {
    if (rowIsBlank(row)) return;
    const rowNo = index + 2;
    const fail = (column: string, value: string, message: string) => {
      errors.push({ row: rowNo, column, value, message });
    };

    const boxNo = cell(row, "Box No") || "Box-1";
    const packagesText = cell(row, "Packages");
    const packages = Number(packagesText.replace(/,/g, ""));
    if (!packagesText || !Number.isInteger(packages) || packages < 1) {
      fail("Packages", packagesText, "Packages must be a whole number of at least 1");
    }

    const description = cell(row, "Description");
    if (!description) fail("Description", description, "Description is required");

    const hsn = cell(row, "HSN Code");
    if (!/^\d{4}$|^\d{6}$|^\d{8}$/.test(hsn)) {
      fail("HSN Code", hsn, "HSN Code must be 4, 6, or 8 digits");
    }

    const quantityText = cell(row, "Quantity");
    const quantity = num(quantityText);
    if (!quantityText || !(quantity > 0)) {
      fail("Quantity", quantityText, "Quantity must be greater than 0");
    }

    const weightText = cell(row, "Weight");
    const weight = weightText ? num(weightText) : 0;
    if (weightText && (!Number.isFinite(weight) || weight < 0)) {
      fail("Weight", weightText, "Weight must be 0 or more");
    }

    const unitText = cell(row, "Unit");
    const unit = unitText ? matchUnit(unitText, units) : matchUnit(DEFAULT_UNIT, units);
    if (!unit) {
      fail("Unit", unitText || DEFAULT_UNIT, "Unit is not in the Unit Master");
    }

    const rateText = cell(row, "Rate");
    const rate = num(rateText);
    if (!rateText || !Number.isFinite(rate) || rate < 0) {
      fail("Rate", rateText, "Rate is required and must be 0 or more");
    }

    const igstText = cell(row, "IGST %");
    const igst = igstText ? num(igstText) : 0;
    if (igstText && (!Number.isFinite(igst) || igst < 0 || igst > 100)) {
      fail("IGST %", igstText, "IGST % must be between 0 and 100");
    }

    if (errors.some((error) => error.row === rowNo)) return;

    const amount = quantity * rate;
    const igstAmount = (amount * igst) / 100;
    const suppliedIgst = cell(row, "IGST Amount");
    if (suppliedIgst) {
      const supplied = num(suppliedIgst);
      if (!Number.isFinite(supplied) || Math.abs(supplied - igstAmount) > 0.009) {
        warnings.push(
          `Row ${rowNo} | IGST Amount | ${suppliedIgst} | Calculated ${money(igstAmount)} was used`,
        );
      }
    }

    lines.push({
      id: options?.ids?.[idIndex] ?? crypto.randomUUID(),
      boxNo,
      packages: String(packages),
      description,
      hsCode: hsn,
      quantity: String(quantity),
      weight: String(weight),
      unit: unit ?? DEFAULT_UNIT,
      rate: String(rate),
      amount: money(amount),
      igstPercent: String(igst),
      igstAmount: money(igstAmount),
    });
    idIndex += 1;
  });

  if (errors.length > 0) return { lines: [], warnings: [], errors };
  return { lines, warnings, errors: [] };
}

type StoredProforma = { lines?: unknown } & Record<string, unknown>;

/** Recompute amount and IGST from quantity, rate, and percent. */
export function recalculateProformaAmounts<T extends StoredProforma>(proforma: T): T {
  const lines = Array.isArray(proforma.lines) ? proforma.lines : [];
  return {
    ...proforma,
    lines: lines.map((line) => {
      if (!line || typeof line !== "object") return line;
      const row = line as Record<string, unknown>;
      const quantity = Number.parseFloat(String(row.quantity ?? "0")) || 0;
      const rate = Number.parseFloat(String(row.rate ?? "0")) || 0;
      const igst = Number.parseFloat(String(row.igstPercent ?? "0")) || 0;
      const amount = quantity * rate;
      return {
        ...row,
        amount: money(amount),
        igstAmount: money((amount * igst) / 100),
      };
    }),
  };
}
