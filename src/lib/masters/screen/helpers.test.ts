import { describe, it, expect } from "vitest";
import { z } from "zod";

import { toErrorMessage, importSummary } from "./helpers";

describe("toErrorMessage", () => {
  it("surfaces the first Zod issue message", () => {
    const err = z.object({ code: z.string().min(1, "Code is required") }).safeParse({ code: "" });
    expect(err.success).toBe(false);
    if (!err.success) expect(toErrorMessage(err.error)).toBe("Code is required");
  });

  it("uses an Error's message", () => {
    expect(toErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("falls back for empty Error messages and unknown values", () => {
    expect(toErrorMessage(new Error(""), "fallback")).toBe("fallback");
    expect(toErrorMessage("nope", "fallback")).toBe("fallback");
    expect(toErrorMessage(undefined)).toBe("Something went wrong");
  });
});

describe("importSummary", () => {
  it("reports only imported when nothing skipped or errored", () => {
    expect(importSummary({ ok: 5, skipped: 0, error_count: 0 })).toBe("Imported 5");
  });

  it("includes skipped and pluralizes errors", () => {
    expect(importSummary({ ok: 3, skipped: 2, error_count: 1 })).toBe(
      "Imported 3, skipped 2, 1 error",
    );
    expect(importSummary({ ok: 10, skipped: 0, error_count: 4 })).toBe("Imported 10, 4 errors");
  });
});
