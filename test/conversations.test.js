import test from 'node:test';
import assert from 'node:assert/strict';
import {
  create,
  get,
  addMessage,
  listForUser,
  contextMessages,
  rename,
  setModel,
  setSystemPrompt,
  searchForUser,
  prepareRegenerate,
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

test('setModel changes the model and enforces ownership', () => {
  const c = create('modeler', { model: 'mock-gpt' });
  assert.equal(setModel('intruder', c.id, 'gpt-4o-mini'), null);
  const updated = setModel('modeler', c.id, 'gpt-4o-mini');
  assert.equal(updated.model, 'gpt-4o-mini');
  assert.equal(get('modeler', c.id).model, 'gpt-4o-mini');
});

test('a system prompt is prepended to the context', () => {
  const c = create('sp', { systemPrompt: 'Be terse.' });
  addMessage('sp', c.id, { role: 'user', content: 'hi' });
  const ctx = contextMessages(get('sp', c.id));
  assert.equal(ctx[0].role, 'system');
  assert.equal(ctx[0].content, 'Be terse.');
  assert.equal(ctx[1].role, 'user');
});

test('setSystemPrompt updates and can clear the prompt', () => {
  const c = create('sp2', {});
  setSystemPrompt('sp2', c.id, 'Answer in French.');
  assert.equal(get('sp2', c.id).systemPrompt, 'Answer in French.');
  setSystemPrompt('sp2', c.id, '');
  assert.equal(get('sp2', c.id).systemPrompt, '');
  // Cleared prompt is not prepended.
  addMessage('sp2', c.id, { role: 'user', content: 'hi' });
  assert.equal(contextMessages(get('sp2', c.id))[0].role, 'user');
});

test('searchForUser matches title and message content', () => {
  const a = create('searcher', { title: 'Deploy pipeline' }); // no messages → title kept
  const b = create('searcher', { title: 'Grocery list' });
  addMessage('searcher', b.id, { role: 'user', content: 'kubernetes rollout' });

  const byTitle = searchForUser('searcher', 'deploy');
  assert.ok(byTitle.some((c) => c.id === a.id));
  assert.ok(!byTitle.some((c) => c.id === b.id));

  const byContent = searchForUser('searcher', 'kubernetes');
  assert.ok(byContent.some((c) => c.id === b.id));

  // Empty query returns the full list.
  assert.equal(searchForUser('searcher', '').length, listForUser('searcher').length);
});

test('prepareRegenerate drops trailing assistant and can edit the last prompt', () => {
  const c = create('regen', {});
  addMessage('regen', c.id, { role: 'user', content: 'first' });
  addMessage('regen', c.id, { role: 'assistant', content: 'reply' });

  // Plain regenerate: assistant removed, ends on the user message.
  const prepared = prepareRegenerate('regen', c.id, undefined);
  assert.equal(prepared.messages.length, 1);
  assert.equal(prepared.messages[0].role, 'user');
  assert.equal(prepared.messages[0].content, 'first');

  // Edit-and-resend rewrites the last user message.
  addMessage('regen', c.id, { role: 'assistant', content: 'reply2' });
  const edited = prepareRegenerate('regen', c.id, 'first (edited)');
  assert.equal(edited.messages.length, 1);
  assert.equal(edited.messages[0].content, 'first (edited)');
});

test('prepareRegenerate returns null when there is no user message', () => {
  const c = create('regen-empty', {});
  assert.equal(prepareRegenerate('regen-empty', c.id, undefined), null);
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
