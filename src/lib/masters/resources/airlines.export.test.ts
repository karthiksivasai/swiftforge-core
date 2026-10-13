import { unlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { exportTable } from "@/lib/io/tableIo";
import { AIRLINE_EXPORT_COLUMNS, AIRLINE_EXPORT_FORMATS } from "@/lib/masters/resources/airlines";

const rows = [{ airlineName: "EMIRATES AIRLINE", product: "SPX" }];

describe("airline export", () => {
  it("offers Excel, PDF, CSV, and Print for Airlines Name and Product", async () => {
    expect([...AIRLINE_EXPORT_FORMATS]).toEqual(["excel", "csv", "pdf", "print"]);
    expect(AIRLINE_EXPORT_COLUMNS.map((column) => column.header)).toEqual([
      "Airlines Name",
      "Product",
    ]);

    const downloads: string[] = [];
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:airline",
      revokeObjectURL: () => undefined,
    });
    vi.stubGlobal("document", {
      createElement: () => ({
        href: "",
        download: "",
        click() {
          downloads.push(this.download);
        },
      }),
      body: {
        appendChild() {},
        removeChild() {},
      },
    });
    vi.stubGlobal("window", {
      open: () => ({
        document: {
          body: "",
          write(html: string) {
            expect(html).toContain("Airlines Name");
            expect(html).toContain("EMIRATES AIRLINE");
            expect(html).toContain("SPX");
          },
          close() {},
        },
      }),
    });

    for (const format of AIRLINE_EXPORT_FORMATS) {
      await exportTable({
        format,
        filename: "airlines",
        title: "Airlines",
        columns: [...AIRLINE_EXPORT_COLUMNS],
        rows,
      });
    }

    expect(downloads).toEqual(["airlines.xlsx", "airlines.csv"]);
    unlinkSync(join(process.cwd(), "airlines.pdf"));
    vi.unstubAllGlobals();
  });
});
