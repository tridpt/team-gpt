import test from 'node:test';
import assert from 'node:assert/strict';
import * as groups from '../src/services/groups.js';
import * as users from '../src/services/users.js';
import * as usage from '../src/services/usage.js';

test('create requires a name and normalizes the budget', () => {
  assert.throws(() => groups.create({ name: '   ' }), /name is required/i);

  const g = groups.create({ name: 'Engineering', budget: { dailyRequests: 100 } });
  assert.equal(g.name, 'Engineering');
  assert.equal(g.budget.dailyRequests, 100);
  assert.equal(g.budget.dailyCostUsd, null); // missing field → null (unlimited)
  assert.ok(g.id);
});

test('update changes name and budget; remove deletes', () => {
  const g = groups.create({ name: 'Sales' });
  const updated = groups.update(g.id, { name: 'Sales EU', budget: { dailyCostUsd: 5 } });
  assert.equal(updated.name, 'Sales EU');
  assert.equal(updated.budget.dailyCostUsd, 5);

  assert.equal(groups.remove(g.id), true);
  assert.equal(groups.get(g.id), null);
  assert.equal(groups.remove(g.id), false);
});

test('deleting a group clears it from its members', () => {
  const g = groups.create({ name: 'Temp' });
  const u = users.createUser({
    email: `member-${Date.now()}@example.com`,
    password: 'secret123',
    groupId: g.id,
  });
  assert.equal(users.findById(u.id).groupId, g.id);

  users.clearGroup(g.id);
  assert.equal(users.findById(u.id).groupId, null);
});

test('sumTodayUsage aggregates across members', () => {
  const a = users.createUser({ email: `a-${Date.now()}@x.com`, password: 'secret123' });
  const b = users.createUser({ email: `b-${Date.now()}@x.com`, password: 'secret123' });
  usage.record(a.id, { inputTokens: 10, outputTokens: 5, costUsd: 0.01 });
  usage.record(b.id, { inputTokens: 20, outputTokens: 10, costUsd: 0.02 });

  const sum = usage.sumTodayUsage([a.id, b.id]);
  assert.equal(sum.requests, 2);
  assert.equal(Math.round(sum.costUsd * 100) / 100, 0.03);
});
