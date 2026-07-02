import crypto from 'node:crypto';
import path from 'node:path';
import { config } from '../config.js';
import { JsonStore } from '../store/jsonStore.js';

/**
 * Server-side sessions. A session id is a 256-bit random token stored as an
 * httpOnly cookie; the server looks it up here. Expired sessions are pruned
 * lazily on access and on creation.
 */
const store = new JsonStore(path.join(config.dataDir, 'sessions.json'), { sessions: {} });

function prune() {
  const now = Date.now();
  let changed = false;
  for (const [id, s] of Object.entries(store.data.sessions)) {
    if (s.expiresAt <= now) {
      delete store.data.sessions[id];
      changed = true;
    }
  }
  if (changed) store.flush();
}

export function createSession(userId) {
  prune();
  const id = crypto.randomBytes(32).toString('hex');
  store.update((d) => {
    d.sessions[id] = { userId, expiresAt: Date.now() + config.sessionTtlMs };
  });
  return id;
}

export function getSession(id) {
  if (!id) return null;
  const s = store.data.sessions[id];
  if (!s) return null;
  if (s.expiresAt <= Date.now()) {
    destroySession(id);
    return null;
  }
  return s;
}

export function destroySession(id) {
  if (!id) return;
  store.update((d) => {
    delete d.sessions[id];
  });
}

/** Remove every session for a user (e.g. when disabled or deleted). */
export function destroyUserSessions(userId) {
  store.update((d) => {
    for (const [id, s] of Object.entries(d.sessions)) {
      if (s.userId === userId) delete d.sessions[id];
    }
  });
}
