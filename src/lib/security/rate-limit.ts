type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  ok: boolean;
  retryAfterSec: number;
};

/**
 * Fixed-window counter keyed by caller + route.
 * Process-local: one app instance. Put a shared store in front before horizontal scale.
 */
export function takeRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  const windowStart = now - windowMs;
  const bucket = buckets.get(key) ?? { hits: [] };
  const hits = bucket.hits.filter((ts) => ts > windowStart);
  if (hits.length >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000));
    bucket.hits = hits;
    buckets.set(key, bucket);
    return { ok: false, retryAfterSec };
  }
  hits.push(now);
  bucket.hits = hits;
  buckets.set(key, bucket);
  return { ok: true, retryAfterSec: 0 };
}

export function resetRateLimits(): void {
  buckets.clear();
}

export function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
