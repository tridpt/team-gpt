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

  _isExpired(rec, t) {
    if (rec.lockedUntil) return rec.lockedUntil <= t;
    return t - rec.first > this.windowMs;
  }

  _prune(t) {
    for (const [k, rec] of this.entries) {
      if (this._isExpired(rec, t)) {
        this.entries.delete(k);
      }
    }
  }

  /** @returns {{ allowed: boolean, retryAfterSeconds?: number }} */
  check(key) {
    const t = this.now();
    this._prune(t);
    const rec = this.entries.get(key);
    if (rec && rec.lockedUntil > t) {
      return { allowed: false, retryAfterSeconds: Math.ceil((rec.lockedUntil - t) / 1000) };
    }
    return { allowed: true };
  }

  /** Record a failed attempt; may transition the key into a locked state. */
  recordFailure(key) {
    const t = this.now();
    this._prune(t);
    const rec = this.entries.get(key) || { count: 0, first: t, lockedUntil: 0 };
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
