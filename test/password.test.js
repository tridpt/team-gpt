import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/services/password.js';

test('hash then verify succeeds for the correct password', () => {
  const stored = hashPassword('correct horse battery');
  assert.ok(stored.startsWith('scrypt$'));
  assert.equal(verifyPassword('correct horse battery', stored), true);
});

test('verify fails for the wrong password', () => {
  const stored = hashPassword('secret');
  assert.equal(verifyPassword('nope', stored), false);
});

test('each hash uses a fresh salt', () => {
  const a = hashPassword('same');
  const b = hashPassword('same');
  assert.notEqual(a, b);
  assert.equal(verifyPassword('same', a), true);
  assert.equal(verifyPassword('same', b), true);
});

test('verify rejects malformed or non-scrypt stored values', () => {
  assert.equal(verifyPassword('x', null), false);
  assert.equal(verifyPassword('x', 'plaintext'), false);
  assert.equal(verifyPassword('x', 'bcrypt$1$aa$bb'), false);
});
