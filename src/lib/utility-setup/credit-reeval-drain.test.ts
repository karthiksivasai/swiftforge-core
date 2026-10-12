import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../supabase/migrations/0129_credit_limit_reeval_drain.sql",
  ),
  "utf8",
);

describe("credit-limit reevaluation drain", () => {
  it("keeps walking pending tenants until a batch returns nothing", () => {
    expect(sql).toContain("function app.drain_credit_limit_reeval_queues(");
    expect(sql).toContain("app.process_credit_limit_reeval_batch(");
    expect(sql).toContain("exit when v_moved = 0");
    expect(sql).toContain("where q.pending");
  });

  it("schedules the drain every minute", () => {
    expect(sql).toContain("credit-limit-reeval-drain");
    expect(sql).toContain("'* * * * *'");
    expect(sql).toContain("select app.drain_credit_limit_reeval_queues(200, 500)");
  });
});
