import { unlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { exportTable } from "@/lib/io/tableIo";
import { AREA_EXPORT_COLUMNS, AREA_EXPORT_FORMATS } from "@/lib/masters/resources/areas";

const rows = [{ areaName: "HYD", serviceCenter: "HYD — Hyderabad", destination: "HYDERABAD" }];

describe("area export", () => {
  it("offers Excel, PDF, CSV, and Print for Area Name, Service Center, and Destination", async () => {
    expect([...AREA_EXPORT_FORMATS]).toEqual(["excel", "csv", "pdf", "print"]);
    expect(AREA_EXPORT_COLUMNS.map((column) => column.header)).toEqual([
      "Area Name",
      "Service Center",
      "Destination",
    ]);

    const downloads: string[] = [];
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:area",
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
            expect(html).toContain("Area Name");
            expect(html).toContain("Service Center");
            expect(html).toContain("Destination");
            expect(html).toContain("HYD");
            expect(html).toContain("HYDERABAD");
          },
          close() {},
        },
      }),
    });

    for (const format of AREA_EXPORT_FORMATS) {
      await exportTable({
        format,
        filename: "areas",
        title: "Areas",
        columns: [...AREA_EXPORT_COLUMNS],
        rows,
      });
    }

    expect(downloads).toEqual(["areas.xlsx", "areas.csv"]);
    unlinkSync(join(process.cwd(), "areas.pdf"));
    vi.unstubAllGlobals();
  });
});
