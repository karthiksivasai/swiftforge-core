import { describe, expect, it } from "vitest";

import {
  AWB_MTS_EXAMPLE_ROW,
  AWB_MTS_HEADERS,
  mtsFileAccepted,
  mtsPiecesFromRow,
  mtsPiecesFromRows,
} from "./awbMtsImport";

const box = {
  "Measurement Unit": "C",
  "Actl Weight/PCS": "2",
  "No. Of Pieces": "2",
  Length: "50",
  Width: "40",
  Height: "30",
};

describe("AWB MTS import", () => {
  it("uses the template headers", () => {
    expect(AWB_MTS_HEADERS).toEqual([
      "Measurement Unit",
      "Actl Weight/PCS",
      "No. Of Pieces",
      "Length",
      "Width",
      "Height",
    ]);
  });

  it("imports the template example row", () => {
    const { lines, errors } = mtsPiecesFromRows([AWB_MTS_EXAMPLE_ROW]);
    expect(errors).toEqual([]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      actualWeightPerPc: "12.000",
      pieces: "1",
      length: "12",
      breadth: "21",
      height: "23",
    });
  });

  it("splits a multi-piece centimetre row into one line per box", () => {
    const lines = mtsPiecesFromRow(box, { ids: ["box-1", "box-2"] });

    // 50×40×30 / 5000 = 12 kg. Actual per piece is 2, so chargeable is 12.
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      id: "box-1",
      childAwb: "",
      actualWeightPerPc: "2.000",
      pieces: "1",
      length: "50",
      breadth: "40",
      height: "30",
      volWeight: "12.000",
      chargeWeight: "12.000",
      division: "5000",
    });
    expect(lines[1]?.id).toBe("box-2");
    expect(lines[1]?.pieces).toBe("1");
  });

  it("keeps actual weight when it is higher than volumetric weight", () => {
    const [line] = mtsPiecesFromRow({
      "Measurement Unit": "C",
      "Actl Weight/PCS": "12",
      "No. Of Pieces": "1",
      Length: "10",
      Width: "10",
      Height: "10",
    });

    expect(line?.volWeight).toBe("0.200");
    expect(line?.chargeWeight).toBe("12.000");
  });

  it("uses the carrier inch divisor when the shipment has one", () => {
    const [line] = mtsPiecesFromRow(
      {
        "Measurement Unit": "I",
        "Actl Weight/PCS": "1",
        "No. Of Pieces": "1",
        Length: "10",
        Width: "10",
        Height: "10",
      },
      { inchDivisor: 166 },
    );

    // 10×10×10 / 166 = 6.024096… kg
    expect(line?.volWeight).toBe("6.024");
    expect(line?.chargeWeight).toBe("6.024");
    expect(line?.division).toBe("166");
  });

  it("converts inches to centimetres when no carrier divisor is set", () => {
    const [line] = mtsPiecesFromRow({
      "Measurement Unit": "I",
      "Actl Weight/PCS": "1",
      "No. Of Pieces": "1",
      Length: "10",
      Width: "10",
      Height: "10",
    });

    // (10 × 2.54)³ / 5000 = 3.277 kg
    expect(line?.volWeight).toBe("3.277");
    expect(line?.division).toBe("5000");
  });

  it("reports the spreadsheet row when a unit is missing and skips blank rows", () => {
    const result = mtsPiecesFromRows([
      {},
      {
        "Measurement Unit": "X",
        "Actl Weight/PCS": "1",
        "No. Of Pieces": "1",
        Length: "1",
        Width: "1",
        Height: "1",
      },
    ]);

    expect(result.lines).toEqual([]);
    expect(result.errors).toEqual(['Row 3: Measurement Unit must be C or I (found "X")']);
  });

  it("accepts the template formats and rejects other file types", () => {
    expect(mtsFileAccepted("AWBMtsFormat.xlsx")).toBe(true);
    expect(mtsFileAccepted("pieces.XLS")).toBe(true);
    expect(mtsFileAccepted("pieces.csv")).toBe(true);
    expect(mtsFileAccepted("notes.txt")).toBe(false);
    expect(mtsFileAccepted("photo.pdf")).toBe(false);
  });
});