/**
 * AWB multi-piece (MTS) Excel template and row parser.
 *
 * Centimetres: (L × W × H) / 5000 per piece.
 * Inches: use the carrier divisor (139 or 166) when the shipment has one.
 * Otherwise each side is converted to centimetres (× 2.54) and divided by 5000.
 * A row with more than one piece becomes one tracking line per box.
 */
import { exportTable } from "@/lib/io/tableIo";

export const AWB_MTS_TEMPLATE_NAME = "AWBMtsFormat";
export const CM_VOLUMETRIC_DIVISOR = 5000;
export const INCH_TO_CM = 2.54;

export const AWB_MTS_HEADERS = [
  "Measurement Unit",
  "Actl Weight/PCS",
  "No. Of Pieces",
  "Length",
  "Width",
  "Height",
] as const;

/** Sample row written under the bold headers. C is centimetres. */
export const AWB_MTS_EXAMPLE_ROW: Record<(typeof AWB_MTS_HEADERS)[number], string> = {
  "Measurement Unit": "C",
  "Actl Weight/PCS": "12",
  "No. Of Pieces": "1",
  Length: "12",
  Width: "21",
  Height: "23",
};

export type AwbMtsPiece = {
  id: string;
  childAwb: string;
  actualWeightPerPc: string;
  pieces: string;
  length: string;
  breadth: string;
  height: string;
  volWeight: string;
  chargeWeight: string;
  division: string;
};

export type AwbMtsImportResult = {
  lines: AwbMtsPiece[];
  errors: string[];
};

export type AwbMtsCalcOptions = {
  /** Carrier inch divisor, typically 139 or 166. Omitted values convert inches to centimetres. */
  inchDivisor?: number;
};

function cell(row: Record<string, string>, header: string): string {
  const wanted = header.trim().toLowerCase();
  const key = Object.keys(row).find((name) => name.trim().toLowerCase() === wanted);
  return key ? String(row[key] ?? "").trim() : "";
}

function num(value: string): number {
  const parsed = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money3(value: number): string {
  return (Number.isFinite(value) ? value : 0).toFixed(3);
}

function isInches(unit: string): boolean {
  const token = unit.trim().toUpperCase();
  return token === "I" || token.startsWith("INCH");
}

function isCentimetres(unit: string): boolean {
  const token = unit.trim().toUpperCase();
  return token === "C" || token.startsWith("CENT");
}

/** Volumetric kg for one box. */
export function mtsVolumetricWeight(
  length: number,
  width: number,
  height: number,
  unit: string,
  options?: AwbMtsCalcOptions,
): { volumetric: number; division: number } {
  if (isCentimetres(unit)) {
    return {
      volumetric: (length * width * height) / CM_VOLUMETRIC_DIVISOR,
      division: CM_VOLUMETRIC_DIVISOR,
    };
  }
  const carrierDivisor = options?.inchDivisor;
  if (carrierDivisor != null && carrierDivisor > 0) {
    return {
      volumetric: (length * width * height) / carrierDivisor,
      division: carrierDivisor,
    };
  }
  const lengthCm = length * INCH_TO_CM;
  const widthCm = width * INCH_TO_CM;
  const heightCm = height * INCH_TO_CM;
  return {
    volumetric: (lengthCm * widthCm * heightCm) / CM_VOLUMETRIC_DIVISOR,
    division: CM_VOLUMETRIC_DIVISOR,
  };
}

function rowIsBlank(row: Record<string, string>): boolean {
  return AWB_MTS_HEADERS.every((header) => !cell(row, header));
}

/** One spreadsheet row → one Pieces Details line per box. */
export function mtsPiecesFromRow(
  row: Record<string, string>,
  options?: AwbMtsCalcOptions & { ids?: string[] },
): AwbMtsPiece[] {
  const unit = cell(row, "Measurement Unit");
  if (!isCentimetres(unit) && !isInches(unit)) {
    throw new Error(`Measurement Unit must be C or I (found "${unit || "blank"}")`);
  }
  const pieceCount = Math.trunc(num(cell(row, "No. Of Pieces")));
  if (pieceCount <= 0) throw new Error("No. Of Pieces must be greater than 0");

  const actualPerPiece = num(cell(row, "Actl Weight/PCS"));
  const length = num(cell(row, "Length"));
  const width = num(cell(row, "Width"));
  const height = num(cell(row, "Height"));
  const { volumetric, division } = mtsVolumetricWeight(length, width, height, unit, options);
  const chargeable = Math.max(actualPerPiece, volumetric);

  return Array.from({ length: pieceCount }, (_, index) => ({
    id: options?.ids?.[index] ?? crypto.randomUUID(),
    childAwb: "",
    actualWeightPerPc: money3(actualPerPiece),
    pieces: "1",
    length: String(length),
    breadth: String(width),
    height: String(height),
    volWeight: money3(volumetric),
    chargeWeight: money3(chargeable),
    division: String(division),
  }));
}

export function mtsPiecesFromRows(
  rows: Record<string, string>[],
  options?: AwbMtsCalcOptions,
): AwbMtsImportResult {
  const lines: AwbMtsPiece[] = [];
  const errors: string[] = [];
  rows.forEach((row, index) => {
    if (rowIsBlank(row)) return;
    try {
      lines.push(...mtsPiecesFromRow(row, options));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Row ${index + 2}: ${message}`);
    }
  });
  return { lines, errors };
}

export async function downloadAwbMtsTemplate(): Promise<void> {
  await exportTable({
    format: "excel",
    filename: AWB_MTS_TEMPLATE_NAME,
    title: "AWB MTS",
    columns: AWB_MTS_HEADERS.map((header) => ({ key: header, header })),
    rows: [AWB_MTS_EXAMPLE_ROW],
  });
}
