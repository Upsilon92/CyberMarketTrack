// Minimal in-memory sliding-window rate limiter. Good enough for a
// single-process monolith (v1); swap for a store-backed limiter if the app
// is ever scaled horizontally.
const buckets = new Map<string, number[]>();

export interface RateLimitResult {
  ok: boolean;
  /** Attempts still allowed in the current window (after this one). */
  remaining: number;
  /** When blocked: milliseconds until the next attempt is allowed. */
  retryAfterMs: number;
}

/** Record an attempt for `key` and tell whether it is allowed. */
export function hitRateLimit(key: string, maxAttempts: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const attempts = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (attempts.length >= maxAttempts) {
    buckets.set(key, attempts);
    // The oldest attempt in the window is the next one to expire.
    return { ok: false, remaining: 0, retryAfterMs: Math.max(0, attempts[0] + windowMs - now) };
  }
  attempts.push(now);
  buckets.set(key, attempts);
  return { ok: true, remaining: maxAttempts - attempts.length, retryAfterMs: 0 };
}

/** Returns true when the call is allowed, false when the limit is exceeded. */
export function checkRateLimit(key: string, maxAttempts: number, windowMs: number): boolean {
  return hitRateLimit(key, maxAttempts, windowMs).ok;
}

/** Forget the attempts of `key` (e.g. after a successful sign-in). */
export function resetRateLimit(key: string) {
  buckets.delete(key);
}
