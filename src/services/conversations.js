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
  const t = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
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

export function create(userId, { model, title, systemPrompt } = {}) {
  const now = new Date().toISOString();
  const conv = {
    id: crypto.randomUUID(),
    userId,
    title: title || 'New chat',
    model: model || config.defaultModel,
    systemPrompt: systemPrompt ? String(systemPrompt) : '',
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
  const history = conv.messages
    .slice(-MAX_CONTEXT_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content }));
  const sp = conv.systemPrompt && String(conv.systemPrompt).trim();
  return sp ? [{ role: 'system', content: conv.systemPrompt }, ...history] : history;
}

/** Search a user's conversations by title or message content (case-insensitive). */
export function searchForUser(userId, query) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return listForUser(userId);
  return Object.values(store.data.conversations)
    .filter((c) => c.userId === userId)
    .filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some((m) => String(m.content).toLowerCase().includes(q)),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(({ messages, ...meta }) => ({ ...meta, messageCount: messages.length }));
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

/** Change the model used for future messages in a conversation. */
export function setModel(userId, id, model) {
  return store.update((d) => {
    const c = d.conversations[id];
    if (!c || c.userId !== userId) return null;
    c.model = model;
    c.updatedAt = new Date().toISOString();
    return c;
  });
}

/** Set (or clear) the system prompt sent ahead of the conversation history. */
export function setSystemPrompt(userId, id, systemPrompt) {
  return store.update((d) => {
    const c = d.conversations[id];
    if (!c || c.userId !== userId) return null;
    c.systemPrompt = systemPrompt ? String(systemPrompt) : '';
    c.updatedAt = new Date().toISOString();
    return c;
  });
}

/**
 * Prepare a conversation for regeneration: drop any trailing assistant
 * message(s) so the thread ends on the user's prompt. Optionally replace that
 * last user message (edit-and-resend). Returns the conversation, or null if
 * there is no user message to regenerate from.
 */
export function prepareRegenerate(userId, id, newContent) {
  return store.update((d) => {
    const c = d.conversations[id];
    if (!c || c.userId !== userId) return null;

    while (c.messages.length && c.messages[c.messages.length - 1].role === 'assistant') {
      c.messages.pop();
    }
    const last = c.messages[c.messages.length - 1];
    if (!last || last.role !== 'user') return null;

    if (newContent != null && String(newContent).trim()) {
      last.content = String(newContent).trim();
      last.ts = new Date().toISOString();
      if (c.messages.filter((m) => m.role === 'user').length === 1) {
        c.title = summarizeTitle(last.content);
      }
    }
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
