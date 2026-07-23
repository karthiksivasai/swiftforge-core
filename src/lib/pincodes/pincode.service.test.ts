import { describe, expect, it } from "vitest";

import { getPincodesByPrefix } from "@/lib/pincodes/pincode.controller";
import { clearPincodeSearchCache } from "@/lib/pincodes/pincode.service";

describe("pincode autocomplete service", () => {
  it("does not search until prefix length is at least 3", async () => {
    clearPincodeSearchCache();
    await expect(getPincodesByPrefix({ prefix: "5" }, { live: false })).resolves.toEqual([]);
    await expect(getPincodesByPrefix({ prefix: "50" }, { live: false })).resolves.toEqual([]);
  });

  it("returns demo matches for 500 prefix", async () => {
    clearPincodeSearchCache();
    const rows = await getPincodesByPrefix({ prefix: "500" }, { live: false });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.pincode.startsWith("500"))).toBe(true);
    expect(rows[0]).toMatchObject({
      pincode: expect.any(String),
      city: expect.any(String),
      state: expect.any(String),
      country: "India",
    });
  });

  it("reuses cached prefix searches", async () => {
    clearPincodeSearchCache();
    const first = await getPincodesByPrefix({ prefix: "5000" }, { live: false });
    const second = await getPincodesByPrefix({ prefix: "5000" }, { live: false });
    expect(second).toBe(first);
  });
});
