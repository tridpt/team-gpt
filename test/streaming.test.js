import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/index.js';
import { ensureSeedAdmin } from '../src/services/users.js';
import { config } from '../src/config.js';

/**
 * End-to-end streaming regression test.
 *
 * A fake upstream gateway streams a canned OpenAI-style SSE reply, and we drive
 * the real TeamGPT app over HTTP, reading its SSE output. This exercises the
 * exact req/res lifecycle of the chat route — it would fail if the route
 * aborted the upstream call early (the `req.on('close')` bug), because no
 * deltas or `done` frame would ever arrive.
 */

const CHUNKS = ['Hello', ', ', 'world', '!'];
const FULL_REPLY = CHUNKS.join(''); // "Hello, world!"

// ── Fake gateway ──
const fakeGateway = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        fakeGateway.lastBody = JSON.parse(body);
      } catch {
        fakeGateway.lastBody = null;
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant' } }] })}\n\n`);
      let i = 0;
      const timer = setInterval(() => {
        if (i < CHUNKS.length) {
          res.write(
            `data: ${JSON.stringify({ choices: [{ delta: { content: CHUNKS[i] } }] })}\n\n`,
          );
          i += 1;
        } else {
          clearInterval(timer);
          if (!fakeGateway.suppressUsage && fakeGateway.lastBody?.stream_options?.include_usage) {
            res.write(
              `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 111, completion_tokens: 222, total_tokens: 333 } })}\n\n`,
            );
          }
          res.write('data: [DONE]\n\n');
          res.end();
        }
      }, 3);
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

await new Promise((resolve) => fakeGateway.listen(0, resolve));
config.gateway.url = `http://localhost:${fakeGateway.address().port}`;

// ── TeamGPT app ──
ensureSeedAdmin();
const server = createApp().listen(0);
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://localhost:${server.address().port}`;

test.after(() => {
  server.close();
  fakeGateway.close();
});

let cookie = '';

async function json(path, { method = 'GET', body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// Read a full SSE response into { text, done, error }.
async function stream(path, body) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  assert.equal(res.status, 200, 'streaming endpoint should return 200');
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let text = '';
  let done = null;
  let error = null;
  while (true) {
    const { value, done: finished } = await reader.read();
    if (finished) break;
    buf += dec.decode(value, { stream: true });
    let sep;
    while ((sep = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      for (const line of frame.split('\n')) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const p = t.slice(5).trim();
        if (p === '[DONE]') continue;
        const evt = JSON.parse(p);
        if (evt.type === 'delta') text += evt.text;
        else if (evt.type === 'done') done = evt;
        else if (evt.type === 'error') error = evt.error;
      }
    }
  }
  return { text, done, error };
}

// Log in once for the whole file.
const login = await json('/api/auth/login', {
  method: 'POST',
  body: { email: 'admin@example.com', password: 'change-me-now' },
});
assert.equal(login.status, 200);

let convId;

test('streams the reply, persists the assistant message, and records usage', async () => {
  const created = await json('/api/conversations', { method: 'POST', body: { model: 'mock-gpt' } });
  convId = created.data.id;

  const before = await json('/api/conversations');
  const reqBefore = before.data.usage.requests;

  const { text, done, error } = await stream(`/api/conversations/${convId}/messages`, {
    content: 'hi there',
  });
  assert.equal(error, null);
  assert.equal(text, FULL_REPLY, 'client should receive every streamed delta');
  assert.ok(done, 'a done frame must be sent');
  // Real usage from the gateway (not the local estimate).
  assert.equal(done.estimated, false);
  assert.equal(done.usage.inputTokens, 111);
  assert.equal(done.usage.outputTokens, 222);
  assert.equal(done.conversationId, convId);

  // Assistant reply persisted.
  const full = await json(`/api/conversations/${convId}`);
  assert.deepEqual(
    full.data.messages.map((m) => m.role),
    ['user', 'assistant'],
  );
  assert.equal(full.data.messages[1].content, FULL_REPLY);

  // Usage bumped.
  const after = await json('/api/conversations');
  assert.equal(after.data.usage.requests, reqBefore + 1);
});

test('regenerate replaces the last reply without duplicating messages', async () => {
  const { text, done } = await stream(`/api/conversations/${convId}/regenerate`, {});
  assert.equal(text, FULL_REPLY);
  assert.ok(done);

  const full = await json(`/api/conversations/${convId}`);
  // Still exactly one user + one assistant — the old assistant was replaced.
  assert.deepEqual(
    full.data.messages.map((m) => m.role),
    ['user', 'assistant'],
  );
});

test('regenerate with content edits the last user message', async () => {
  const { text } = await stream(`/api/conversations/${convId}/regenerate`, {
    content: 'a different question',
  });
  assert.equal(text, FULL_REPLY);

  const full = await json(`/api/conversations/${convId}`);
  assert.deepEqual(
    full.data.messages.map((m) => m.role),
    ['user', 'assistant'],
  );
  assert.equal(full.data.messages[0].content, 'a different question');
});

test('the system prompt is forwarded to the gateway', async () => {
  const created = await json('/api/conversations', { method: 'POST', body: { model: 'mock-gpt' } });
  const id = created.data.id;
  await json(`/api/conversations/${id}`, {
    method: 'PATCH',
    body: { systemPrompt: 'You are a pirate.' },
  });

  await stream(`/api/conversations/${id}/messages`, { content: 'ahoy' });

  const sent = fakeGateway.lastBody;
  assert.ok(sent, 'gateway should have received a request');
  assert.equal(sent.messages[0].role, 'system');
  assert.equal(sent.messages[0].content, 'You are a pirate.');
  assert.equal(sent.stream, true);
});

test('falls back to estimated usage when the gateway omits it', async () => {
  fakeGateway.suppressUsage = true;
  try {
    const created = await json('/api/conversations', {
      method: 'POST',
      body: { model: 'mock-gpt' },
    });
    const { text, done } = await stream(`/api/conversations/${created.data.id}/messages`, {
      content: 'hi',
    });
    assert.equal(text, FULL_REPLY);
    assert.equal(done.estimated, true);
    assert.ok(done.usage.outputTokens > 0);
  } finally {
    fakeGateway.suppressUsage = false;
  }
});

test('a gateway failure surfaces as an SSE error frame', async () => {
  // Headers are flushed before the upstream call, so an upstream failure comes
  // back as an in-stream error frame (HTTP 200), which the client handles.
  const goodUrl = config.gateway.url;
  config.gateway.url = 'http://127.0.0.1:1';
  try {
    const created = await json('/api/conversations', {
      method: 'POST',
      body: { model: 'mock-gpt' },
    });
    const { text, done, error } = await stream(`/api/conversations/${created.data.id}/messages`, {
      content: 'hi',
    });
    assert.equal(text, '');
    assert.equal(done, null);
    assert.ok(error, 'an error frame should be sent');
  } finally {
    config.gateway.url = goodUrl;
  }
});
