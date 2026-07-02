import crypto from 'node:crypto';
import path from 'node:path';
import { config } from '../config.js';
import { JsonStore } from '../store/jsonStore.js';

/**
 * Groups (a.k.a. departments/teams).
 *
 * A group has a name and an optional daily budget (requests + cost) that is
 * shared across all its members. A user belongs to zero or one group; group
 * budgets are enforced in addition to each user's own budget.
 */
const store = new JsonStore(path.join(config.dataDir, 'groups.json'), { groups: {} });

function normalizeBudget(budget = {}) {
  return {
    dailyRequests: budget.dailyRequests ?? null,
    dailyCostUsd: budget.dailyCostUsd ?? null,
  };
}

export function list() {
  return Object.values(store.data.groups).sort((a, b) => a.name.localeCompare(b.name));
}

export function get(id) {
  return store.data.groups[id] || null;
}

export function create({ name, budget = {} }) {
  const n = String(name || '').trim();
  if (!n) throw new Error('Group name is required.');
  const group = {
    id: crypto.randomUUID(),
    name: n,
    budget: normalizeBudget(budget),
    createdAt: new Date().toISOString(),
  };
  store.update((d) => {
    d.groups[group.id] = group;
  });
  return group;
}

export function update(id, patch) {
  return store.update((d) => {
    const g = d.groups[id];
    if (!g) return null;
    if (patch.name !== undefined) {
      const n = String(patch.name).trim();
      if (n) g.name = n;
    }
    if (patch.budget) g.budget = normalizeBudget(patch.budget);
    return g;
  });
}

export function remove(id) {
  return store.update((d) => {
    if (!d.groups[id]) return false;
    delete d.groups[id];
    return true;
  });
}
