import crypto from 'node:crypto';
import path from 'node:path';
import { config } from '../config.js';
import { JsonStore } from '../store/jsonStore.js';

/**
 * Per-user conversation history.
 *
 * Stored shape: { conversations: { [id]: { id, userId, title, model,
 * messages: [{ role, content, ts }], createdAt, updatedAt } } }.
 * Messages keep only role + content + timestamp — enough to replay context
 * to the gateway and render the thread.
 */
const store = new JsonStore(path.join(config.dataDir, 'conversations.json'), { conversations: {} });

const MAX_CONTEXT_MESSAGES = 20; // how much history to send upstream

function summarizeTitle(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > 60 ? `${t.slice(0, 57)}...` : t || 'New chat';
}

export function listForUser(userId) {
  return Object.values(store.data.conversations)
    .filter((c) => c.userId === userId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(({ messages, ...meta }) => ({ ...meta, messageCount: messages.length }));
}

export function get(userId, id) {
  const c = store.data.conversations[id];
  if (!c || c.userId !== userId) return null;
  return c;
}

export function create(userId, { model, title } = {}) {
  const now = new Date().toISOString();
  const conv = {
    id: crypto.randomUUID(),
    userId,
    title: title || 'New chat',
    model: model || config.defaultModel,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  store.update((d) => {
    d.conversations[conv.id] = conv;
  });
  return conv;
}

export function addMessage(userId, id, { role, content }) {
  return store.update((d) => {
    const c = d.conversations[id];
    if (!c || c.userId !== userId) return null;
    c.messages.push({ role, content, ts: new Date().toISOString() });
    c.updatedAt = new Date().toISOString();
    if (role === 'user' && c.messages.filter((m) => m.role === 'user').length === 1) {
      c.title = summarizeTitle(content);
    }
    return c;
  });
}

/** Recent messages formatted for the gateway (role + content only). */
export function contextMessages(conv) {
  return conv.messages
    .slice(-MAX_CONTEXT_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content }));
}

export function rename(userId, id, title) {
  return store.update((d) => {
    const c = d.conversations[id];
    if (!c || c.userId !== userId) return null;
    c.title = summarizeTitle(title);
    c.updatedAt = new Date().toISOString();
    return c;
  });
}

export function remove(userId, id) {
  return store.update((d) => {
    const c = d.conversations[id];
    if (!c || c.userId !== userId) return false;
    delete d.conversations[id];
    return true;
  });
}

export function removeForUser(userId) {
  store.update((d) => {
    for (const [id, c] of Object.entries(d.conversations)) {
      if (c.userId === userId) delete d.conversations[id];
    }
  });
}
