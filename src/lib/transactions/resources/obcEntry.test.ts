import { describe, expect, it } from "vitest";
import {
  listObcEntries,
  saveObcEntry,
  deleteObcEntry,
} from "./obcEntry";

describe("OBC Entry Backend Resource Logic", () => {
  it("fetches list of OBC entries from DB", async () => {
    const rows = await listObcEntries();
    expect(Array.isArray(rows)).toBe(true);
  });

  it("rejects saveObcEntry when manifestNo is missing", async () => {
    const res = await saveObcEntry({
      id: "test-id",
      manifestNo: "",
      despDate: "2026-08-20",
      origin: "HYD",
      destination: "BOM",
      form: {} as any,
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Manifest No is required");
  });

  it("rejects deleteObcEntry when ID is missing", async () => {
    const res = await deleteObcEntry("");
    expect(res.success).toBe(false);
    expect(res.error).toBe("ID is required for deletion");
  });
});
