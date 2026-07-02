import test from 'node:test';
import assert from 'node:assert/strict';
import {
  create,
  get,
  addMessage,
  listForUser,
  contextMessages,
  rename,
  remove,
} from '../src/services/conversations.js';

test('create makes a conversation owned by the user', () => {
  const c = create('user-a', { model: 'mock-gpt' });
  assert.ok(c.id);
  assert.equal(c.userId, 'user-a');
  assert.equal(c.model, 'mock-gpt');
  assert.deepEqual(c.messages, []);
});

test('get enforces ownership', () => {
  const c = create('owner', {});
  assert.ok(get('owner', c.id));
  assert.equal(get('someone-else', c.id), null);
});

test('the first user message becomes the title', () => {
  const c = create('titler', {});
  addMessage('titler', c.id, { role: 'user', content: 'How do I center a div?' });
  assert.equal(get('titler', c.id).title, 'How do I center a div?');

  // A later user message does not overwrite the title.
  addMessage('titler', c.id, { role: 'assistant', content: 'Use flexbox.' });
  addMessage('titler', c.id, { role: 'user', content: 'And vertically?' });
  assert.equal(get('titler', c.id).title, 'How do I center a div?');
});

test('long titles are truncated with an ellipsis', () => {
  const c = create('trunc', {});
  const long = 'x'.repeat(200);
  addMessage('trunc', c.id, { role: 'user', content: long });
  const title = get('trunc', c.id).title;
  assert.ok(title.length <= 60);
  assert.ok(title.endsWith('...'));
});

test('contextMessages caps history and keeps only role + content', () => {
  const c = create('ctx', {});
  for (let i = 0; i < 30; i++) {
    addMessage('ctx', c.id, { role: i % 2 ? 'assistant' : 'user', content: `m${i}` });
  }
  const ctx = contextMessages(get('ctx', c.id));
  assert.equal(ctx.length, 20);
  assert.deepEqual(Object.keys(ctx[0]).sort(), ['content', 'role']);
  assert.equal(ctx[ctx.length - 1].content, 'm29');
});

test('listForUser returns metadata with a message count, most-recent first', () => {
  const older = create('lister', {});
  addMessage('lister', older.id, { role: 'user', content: 'first' });
  const newer = create('lister', {});
  addMessage('lister', newer.id, { role: 'user', content: 'second' });

  const list = listForUser('lister');
  assert.equal(list[0].id, newer.id);
  assert.equal(list[0].messageCount, 1);
  assert.equal(list[0].messages, undefined);
});

test('rename and remove enforce ownership', () => {
  const c = create('rm', {});
  assert.equal(rename('intruder', c.id, 'x'), null);
  assert.ok(rename('rm', c.id, 'Renamed'));
  assert.equal(get('rm', c.id).title, 'Renamed');

  assert.equal(remove('intruder', c.id), false);
  assert.equal(remove('rm', c.id), true);
  assert.equal(get('rm', c.id), null);
});
