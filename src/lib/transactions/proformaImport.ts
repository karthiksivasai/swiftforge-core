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
export const PROFORMA_IMPORT_MAX_ROWS = 1000;
export const PROFORMA_IGST_STANDARD_RATES = [0, 0.1, 0.25, 3, 5, 12, 18, 28] as const;

export type ProformaEntryInput = {
  boxNo: string;
  packages: string;
  description: string;
  hsnCode: string;
  quantity: string;
  weight: string;
  unit: string;
  rate: string;
  igstPercent?: string;
  igstAmount?: string;
  units: string[];
  row?: number;
  maxPiecesCount?: number;
};

function stripControls(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

/** Locale-independent number: "1,000.50" is accepted, "12abc" is not. */
export function parseProformaNumber(value: string): number | null {
  const cleaned = value.trim().replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function decimalPlaces(value: string): number {
  const cleaned = value.trim().replace(/,/g, "");
  const dot = cleaned.indexOf(".");
  return dot < 0 ? 0 : cleaned.length - dot - 1;
}

function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function cell(row: Record<string, string>, header: string): string {
  const wanted = header.trim().toLowerCase();
  const key = Object.keys(row).find((name) => name.trim().toLowerCase() === wanted);
  return key ? String(row[key] ?? "").trim() : "";
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

function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function proformaErrorReportCsv(errors: ProformaImportError[]): string {
  const lines = ["Row,Column,Value,Message"];
  for (const error of errors) {
    lines.push(
      [String(error.row), error.column, error.value, error.message].map(csvCell).join(","),
    );
  }
  return lines.join("\n");
}

export function validateProformaEntry(input: ProformaEntryInput): {
  line: Omit<ProformaImportLine, "id"> | null;
  errors: ProformaImportError[];
  warnings: string[];
} {
  const rowNo = input.row ?? 0;
  const errors: ProformaImportError[] = [];
  const warnings: string[] = [];
  const fail = (column: string, value: string, message: string) => {
    errors.push({ row: rowNo, column, value, message });
  };
  const units = input.units.length > 0 ? input.units : [DEFAULT_UNIT];

  const boxText = stripControls(input.boxNo);
  const boxNo = boxText || "Box-1";
  if (boxNo.length > 20) fail("Box No", boxText, "Box No must be 20 characters or less");

  if (input.maxPiecesCount != null && input.maxPiecesCount > 0) {
    const boxMatch = boxNo.match(/(?:box[-_\s]*)?(\d+)/i);
    if (boxMatch) {
      const boxIdx = parseInt(boxMatch[1]!, 10);
      if (boxIdx > input.maxPiecesCount) {
        fail("Box No", boxText, `Box No (${boxIdx}) cannot exceed shipment piece count (${input.maxPiecesCount})`);
      }
    }
  }

  const packagesText = input.packages.trim();
  let packages = 1;
  if (packagesText) {
    const parsed = parseProformaNumber(packagesText);
    if (parsed == null || !Number.isInteger(parsed) || parsed < 1) {
      fail("Packages", packagesText, "Packages must be a whole number of at least 1");
    } else {
      packages = parsed;
    }
  }

  const description = stripControls(input.description);
  if (!description) fail("Description", input.description, "Description is required");
  else if (description.length > 250) fail("Description", description, "Description must be 250 characters or less");

  const hsn = input.hsnCode.trim();
  if (!/^\d{4}$|^\d{6}$|^\d{8}$/.test(hsn)) {
    fail("HSN Code", hsn, "HSN Code must be 4, 6, or 8 digits");
  }

  const quantityText = input.quantity.trim();
  const quantity = quantityText ? parseProformaNumber(quantityText) : null;
  if (!quantityText || quantity == null || !(quantity > 0)) {
    fail("Quantity", quantityText, "Quantity must be greater than 0");
  } else if (decimalPlaces(quantityText) > 3) {
    fail("Quantity", quantityText, "Quantity can have at most 3 decimals");
  }

  const weightText = input.weight.trim();
  let weight = 0;
  if (weightText) {
    const parsed = parseProformaNumber(weightText);
    if (parsed == null || parsed < 0) fail("Weight", weightText, "Weight must be 0 or more");
    else if (decimalPlaces(weightText) > 3) fail("Weight", weightText, "Weight can have at most 3 decimals");
    else weight = parsed;
  }

  const unitText = input.unit.trim();
  const unit = unitText ? matchUnit(unitText, units) : matchUnit(DEFAULT_UNIT, units);
  if (!unit) {
    fail("Unit", unitText || DEFAULT_UNIT, `Unit '${unitText || DEFAULT_UNIT}' not found. Add it via Add Unit`);
  }

  const rateText = input.rate.trim();
  const rate = rateText ? parseProformaNumber(rateText) : null;
  if (!rateText || rate == null || rate < 0) fail("Rate", rateText, "Rate is required and must be 0 or more");
  else if (decimalPlaces(rateText) > 2) fail("Rate", rateText, "Rate can have at most 2 decimals");

  const igstText = (input.igstPercent ?? "").trim();
  let igst = 0;
  if (igstText) {
    const parsed = parseProformaNumber(igstText);
    if (parsed == null || parsed < 0 || parsed > 100) fail("IGST %", igstText, "IGST % must be between 0 and 100");
    else igst = parsed;
  }

  if (errors.length > 0 || quantity == null || rate == null || !unit) {
    return { line: null, errors, warnings: [] };
  }

  const amount = roundTo(quantity * rate, 2);
  const igstAmount = roundTo((amount * igst) / 100, 2);
  if (igstText && !PROFORMA_IGST_STANDARD_RATES.some((rate) => Math.abs(rate - igst) < 0.0001)) {
    warnings.push(`Row ${rowNo}: IGST % ${igst} is not a standard rate`);
  }
  const suppliedText = (input.igstAmount ?? "").trim();
  if (suppliedText) {
    const supplied = parseProformaNumber(suppliedText);
    if (supplied != null && Math.abs(supplied - igstAmount) > 1) {
      warnings.push(
        `Row ${rowNo}: IGST Amount in file (${suppliedText}) replaced with calculated value (${money(igstAmount)})`,
      );
    }
  }

  return {
    line: {
      boxNo,
      packages: String(packages),
      description,
      hsCode: hsn,
      quantity: String(quantity),
      weight: String(weight),
      unit,
      rate: String(rate),
      amount: money(amount),
      igstPercent: String(igst),
      igstAmount: money(igstAmount),
    },
    errors: [],
    warnings,
  };
}

function cellText(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.v == null) return "";
  if (cell.t === "s") return String(cell.v).trim();
  if (typeof cell.w === "string" && cell.w.trim()) return cell.w.trim();
  return String(cell.v).trim();
}

/** Read row 1 as headers and every following row as text, so an HSN stored as text keeps its zeros. */
export function rowsFromProformaWorkbook(buffer: ArrayBuffer): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false, cellFormula: false });
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

export function excelBytesLookValid(name: string, bytes: Uint8Array): boolean {
  const lower = name.toLowerCase();
  if (lower.endsWith(".xlsx")) return bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (lower.endsWith(".xls")) {
    return bytes.length > 7 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  }
  return false;
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

  let dataRows = 0;
  rows.forEach((row, index) => {
    if (rowIsBlank(row)) return;
    dataRows += 1;
    if (dataRows > PROFORMA_IMPORT_MAX_ROWS) return;
    const checked = validateProformaEntry({
      boxNo: cell(row, "Box No"),
      packages: cell(row, "Packages"),
      description: cell(row, "Description"),
      hsnCode: cell(row, "HSN Code"),
      quantity: cell(row, "Quantity"),
      weight: cell(row, "Weight"),
      unit: cell(row, "Unit"),
      rate: cell(row, "Rate"),
      igstPercent: cell(row, "IGST %"),
      igstAmount: cell(row, "IGST Amount"),
      units,
      row: index + 2,
    });
    errors.push(...checked.errors);
    if (checked.line && checked.errors.length === 0) {
      warnings.push(...checked.warnings);
      lines.push({
        ...checked.line,
        id: options?.ids?.[idIndex] ?? crypto.randomUUID(),
      });
      idIndex += 1;
    }
  });
  if (dataRows > PROFORMA_IMPORT_MAX_ROWS) {
    return {
      lines: [],
      warnings: [],
      errors: [
        {
          row: PROFORMA_IMPORT_MAX_ROWS + 1,
          column: "File",
          value: String(dataRows),
          message: `The file has more than ${PROFORMA_IMPORT_MAX_ROWS} data rows`,
        },
      ],
    };
  }

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
