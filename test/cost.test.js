import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateTokens,
  estimateMessagesTokens,
  computeCost,
  PRICING,
} from '../src/services/cost.js';

test('estimateTokens uses the ~4 chars/token heuristic', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('abcde'), 2); // ceil(5/4)
});

test('estimateMessagesTokens sums content plus per-message overhead', () => {
  const messages = [
    { role: 'user', content: 'abcd' }, // 1 + 4
    { role: 'assistant', content: 'abcd' }, // 1 + 4
  ];
  assert.equal(estimateMessagesTokens(messages), 10);
});

test('estimateMessagesTokens handles non-string content', () => {
  const messages = [{ role: 'user', content: { foo: 'bar' } }];
  const expected = estimateTokens(JSON.stringify({ foo: 'bar' })) + 4;
  assert.equal(estimateMessagesTokens(messages), expected);
});

test('computeCost applies the per-model pricing table', () => {
  const p = PRICING['gpt-4o-mini'];
  const cost = computeCost('gpt-4o-mini', 1_000_000, 1_000_000);
  assert.equal(cost, p.input + p.output);
});

test('mock-gpt is free', () => {
  assert.equal(computeCost('mock-gpt', 1_000_000, 1_000_000), 0);
});

test('unknown models fall back to default pricing', () => {
  const cost = computeCost('totally-unknown-model', 1_000_000, 0);
  assert.equal(cost, 1); // DEFAULT_PRICING.input
});

test('prefix match picks up versioned model names', () => {
  const base = computeCost('gpt-4o', 1_000_000, 0);
  const versioned = computeCost('gpt-4o-2024-08-06', 1_000_000, 0);
  assert.equal(versioned, base);
});
