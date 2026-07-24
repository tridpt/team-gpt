import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createUser,
  authenticate,
  findByEmail,
  updateUser,
  deleteUser,
  effectiveBudget,
} from '../src/services/users.js';

test('createUser normalizes the email and hides the password hash', () => {
  const u = createUser({ email: '  Alice@Example.COM ', password: 'secret1', name: 'Alice' });
  assert.equal(u.email, 'alice@example.com');
  assert.equal(u.role, 'member');
  assert.equal(u.passwordHash, undefined);
  assert.ok(u.id);
});

test('createUser rejects bad email and short passwords', () => {
  assert.throws(() => createUser({ email: 'nope', password: 'secret1' }), /valid email/i);
  assert.throws(() => createUser({ email: 'a@b.com', password: '123' }), /6 characters/i);
});

test('createUser rejects duplicate emails', () => {
  createUser({ email: 'dup@example.com', password: 'secret1' });
  assert.throws(
    () => createUser({ email: 'dup@example.com', password: 'secret1' }),
    /already exists/i,
  );
});

test('authenticate succeeds with correct creds and fails otherwise', () => {
  createUser({ email: 'bob@example.com', password: 'hunter2' });
  assert.ok(authenticate('bob@example.com', 'hunter2'));
  assert.equal(authenticate('bob@example.com', 'wrong'), null);
  assert.equal(authenticate('missing@example.com', 'hunter2'), null);
});

test('disabled users cannot authenticate', () => {
  const u = createUser({ email: 'carol@example.com', password: 'hunter2' });
  updateUser(u.id, { disabled: true });
  assert.equal(authenticate('carol@example.com', 'hunter2'), null);
});

test('updateUser can change the password', () => {
  const u = createUser({ email: 'dave@example.com', password: 'oldpass' });
  updateUser(u.id, { password: 'newpass1' });
  assert.equal(authenticate('dave@example.com', 'oldpass'), null);
  assert.ok(authenticate('dave@example.com', 'newpass1'));
});

test('createUser stores an optional default model; updateUser can change it', () => {
  const u = createUser({
    email: 'fdefault@example.com',
    password: 'secret1',
    defaultModel: 'gpt-4o-mini',
  });
  assert.equal(u.defaultModel, 'gpt-4o-mini');
  updateUser(u.id, { defaultModel: 'mock-gpt' });
  assert.equal(findByEmail('fdefault@example.com').defaultModel, 'mock-gpt');
  updateUser(u.id, { defaultModel: null });
  assert.equal(findByEmail('fdefault@example.com').defaultModel, null);
});

test('effectiveBudget falls back to defaults for null overrides', () => {
  const u = findByEmail('bob@example.com');
  const budget = effectiveBudget(u);
  // Test config leaves defaults unset (null) -> unlimited.
  assert.equal(budget.dailyRequests, null);
  assert.equal(budget.dailyCostUsd, null);
});

test('effectiveBudget uses per-user overrides when present', () => {
  const u = createUser({
    email: 'erin@example.com',
    password: 'hunter2',
    budget: { dailyRequests: 42, dailyCostUsd: 3.5 },
  });
  const full = findByEmail('erin@example.com');
  assert.equal(effectiveBudget(full).dailyRequests, 42);
  assert.equal(effectiveBudget(full).dailyCostUsd, 3.5);
  deleteUser(u.id);
  assert.equal(findByEmail('erin@example.com'), null);
});
