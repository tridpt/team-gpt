import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as conversations from '../services/conversations.js';
import * as usage from '../services/usage.js';
import * as users from '../services/users.js';
import { config } from '../config.js';

export const conversationsRouter = express.Router();

conversationsRouter.use(requireAuth);

// List the current user's conversations + their live budget/usage.
// Optional ?q= filters by title/content.
conversationsRouter.get('/conversations', (req, res) => {
  const q = req.query.q;
  const list = q
    ? conversations.searchForUser(req.user.id, q)
    : conversations.listForUser(req.user.id);
  res.json({
    conversations: list,
    usage: usage.getTodayUsage(req.user.id),
    limits: users.effectiveBudget(users.findById(req.user.id)),
  });
});

conversationsRouter.post('/conversations', (req, res) => {
  const { model, title, systemPrompt } = req.body || {};
  const chosen = config.availableModels.includes(model) ? model : config.defaultModel;
  const conv = conversations.create(req.user.id, { model: chosen, title, systemPrompt });
  res.status(201).json(conv);
});

conversationsRouter.get('/conversations/:id', (req, res) => {
  const conv = conversations.get(req.user.id, req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found.' });
  res.json(conv);
});

conversationsRouter.patch('/conversations/:id', (req, res) => {
  const { title, model, systemPrompt } = req.body || {};
  const id = req.params.id;

  if (model !== undefined && !config.availableModels.includes(model)) {
    return res.status(400).json({ error: 'Unknown model.' });
  }

  let conv = conversations.get(req.user.id, id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found.' });

  if (model !== undefined) conv = conversations.setModel(req.user.id, id, model);
  if (systemPrompt !== undefined) conv = conversations.setSystemPrompt(req.user.id, id, systemPrompt);
  if (title !== undefined) conv = conversations.rename(req.user.id, id, title);

  res.json(conv);
});

conversationsRouter.delete('/conversations/:id', (req, res) => {
  const ok = conversations.remove(req.user.id, req.params.id);
  if (!ok) return res.status(404).json({ error: 'Conversation not found.' });
  res.json({ ok: true });
});
