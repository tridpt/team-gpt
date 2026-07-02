import test from 'node:test';
import assert from 'node:assert/strict';
import { LoginLimiter } from '../src/services/loginLimiter.js';

const opts = { maxAttempts: 3, windowMs: 10_000, lockoutMs: 30_000 };

test('allows attempts until the limit is reached', () => {
  const l = new LoginLimiter(opts);
  assert.equal(l.check('k').allowed, true);
  l.recordFailure('k');
  l.recordFailure('k');
  assert.equal(l.check('k').allowed, true); // 2 failures, still under 3
});

test('locks the key after maxAttempts failures', () => {
  const l = new LoginLimiter(opts);
  for (let i = 0; i < 3; i++) l.recordFailure('k');
  const res = l.check('k');
  assert.equal(res.allowed, false);
  assert.ok(res.retryAfterSeconds > 0 && res.retryAfterSeconds <= 30);
});

test('success clears the failure state', () => {
  const l = new LoginLimiter(opts);
  for (let i = 0; i < 3; i++) l.recordFailure('k');
  assert.equal(l.check('k').allowed, false);
  l.recordSuccess('k');
  assert.equal(l.check('k').allowed, true);
});

test('the lock expires after lockoutMs', () => {
  let t = 1000;
  const l = new LoginLimiter(opts, { now: () => t });
  for (let i = 0; i < 3; i++) l.recordFailure('k');
  assert.equal(l.check('k').allowed, false);
  t += 30_001; // past the lockout
  assert.equal(l.check('k').allowed, true);
});

test('failures outside the window start a fresh count', () => {
  let t = 1000;
  const l = new LoginLimiter(opts, { now: () => t });
  l.recordFailure('k');
  l.recordFailure('k');
  t += 10_001; // window elapsed
  l.recordFailure('k'); // counts as the first of a new window
  assert.equal(l.check('k').allowed, true);
});

test('keys are tracked independently', () => {
  const l = new LoginLimiter(opts);
  for (let i = 0; i < 3; i++) l.recordFailure('a');
  assert.equal(l.check('a').allowed, false);
  assert.equal(l.check('b').allowed, true);
});
