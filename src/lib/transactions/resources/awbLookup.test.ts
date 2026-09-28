import { describe, expect, it } from "vitest";
import { awbNoLookupCandidates } from "./shipments";

describe("awbNoLookupCandidates", () => {
  it("zero-pads a short numeric AWB so a previous number still matches the series", () => {
    expect(awbNoLookupCandidates("27")).toEqual(["000027", "27"]);
  });

  it("keeps an already padded AWB as a single exact key", () => {
    expect(awbNoLookupCandidates("000027")).toEqual(["000027"]);
  });

  it("does not pad a non-numeric search", () => {
    expect(awbNoLookupCandidates("HYD-27")).toEqual(["HYD-27"]);
  });
});
