import { describe, expect, it, beforeEach } from "vitest";

import { resetRateLimits, takeRateLimit } from "./rate-limit";

describe("takeRateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("allows calls inside the window and blocks the next one", () => {
    expect(takeRateLimit("login", 2, 60_000, 1_000).ok).toBe(true);
    expect(takeRateLimit("login", 2, 60_000, 1_100).ok).toBe(true);
    const blocked = takeRateLimit("login", 2, 60_000, 1_200);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("does not share buckets across keys", () => {
    expect(takeRateLimit("a", 1, 60_000, 5_000).ok).toBe(true);
    expect(takeRateLimit("b", 1, 60_000, 5_000).ok).toBe(true);
  });
});
