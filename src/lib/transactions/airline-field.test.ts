import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { shipmentFieldsSchema } from "@/lib/transactions/schemas/shipments";

const screen = readFileSync(
  join(import.meta.dirname, "../../routes/transaction.awb-entry.tsx"),
  "utf8",
);

describe("AWB airline field", () => {
  it("selects from the airline lookup and still stores a text name", () => {
    const at = screen.indexOf('lookup="airline"');
    expect(at).toBeGreaterThan(-1);
    const field = screen.slice(Math.max(0, at - 200), at + 400);
    expect(field).toContain("airline: (v.name || v.code || \"\").trim()");
    expect(field).not.toContain("readOnly");
    const legacy = shipmentFieldsSchema.parse({
      book_date: "2026-10-13",
      airline: "AI-101",
    });
    expect(legacy.airline).toBe("AI-101");
    const fromMaster = shipmentFieldsSchema.parse({
      book_date: "2026-10-13",
      airline: "EMIRATES AIRLINE",
    });
    expect(fromMaster.airline).toBe("EMIRATES AIRLINE");
  });
});
