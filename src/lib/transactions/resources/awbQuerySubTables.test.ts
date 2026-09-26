import { describe, expect, it } from "vitest";
import {
  getVolumetricDetails,
  getInscanDetails,
  getManifestDetails,
  getManifestInscanDetails,
  fetchAwbSubTables,
} from "./awbQuery";

describe("AWB Query Sub-Tables Backend Resource Logic (Category B)", () => {
  it("fetches Volumetric Details without throwing for non-existent AWB", async () => {
    const res = await getVolumetricDetails("NONEXISTENT_AWB_999");
    expect(Array.isArray(res)).toBe(true);
  });

  it("fetches Inscan Details without throwing for non-existent AWB", async () => {
    const res = await getInscanDetails("NONEXISTENT_AWB_999");
    expect(Array.isArray(res)).toBe(true);
  });

  it("fetches Manifest Details without throwing for non-existent AWB", async () => {
    const res = await getManifestDetails("NONEXISTENT_AWB_999");
    expect(Array.isArray(res)).toBe(true);
  });

  it("fetches Manifest Inscan Details without throwing for non-existent AWB", async () => {
    const res = await getManifestInscanDetails("NONEXISTENT_AWB_999");
    expect(Array.isArray(res)).toBe(true);
  });

  it("fetchAwbSubTables safely executes Promise.allSettled and returns 4 sub-table arrays", async () => {
    const res = await fetchAwbSubTables("30403927");
    expect(res).toBeDefined();
    expect(Array.isArray(res.volumetric)).toBe(true);
    expect(Array.isArray(res.inscan)).toBe(true);
    expect(Array.isArray(res.manifest)).toBe(true);
    expect(Array.isArray(res.manifestInscan)).toBe(true);
  });
});
