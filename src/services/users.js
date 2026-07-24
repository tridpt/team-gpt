import crypto from 'node:crypto';
import path from 'node:path';
import { config } from '../config.js';
import { JsonStore } from '../store/jsonStore.js';
import { hashPassword, verifyPassword } from './password.js';

/**
 * User accounts.
 *
 * A user has: id, email, name, role ('admin' | 'member'), passwordHash,
 * a per-user daily budget override (null fields fall back to defaults),
 * a disabled flag, and timestamps.
 */
const store = new JsonStore(path.join(config.dataDir, 'users.json'), { users: [] });

const normalizeEmail = (email) =>
  String(email || '')
    .trim()
    .toLowerCase();

function publicUser(u) {
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return rest;
}

export function listUsers() {
  return store.data.users.map(publicUser);
}

export function findById(id) {
  return store.data.users.find((u) => u.id === id) || null;
}

export function findByEmail(email) {
  const e = normalizeEmail(email);
  return store.data.users.find((u) => u.email === e) || null;
}

export function countUsers() {
  return store.data.users.length;
}

export function createUser({
  email,
  name,
  password,
  role = 'member',
  budget = {},
  defaultModel = null,
  groupId = null,
}) {
  const e = normalizeEmail(email);
  if (!e || !e.includes('@')) throw new Error('A valid email is required.');
  if (!password || password.length < 6) throw new Error('Password must be at least 6 characters.');
  if (findByEmail(e)) throw new Error('A user with that email already exists.');

  const user = {
    id: crypto.randomUUID(),
    email: e,
    name: (name || e.split('@')[0]).trim(),
    role: role === 'admin' ? 'admin' : 'member',
    passwordHash: hashPassword(password),
    budget: {
      dailyRequests: budget.dailyRequests ?? null,
      dailyCostUsd: budget.dailyCostUsd ?? null,
    },
    defaultModel: defaultModel || null,
    groupId: groupId || null,
    disabled: false,
    createdAt: new Date().toISOString(),
  };
  store.update((d) => d.users.push(user));
  return publicUser(user);
}

export function authenticate(email, password) {
  const user = findByEmail(email);
  if (!user || user.disabled) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  return publicUser(user);
}

export function updateUser(id, patch) {
  return store.update((d) => {
    const user = d.users.find((u) => u.id === id);
    if (!user) return null;

    if (patch.name !== undefined) user.name = String(patch.name).trim();
    if (patch.role !== undefined) user.role = patch.role === 'admin' ? 'admin' : 'member';
    if (patch.disabled !== undefined) user.disabled = Boolean(patch.disabled);
    if (patch.password) user.passwordHash = hashPassword(patch.password);
    if (patch.defaultModel !== undefined) user.defaultModel = patch.defaultModel || null;
    if (patch.groupId !== undefined) user.groupId = patch.groupId || null;
    if (patch.budget) {
      user.budget = {
        dailyRequests: patch.budget.dailyRequests ?? null,
        dailyCostUsd: patch.budget.dailyCostUsd ?? null,
      };
    }
    return publicUser(user);
  });
}

export function deleteUser(id) {
  return store.update((d) => {
    const idx = d.users.findIndex((u) => u.id === id);
    if (idx === -1) return false;
    d.users.splice(idx, 1);
    return true;
  });
}

/** Public users belonging to a group. */
export function membersOf(groupId) {
  return store.data.users.filter((u) => u.groupId === groupId).map(publicUser);
}

/** Remove a group assignment from every member (e.g. when a group is deleted). */
export function clearGroup(groupId) {
  store.update((d) => {
    for (const u of d.users) {
      if (u.groupId === groupId) u.groupId = null;
    }
  });
}

/** Resolve the effective daily budget for a user (personal override → default). */
export function effectiveBudget(user) {
  const b = user?.budget || {};
  return {
    dailyRequests: b.dailyRequests ?? config.defaultBudget.dailyRequests,
    dailyCostUsd: b.dailyCostUsd ?? config.defaultBudget.dailyCostUsd,
  };
}

/**
 * Resolve the effective default model for a user: the user's own default if it
 * is still a valid/available model, otherwise the global default.
 */
export function effectiveDefaultModel(user) {
  const m = user?.defaultModel;
  return m && config.availableModels.includes(m) ? m : config.defaultModel;
}

/** Create the seed admin from env if there are no users yet. */
export function ensureSeedAdmin() {
  if (countUsers() > 0) return null;
  const admin = createUser({
    email: config.admin.email,
    name: 'Admin',
    password: config.admin.password,
    role: 'admin',
  });
  return admin;
}
