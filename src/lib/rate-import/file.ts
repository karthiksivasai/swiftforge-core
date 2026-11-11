import * as XLSX from "xlsx";

export type ZoneRateCell = {
  row_no: number;
  service: string;
  zone: string;
  weight_label: string;
  weight_from: number;
  weight_to: number;
  amount: number;
};

export type ZoneRateProblem = {
  row_no: number;
  zone: string;
  reason: string;
};

export type ZoneRateParse = {
  error: string | null;
  rows: ZoneRateCell[];
  problems: ZoneRateProblem[];
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundWeight(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(roundWeight(value));
  }
  return String(value).trim();
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = cellText(value).replace(/,/g, "");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

type PointRow = {
  service: string;
  weight: number;
  amounts: Map<string, { amount: number; rowNo: number }>;
};
type RangeRow = {
  service: string;
  from: number;
  to: number;
  label: string;
  amounts: Map<string, { amount: number; rowNo: number }>;
};

/**
 * The courier sheet has a title on row 1 and Service / Weight on the next header row.
 * Each zone is a column. A cell is the freight for that weight and zone, not a per-kg rate.
 * A repeated 0.5–5 kg block is the same table started again: the later copy wins.
 * A label such as 20-45 is the band above the previous point, so 20 kg keeps the 20 kg price.
 */
export function parseZoneRateMatrix(matrix: unknown[][]): ZoneRateParse {
  let headerIndex = -1;
  for (let i = 0; i < matrix.length; i += 1) {
    const row = matrix[i] ?? [];
    const service = cellText(row[0]).toLowerCase();
    const weight = cellText(row[1]).toLowerCase();
    if (service === "service" && weight === "weight") {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex < 0) {
    return {
      error: "This file is not a zone rate sheet. The header row must start with Service and Weight.",
      rows: [],
      problems: [],
    };
  }

  const header = matrix[headerIndex] ?? [];
  const zones: string[] = [];
  for (let col = 2; col < header.length; col += 1) {
    const code = cellText(header[col]);
    if (code) zones.push(code);
  }
  if (zones.length === 0) {
    return {
      error: "The header row has no zone columns after Weight.",
      rows: [],
      problems: [],
    };
  }

  const points = new Map<string, PointRow>();
  const ranges = new Map<string, RangeRow>();
  const problems: ZoneRateProblem[] = [];

  for (let i = headerIndex + 1; i < matrix.length; i += 1) {
    const row = matrix[i] ?? [];
    const rowNo = i + 1;
    const service = cellText(row[0]);
    const label = cellText(row[1]);
    if (!service && !label && row.slice(2).every((cell) => cellText(cell) === "")) continue;
    if (!service || !label) {
      problems.push({ row_no: rowNo, zone: "", reason: "Service and Weight are required" });
      continue;
    }

    const range = /^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)$/.exec(label);
    const point = asNumber(label);
    if (!range && (point == null || point <= 0)) {
      problems.push({ row_no: rowNo, zone: "", reason: `Weight "${label}" is not a number or a range such as 20-45` });
      continue;
    }

    const amounts = new Map<string, { amount: number; rowNo: number }>();
    zones.forEach((zone, index) => {
      const raw = row[index + 2];
      if (cellText(raw) === "") return;
      const amount = asNumber(raw);
      if (amount == null || amount < 0) {
        problems.push({ row_no: rowNo, zone, reason: "Amount is not a valid price" });
        return;
      }
      amounts.set(zone, { amount: roundMoney(amount), rowNo });
    });

    const serviceKey = service.toUpperCase();
    if (range) {
      const from = roundWeight(Number(range[1]));
      const to = roundWeight(Number(range[2]));
      if (!(to > from)) {
        problems.push({ row_no: rowNo, zone: "", reason: `Weight range ${label} is not a higher band` });
        continue;
      }
      ranges.set(`${serviceKey}|${from}|${to}`, { service, from, to, label, amounts });
    } else if (point != null) {
      const weight = roundWeight(point);
      points.set(`${serviceKey}|${weight}`, { service, weight, amounts });
    }
  }

  const byService = new Map<string, number[]>();
  for (const [key, point] of points) {
    const serviceKey = key.slice(0, key.lastIndexOf("|"));
    const weights = byService.get(serviceKey) ?? [];
    weights.push(point.weight);
    byService.set(serviceKey, weights);
  }

  const rows: ZoneRateCell[] = [];
  for (const [serviceKey, weights] of byService) {
    let previous = 0;
    for (const weight of [...weights].sort((a, b) => a - b)) {
      const point = points.get(`${serviceKey}|${weight}`);
      if (!point) continue;
      for (const [zone, price] of point.amounts) {
        rows.push({
          row_no: price.rowNo,
          service: point.service,
          zone,
          weight_label: String(weight),
          weight_from: previous,
          weight_to: weight,
          amount: price.amount,
        });
      }
      previous = weight;
    }
  }

  for (const range of ranges.values()) {
    for (const [zone, price] of range.amounts) {
      rows.push({
        row_no: price.rowNo,
        service: range.service,
        zone,
        weight_label: range.label,
        weight_from: range.from,
        weight_to: range.to,
        amount: price.amount,
      });
    }
  }

  rows.sort((a, b) => a.row_no - b.row_no || a.zone.localeCompare(b.zone, undefined, { numeric: true }));
  if (rows.length === 0 && problems.length === 0) {
    return { error: "The sheet has no prices under the zone columns.", rows: [], problems: [] };
  }
  return { error: null, rows, problems };
}

export function matrixFromTabular(input: ArrayBuffer | string): unknown[][] {
  const workbook = typeof input === "string"
    ? XLSX.read(input, { type: "string", raw: true })
    : XLSX.read(input, { type: "array", raw: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: true,
  }) as unknown[][];
}

export async function readZoneRateFile(file: File): Promise<ZoneRateParse> {
  const name = file.name.toLowerCase();
  const matrix = name.endsWith(".csv") || name.endsWith(".txt")
    ? matrixFromTabular(await file.text())
    : matrixFromTabular(await file.arrayBuffer());
  return parseZoneRateMatrix(matrix);
}
