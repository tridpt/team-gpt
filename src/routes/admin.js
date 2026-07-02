import express from 'express';
import { config } from '../config.js';
import { requireAdmin } from '../middleware/auth.js';
import * as users from '../services/users.js';
import * as usage from '../services/usage.js';
import * as conversations from '../services/conversations.js';
import * as groups from '../services/groups.js';
import { destroyUserSessions } from '../services/sessions.js';

export const adminRouter = express.Router();

adminRouter.use(requireAdmin);

// All users with their effective budget + usage (today + all-time totals).
adminRouter.get('/users', (req, res) => {
  const rows = users.listUsers().map((u) => {
    const full = users.findById(u.id);
    const u2 = usage.getUserUsage(u.id);
    const group = full.groupId ? groups.get(full.groupId) : null;
    return {
      ...u,
      limits: users.effectiveBudget(full),
      groupName: group ? group.name : null,
      usage: { today: u2.today, totals: u2.totals },
    };
  });
  res.json({ users: rows, defaultBudget: config.defaultBudget });
});

adminRouter.post('/users', (req, res) => {
  try {
    const { email, name, password, role, budget, defaultModel, groupId } = req.body || {};
    if (groupId && !groups.get(groupId)) {
      return res.status(400).json({ error: 'Unknown group.' });
    }
    const user = users.createUser({ email, name, password, role, budget, defaultModel, groupId });
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

adminRouter.get('/users/:id', (req, res) => {
  const user = users.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const { passwordHash, ...safe } = user;
  res.json({ user: safe, limits: users.effectiveBudget(user), usage: usage.getUserUsage(user.id) });
});

adminRouter.patch('/users/:id', (req, res) => {
  const target = users.findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found.' });

  // Guard: don't let an admin demote or disable the last active admin.
  const patch = req.body || {};
  if (target.role === 'admin' && (patch.role === 'member' || patch.disabled === true)) {
    const activeAdmins = users.listUsers().filter((u) => u.role === 'admin' && !u.disabled);
    if (activeAdmins.length <= 1) {
      return res.status(400).json({ error: 'Cannot demote or disable the last active admin.' });
    }
  }

  if (patch.groupId !== undefined && patch.groupId && !groups.get(patch.groupId)) {
    return res.status(400).json({ error: 'Unknown group.' });
  }

  const updated = users.updateUser(req.params.id, patch);
  if (patch.disabled === true || patch.password) destroyUserSessions(req.params.id);
  res.json(updated);
});

adminRouter.delete('/users/:id', (req, res) => {
  const target = users.findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }
  users.deleteUser(req.params.id);
  usage.deleteUserUsage(req.params.id);
  conversations.removeForUser(req.params.id);
  destroyUserSessions(req.params.id);
  res.json({ ok: true });
});

// Proxy the upstream gateway's aggregate metrics (cost, providers, cache…).
adminRouter.get('/gateway-metrics', async (req, res) => {
  try {
    const r = await fetch(`${config.gateway.url}/admin/metrics`, {
      headers: { Authorization: `Bearer ${config.gateway.apiKey}` },
    });
    if (!r.ok) return res.status(r.status).json({ error: `Gateway returned ${r.status}` });
    res.json(await r.json());
  } catch (err) {
    res.status(502).json({ error: `Cannot reach gateway: ${err.message}` });
  }
});

// ── Groups (departments/teams) ────────────────────────────
// Each group has an optional shared daily budget. Listing includes the
// group's live combined usage (sum across members) for the dashboard.
adminRouter.get('/groups', (req, res) => {
  const rows = groups.list().map((g) => {
    const members = users.membersOf(g.id);
    const memberIds = members.map((m) => m.id);
    return {
      ...g,
      memberCount: members.length,
      usage: usage.sumTodayUsage(memberIds),
    };
  });
  res.json({ groups: rows });
});

adminRouter.post('/groups', (req, res) => {
  try {
    const { name, budget } = req.body || {};
    const group = groups.create({ name, budget });
    res.status(201).json(group);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

adminRouter.patch('/groups/:id', (req, res) => {
  const updated = groups.update(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Group not found.' });
  res.json(updated);
});

adminRouter.delete('/groups/:id', (req, res) => {
  const ok = groups.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Group not found.' });
  users.clearGroup(req.params.id); // unassign members so they fall back to personal limits
  res.json({ ok: true });
});
