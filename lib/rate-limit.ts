// Minimal in-memory sliding-window rate limiter. Good enough for a
// single-process monolith (v1); swap for a store-backed limiter if the app
// is ever scaled horizontally.
const buckets = new Map<string, number[]>();

/** Returns true when the call is allowed, false when the limit is exceeded. */
export function checkRateLimit(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();
  const attempts = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (attempts.length >= maxAttempts) {
    buckets.set(key, attempts);
    return false;
  }
  attempts.push(now);
  buckets.set(key, attempts);
  return true;
}
