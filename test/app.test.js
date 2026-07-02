import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/index.js';
import { ensureSeedAdmin } from '../src/services/users.js';

// Boot the app on an ephemeral port once for the whole file.
ensureSeedAdmin();
const server = createApp().listen(0);
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://localhost:${server.address().port}`;
test.after(() => server.close());

// Minimal cookie jar shared across requests.
let cookie = '';

async function req(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && cookie) headers.Cookie = cookie;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

test('health check is public', async () => {
  const r = await req('/health', { auth: false });
  assert.equal(r.status, 200);
  assert.equal(r.data.status, 'ok');
});

test('protected routes require authentication', async () => {
  const r = await req('/api/conversations', { auth: false });
  assert.equal(r.status, 401);
});

test('login rejects bad credentials', async () => {
  const r = await req('/api/auth/login', {
    method: 'POST',
    auth: false,
    body: { email: 'admin@example.com', password: 'wrong' },
  });
  assert.equal(r.status, 401);
});

test('seed admin can log in and read /me', async () => {
  const login = await req('/api/auth/login', {
    method: 'POST',
    auth: false,
    body: { email: 'admin@example.com', password: 'change-me-now' },
  });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.role, 'admin');
  assert.ok(cookie.startsWith('tg_session='));

  const me = await req('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.user.email, 'admin@example.com');
  assert.ok(Array.isArray(me.data.config.availableModels));
});

test('conversation CRUD round-trip', async () => {
  const created = await req('/api/conversations', { method: 'POST', body: { model: 'mock-gpt' } });
  assert.equal(created.status, 201);
  const id = created.data.id;

  const renamed = await req(`/api/conversations/${id}`, { method: 'PATCH', body: { title: 'Hello' } });
  assert.equal(renamed.data.title, 'Hello');

  const list = await req('/api/conversations');
  assert.ok(list.data.conversations.some((c) => c.id === id));

  const del = await req(`/api/conversations/${id}`, { method: 'DELETE' });
  assert.equal(del.data.ok, true);

  const gone = await req(`/api/conversations/${id}`);
  assert.equal(gone.status, 404);
});

test('unknown model falls back to the default', async () => {
  const created = await req('/api/conversations', { method: 'POST', body: { model: 'not-a-model' } });
  assert.equal(created.data.model, 'mock-gpt');
});

test('PATCH can change a conversation model and rejects unknown ones', async () => {
  const created = await req('/api/conversations', { method: 'POST', body: { model: 'mock-gpt' } });
  const id = created.data.id;

  const ok = await req(`/api/conversations/${id}`, { method: 'PATCH', body: { model: 'gpt-4o-mini' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.model, 'gpt-4o-mini');

  const bad = await req(`/api/conversations/${id}`, { method: 'PATCH', body: { model: 'nope' } });
  assert.equal(bad.status, 400);

  await req(`/api/conversations/${id}`, { method: 'DELETE' });
});

test('PATCH sets a system prompt and it persists', async () => {
  const created = await req('/api/conversations', { method: 'POST', body: { model: 'mock-gpt' } });
  const id = created.data.id;

  const patched = await req(`/api/conversations/${id}`, {
    method: 'PATCH',
    body: { systemPrompt: 'Answer briefly.' },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.data.systemPrompt, 'Answer briefly.');

  const fetched = await req(`/api/conversations/${id}`);
  assert.equal(fetched.data.systemPrompt, 'Answer briefly.');

  await req(`/api/conversations/${id}`, { method: 'DELETE' });
});

test('conversation search filters by title', async () => {
  const a = await req('/api/conversations', { method: 'POST', body: { title: 'Zebra safari notes' } });
  const b = await req('/api/conversations', { method: 'POST', body: { title: 'Tax paperwork' } });

  const found = await req('/api/conversations?q=zebra');
  assert.ok(found.data.conversations.some((c) => c.id === a.data.id));
  assert.ok(!found.data.conversations.some((c) => c.id === b.data.id));

  await req(`/api/conversations/${a.data.id}`, { method: 'DELETE' });
  await req(`/api/conversations/${b.data.id}`, { method: 'DELETE' });
});

test('regenerate returns 400 when there is nothing to regenerate', async () => {
  const created = await req('/api/conversations', { method: 'POST', body: { model: 'mock-gpt' } });
  const r = await req(`/api/conversations/${created.data.id}/regenerate`, { method: 'POST', body: {} });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /nothing to regenerate/i);
  await req(`/api/conversations/${created.data.id}`, { method: 'DELETE' });
});

test('admin can create, list, and delete a member', async () => {
  const create = await req('/api/admin/users', {
    method: 'POST',
    body: { email: 'member@example.com', password: 'secret1', role: 'member' },
  });
  assert.equal(create.status, 201);
  const memberId = create.data.id;

  const users = await req('/api/admin/users');
  assert.ok(users.data.users.some((u) => u.email === 'member@example.com'));

  const del = await req(`/api/admin/users/${memberId}`, { method: 'DELETE' });
  assert.equal(del.data.ok, true);
});

test('cannot disable or demote the last admin', async () => {
  const me = await req('/api/auth/me');
  const adminId = me.data.user.id;
  const r = await req(`/api/admin/users/${adminId}`, { method: 'PATCH', body: { disabled: true } });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /last active admin/i);
});

test('admin cannot delete their own account', async () => {
  const me = await req('/api/auth/me');
  const r = await req(`/api/admin/users/${me.data.user.id}`, { method: 'DELETE' });
  assert.equal(r.status, 400);
});

test('change-password rejects a wrong current password', async () => {
  const r = await req('/api/auth/change-password', {
    method: 'POST',
    body: { currentPassword: 'not-it', newPassword: 'brandnew1' },
  });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /current password/i);
});

test('change-password rejects a too-short new password', async () => {
  const r = await req('/api/auth/change-password', {
    method: 'POST',
    body: { currentPassword: 'change-me-now', newPassword: '123' },
  });
  assert.equal(r.status, 400);
});

test('change-password succeeds and keeps the session valid', async () => {
  const change = await req('/api/auth/change-password', {
    method: 'POST',
    body: { currentPassword: 'change-me-now', newPassword: 'brandnew1' },
  });
  assert.equal(change.status, 200);
  assert.equal(change.data.ok, true);

  // Fresh cookie was issued; the current session still works.
  const me = await req('/api/auth/me');
  assert.equal(me.status, 200);

  // Restore the original password so other assumptions hold.
  const back = await req('/api/auth/change-password', {
    method: 'POST',
    body: { currentPassword: 'brandnew1', newPassword: 'change-me-now' },
  });
  assert.equal(back.status, 200);
});

test('login locks out after too many failed attempts', async () => {
  // Use a distinct email so we do not lock the admin key used by other tests.
  const bad = { email: 'lockme@example.com', password: 'wrong' };
  let last;
  for (let i = 0; i < 5; i++) {
    last = await req('/api/auth/login', { method: 'POST', auth: false, body: bad });
    assert.equal(last.status, 401);
  }
  const locked = await req('/api/auth/login', { method: 'POST', auth: false, body: bad });
  assert.equal(locked.status, 429);
  assert.match(locked.data.error, /too many/i);
});

test('a per-user default model drives /me and new conversations', async () => {
  const me = await req('/api/auth/me');
  const adminId = me.data.user.id;

  await req(`/api/admin/users/${adminId}`, { method: 'PATCH', body: { defaultModel: 'gpt-4o-mini' } });

  const me2 = await req('/api/auth/me');
  assert.equal(me2.data.config.defaultModel, 'gpt-4o-mini');

  // A conversation created without a model picks up the user default.
  const conv = await req('/api/conversations', { method: 'POST', body: {} });
  assert.equal(conv.data.model, 'gpt-4o-mini');
  await req(`/api/conversations/${conv.data.id}`, { method: 'DELETE' });

  // Reset so later tests keep the global default.
  await req(`/api/admin/users/${adminId}`, { method: 'PATCH', body: { defaultModel: null } });
  const me3 = await req('/api/auth/me');
  assert.equal(me3.data.config.defaultModel, 'mock-gpt');
});

test('conversation list paginates with limit/offset and hasMore', async () => {
  const created = [];
  for (let i = 0; i < 3; i++) {
    const c = await req('/api/conversations', { method: 'POST', body: { title: `Page test ${i}` } });
    created.push(c.data.id);
  }

  const page1 = await req('/api/conversations?limit=2&offset=0');
  assert.equal(page1.data.conversations.length, 2);
  assert.equal(page1.data.hasMore, true);
  assert.ok(page1.data.total >= 3);

  const page2 = await req('/api/conversations?limit=2&offset=2');
  assert.ok(page2.data.conversations.length >= 1);

  // No pagination params → full list, hasMore false.
  const all = await req('/api/conversations');
  assert.equal(all.data.hasMore, false);

  for (const id of created) await req(`/api/conversations/${id}`, { method: 'DELETE' });
});

test('logout clears the session', async () => {
  await req('/api/auth/logout', { method: 'POST' });
  cookie = ''; // server also cleared it; drop our copy
  const me = await req('/api/auth/me');
  assert.equal(me.status, 401);
});
