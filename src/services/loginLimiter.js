/**
 * In-memory brute-force protection for the login endpoint.
 *
 * Failures are counted per key (typically `ip:email`) inside a sliding window.
 * Once the count reaches `maxAttempts`, the key is locked for `lockoutMs`.
 * A successful login clears the key. State is in-memory, so it resets on
 * restart and is per-process (fine for a single-instance self-hosted deploy;
 * move to Redis if you run multiple instances).
 */
export class LoginLimiter {
  constructor(
    { maxAttempts = 5, windowMs = 15 * 60 * 1000, lockoutMs = 15 * 60 * 1000 } = {},
    { now = () => Date.now() } = {},
  ) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.lockoutMs = lockoutMs;
    this.now = now;
    this.entries = new Map(); // key -> { count, first, lockedUntil }
  }

  /** @returns {{ allowed: boolean, retryAfterSeconds?: number }} */
  check(key) {
    const rec = this.entries.get(key);
    const t = this.now();
    if (rec && rec.lockedUntil > t) {
      return { allowed: false, retryAfterSeconds: Math.ceil((rec.lockedUntil - t) / 1000) };
    }
    return { allowed: true };
  }

  /** Record a failed attempt; may transition the key into a locked state. */
  recordFailure(key) {
    const t = this.now();
    let rec = this.entries.get(key);
    // Start a fresh window if none exists, the window elapsed, or a lock expired.
    if (!rec || t - rec.first > this.windowMs || (rec.lockedUntil && rec.lockedUntil <= t)) {
      rec = { count: 0, first: t, lockedUntil: 0 };
    }
    rec.count += 1;
    if (rec.count >= this.maxAttempts) {
      rec.lockedUntil = t + this.lockoutMs;
    }
    this.entries.set(key, rec);
  }

  /** Clear all failure state for a key (call on successful login). */
  recordSuccess(key) {
    this.entries.delete(key);
  }
}
