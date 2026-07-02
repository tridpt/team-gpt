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

test('logout clears the session', async () => {
  await req('/api/auth/logout', { method: 'POST' });
  cookie = ''; // server also cleared it; drop our copy
  const me = await req('/api/auth/me');
  assert.equal(me.status, 401);
});
