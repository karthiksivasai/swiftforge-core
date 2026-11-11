import { describe, expect, it } from "vitest";

import { matrixFromTabular, parseZoneRateMatrix } from "./file";

const sheet = [
  ["Zone wise Rate"],
  ["Service", "Weight", 8, "US"],
  ["WORLDWIDE EXPRESS SAVER", 0.5, 1441.162, 1057.1],
  ["WORLDWIDE EXPRESS SAVER", 1, 1540.614, 1231.8],
  ["WORLDWIDE EXPRESS SAVER", 0.5, 10, 11],
  ["WORLDWIDE EXPRESS SAVER", 1, 20, 21],
  ["WORLDWIDE EXPRESS SAVER", 1.5, 30, 31],
  ["WORLDWIDE EXPRESS SAVER", "20-45", 500.004, 600],
  ["WORLDWIDE EXPRESS SAVER", "45-70", "", 700],
];

describe("zone rate sheet", () => {
  it("keeps the later copy of a repeated weight and prices the cell as freight", () => {
    const parsed = parseZoneRateMatrix(sheet);
    expect(parsed.error).toBeNull();
    const zone8 = parsed.rows.filter((row) => row.zone === "8");
    expect(zone8.map((row) => [row.weight_from, row.weight_to, row.amount])).toEqual([
      [0, 0.5, 10],
      [0.5, 1, 20],
      [1, 1.5, 30],
      [20, 45, 500],
    ]);
    const us = parsed.rows.find((row) => row.zone === "US" && row.weight_to === 0.5);
    expect(us?.amount).toBe(11);
    expect(parsed.rows.find((row) => row.zone === "US" && row.weight_label === "45-70")?.amount).toBe(700);
    expect(parsed.rows.some((row) => row.zone === "8" && row.weight_label === "45-70")).toBe(false);
  });

  it("reads a title row and a Service / Weight header from a csv", () => {
    const csv = [
      "Zone wise Rate",
      "Service,Weight,8",
      "WORLDWIDE EXPRESS SAVER,0.5,1441.16",
      "WORLDWIDE EXPRESS SAVER,20-45,2500",
    ].join("\n");
    const parsed = parseZoneRateMatrix(matrixFromTabular(csv));
    expect(parsed.error).toBeNull();
    expect(parsed.rows).toEqual([
      {
        row_no: 3,
        service: "WORLDWIDE EXPRESS SAVER",
        zone: "8",
        weight_label: "0.5",
        weight_from: 0,
        weight_to: 0.5,
        amount: 1441.16,
      },
      {
        row_no: 4,
        service: "WORLDWIDE EXPRESS SAVER",
        zone: "8",
        weight_label: "20-45",
        weight_from: 20,
        weight_to: 45,
        amount: 2500,
      },
    ]);
  });

  it("rejects a file that is not this grid", () => {
    expect(parseZoneRateMatrix([["Branch", "Account No"], ["HYD", "TEST"]]).error).toMatch(/Service and Weight/);
  });

  it("reads the courier UPS saver workbook when ZONE_RATE_XLSX is set", async () => {
    const { existsSync, readFileSync } = await import("node:fs");
    const file = process.env.ZONE_RATE_XLSX;
    if (!file || !existsSync(file)) return;
    const parsed = parseZoneRateMatrix(matrixFromTabular(readFileSync(file)));
    expect(parsed.error).toBeNull();
    expect(parsed.problems).toEqual([]);
    const zone8 = parsed.rows.filter((row) => row.zone === "8");
    expect(zone8).toHaveLength(44);
    expect(zone8.find((row) => row.weight_to === 0.5)?.amount).toBe(1441.16);
    expect(zone8.find((row) => row.weight_to === 1)?.amount).toBe(1540.61);
    expect(zone8.find((row) => row.weight_label === "20-45")).toMatchObject({ weight_from: 20, weight_to: 45 });
    expect(zone8.find((row) => row.weight_to === 20)?.weight_from).toBe(19.5);
    expect(new Set(parsed.rows.map((row) => row.service))).toEqual(new Set(["WORLDWIDE EXPRESS SAVER"]));
    expect(parsed.rows.length).toBe(21 * 44);
  });
});
