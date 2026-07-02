import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as conversations from '../services/conversations.js';
import * as usage from '../services/usage.js';
import * as users from '../services/users.js';
import { config } from '../config.js';

export const conversationsRouter = express.Router();

conversationsRouter.use(requireAuth);

// List the current user's conversations + their live budget/usage.
conversationsRouter.get('/conversations', (req, res) => {
  res.json({
    conversations: conversations.listForUser(req.user.id),
    usage: usage.getTodayUsage(req.user.id),
    limits: users.effectiveBudget(users.findById(req.user.id)),
  });
});

conversationsRouter.post('/conversations', (req, res) => {
  const { model, title } = req.body || {};
  const chosen = config.availableModels.includes(model) ? model : config.defaultModel;
  const conv = conversations.create(req.user.id, { model: chosen, title });
  res.status(201).json(conv);
});

conversationsRouter.get('/conversations/:id', (req, res) => {
  const conv = conversations.get(req.user.id, req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found.' });
  res.json(conv);
});

conversationsRouter.patch('/conversations/:id', (req, res) => {
  const { title } = req.body || {};
  const conv = conversations.rename(req.user.id, req.params.id, title);
  if (!conv) return res.status(404).json({ error: 'Conversation not found.' });
  res.json(conv);
});

conversationsRouter.delete('/conversations/:id', (req, res) => {
  const ok = conversations.remove(req.user.id, req.params.id);
  if (!ok) return res.status(404).json({ error: 'Conversation not found.' });
  res.json({ ok: true });
});
