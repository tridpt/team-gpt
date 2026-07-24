import test from 'node:test';
import assert from 'node:assert/strict';
import { record, checkBudget, getUserUsage, getTodayUsage } from '../src/services/usage.js';

// Each test uses a distinct user id: the store is a per-file singleton, so
// isolating by id keeps tests independent within this process.

test('records usage against today and all-time totals', () => {
  record('u-record', { inputTokens: 10, outputTokens: 5, costUsd: 0.002 });
  record('u-record', { inputTokens: 20, outputTokens: 5, costUsd: 0.003 });

  const usage = getUserUsage('u-record');
  assert.equal(usage.today.requests, 2);
  assert.equal(usage.today.inputTokens, 30);
  assert.equal(usage.today.outputTokens, 10);
  assert.equal(usage.today.costUsd, 0.005);
  assert.equal(usage.totals.requests, 2);
  assert.equal(usage.totals.costUsd, 0.005);
});

test('allows requests under the limits', () => {
  const res = checkBudget('u-under', { dailyRequests: 5, dailyCostUsd: 1 });
  assert.equal(res.allowed, true);
});

test('blocks when the daily request limit is reached', () => {
  for (let i = 0; i < 3; i++) record('u-req', { inputTokens: 1, outputTokens: 1, costUsd: 0 });
  const res = checkBudget('u-req', { dailyRequests: 3, dailyCostUsd: null });
  assert.equal(res.allowed, false);
  assert.match(res.reason, /request limit/i);
});

test('blocks when the daily cost budget is reached', () => {
  record('u-cost', { inputTokens: 1, outputTokens: 1, costUsd: 0.5 });
  const res = checkBudget('u-cost', { dailyRequests: null, dailyCostUsd: 0.5 });
  assert.equal(res.allowed, false);
  assert.match(res.reason, /cost budget/i);
});

test('null limits mean unlimited', () => {
  for (let i = 0; i < 50; i++)
    record('u-unlimited', { inputTokens: 1, outputTokens: 1, costUsd: 1 });
  const res = checkBudget('u-unlimited', { dailyRequests: null, dailyCostUsd: null });
  assert.equal(res.allowed, true);
});

test('getTodayUsage reports a rounded cost and a UTC date', () => {
  const u = getTodayUsage('u-today');
  assert.equal(u.requests, 0);
  assert.match(u.date, /^\d{4}-\d{2}-\d{2}$/);
});
