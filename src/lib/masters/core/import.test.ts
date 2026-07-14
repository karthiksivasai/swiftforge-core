import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted so the vi.mock factory (which is itself hoisted) can close over it.
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

import { importMaster, importMasterChunked, IMPORT_MAX_ROWS } from "./import";

type RpcArgs = { p_master: string; p_mode: string; p_rows: unknown[] };

/** Default mock: every chunk reports 1 row error at its (chunk-local) row 1. */
function okWithOneError() {
  rpc.mockImplementation((_name: string, params: RpcArgs) => {
    const n = params.p_rows.length;
    return {
      data: {
        master: params.p_master,
        mode: params.p_mode,
        job_id: "job",
        total: n,
        ok: Math.max(0, n - 1),
        skipped: 0,
        error_count: n === 0 ? 0 : 1,
        errors: n === 0 ? [] : [{ row_no: 1, column_name: null, message: "bad" }],
      },
      error: null,
    };
  });
}

beforeEach(() => {
  rpc.mockReset();
});

describe("importMaster", () => {
  it("forwards master/mode/rows to the RPC and returns its payload", async () => {
    okWithOneError();
    const rows = [{ code: "IN" }];
    const res = await importMaster("countries", "VALIDATE", rows);
    expect(rpc).toHaveBeenCalledWith("import_master", {
      p_master: "countries",
      p_mode: "VALIDATE",
      p_rows: rows,
    });
    expect(res.total).toBe(1);
  });

  it("throws the DB error message", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "db down" } });
    await expect(importMaster("zones", "COMMIT", [{ code: "Z" }])).rejects.toThrow("db down");
  });

  it("rejects a batch larger than the row cap before calling the RPC", async () => {
    const rows = Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => ({ code: String(i) }));
    await expect(importMaster("pincodes", "COMMIT", rows)).rejects.toThrow(/exceeds/);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("importMasterChunked", () => {
  it("splits into chunks, aggregates counts, and rebases error row numbers", async () => {
    okWithOneError();
    const rows = Array.from({ length: 5 }, (_, i) => ({ code: String(i) }));

    const res = await importMasterChunked("states", "COMMIT", rows, { chunkSize: 2 });

    // 5 rows / chunkSize 2 -> 3 RPC calls (2, 2, 1)
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(res.total).toBe(5);
    expect(res.ok).toBe(2); // 1 + 1 + 0
    expect(res.error_count).toBe(3);
    // chunk-local row 1 rebased to global offsets 0, 2, 4 -> 1, 3, 5
    expect(res.errors.map((e) => e.row_no)).toEqual([1, 3, 5]);
    expect(res.job_ids).toEqual(["job", "job", "job"]);
    expect(res.job_id).toBe("job");
  });

  it("reports progress against the original file length", async () => {
    okWithOneError();
    const rows = Array.from({ length: 5 }, (_, i) => ({ code: String(i) }));
    const progress: Array<[number, number]> = [];

    await importMasterChunked("states", "VALIDATE", rows, {
      chunkSize: 2,
      onProgress: (done, total) => progress.push([done, total]),
    });

    expect(progress).toEqual([
      [2, 5],
      [4, 5],
      [5, 5],
    ]);
  });

  it("clamps an oversized chunk size to the row cap", async () => {
    okWithOneError();
    const rows = [{ code: "A" }, { code: "B" }];
    await importMasterChunked("zones", "COMMIT", rows, { chunkSize: 10_000_000 });
    // Everything fits in a single clamped chunk.
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
