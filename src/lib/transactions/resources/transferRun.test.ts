import { describe, expect, it, vi } from "vitest";
import {
  executeTransferRun,
  executeOffloadRun,
} from "./transferRun";

describe("Transfer RunNo Backend Resource & Validation Logic", () => {
  it("rejects Transfer mode when required fields are missing", async () => {
    const res = await executeTransferRun({
      sourceManifestNo: "",
      destinationManifestNo: "DEST-101",
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Source Manifest No is required");
  });

  it("rejects Transfer mode when source and destination manifests are the same", async () => {
    const res = await executeTransferRun({
      sourceManifestNo: "MAN-1001",
      destinationManifestNo: "MAN-1001",
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Source and Destination manifest cannot be the same");
  });

  it("rejects Transfer mode when original bag is selected but empty", async () => {
    const res = await executeTransferRun({
      sourceManifestNo: "MAN-1001",
      destinationManifestNo: "MAN-1002",
      useOriginalBag: true,
      originalBagNo: "",
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Original Bag No is required when selected");
  });

  it("rejects Off Load mode when Bag No is missing", async () => {
    const res = await executeOffloadRun({
      sourceManifestNo: "MAN-1001",
      bagNo: "",
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Bag No is required");
  });
});
