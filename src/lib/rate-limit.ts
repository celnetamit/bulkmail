/**
 * Lightweight in-process fixed-window rate limiter.
 *
 * This is intentionally simple and per-process: counters live in memory and
 * reset on restart, and they are NOT shared across multiple instances. It is
 * defense-in-depth to stop a single key (e.g. one tracking/unsubscribe URL)
 * from being hammered — it is NOT a substitute for an edge/WAF rate limiter for
 * volumetric DoS, which should be configured at the proxy/CDN layer.
 *
 * Public, token-based endpoints should key by the validated token's stable
 * identity (e.g. campaign+contact) rather than by client IP, because legitimate
 * opens are frequently proxied through a small set of provider IPs (Gmail image
 * proxy, corporate NAT), so IP-based limiting would suppress real traffic.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 50_000;

export type RateLimitResult = { allowed: boolean; retryAfterMs: number };

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    // Opportunistic cleanup of expired buckets to bound memory.
    if (buckets.size >= MAX_BUCKETS) {
      buckets.forEach((existingBucket, existingKey) => {
        if (existingBucket.resetAt <= now) buckets.delete(existingKey);
      });
    }
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return { allowed: false, retryAfterMs: Math.max(0, bucket.resetAt - now) };
  }
  return { allowed: true, retryAfterMs: 0 };
}
