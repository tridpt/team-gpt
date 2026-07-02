import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as users from '../services/users.js';
import * as conversations from '../services/conversations.js';
import * as usage from '../services/usage.js';
import * as groups from '../services/groups.js';
import { chatStream, GatewayError } from '../services/gateway.js';
import { estimateMessagesTokens, estimateTokens, computeCost } from '../services/cost.js';

export const chatRouter = express.Router();

/**
 * Shared streaming core. Sends the conversation's context to the gateway and
 * streams the reply back as Server-Sent Events, then persists the assistant
 * message and records usage. Assumes `conv` already ends on the user turn.
 *
 * SSE frames:
 *   data: {"type":"delta","text":"..."}        (repeated)
 *   data: {"type":"done","usage":{...},"costUsd":n,"conversationId":id}
 *   data: [DONE]
 */
async function streamReply(req, res, userId, conv) {
  const contextMessages = conversations.contextMessages(conv);
  const model = conv.model;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  const controller = new AbortController();

  // Keep the connection alive through proxies during long generations. SSE
  // comment lines (starting with ':') are ignored by the client parser.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
  const cleanup = () => clearInterval(heartbeat);

  res.on('close', () => {
    // Fires when the connection closes. If the response hasn't finished, the
    // client disconnected mid-stream — abort the upstream call so we don't keep
    // generating a reply nobody will read. (Listening on `req` would fire as
    // soon as the request body is consumed, aborting immediately.)
    if (!res.writableEnded) controller.abort();
    cleanup();
  });

  try {
    const { fullText, usage: realUsage } = await chatStream(
      { model, messages: contextMessages, signal: controller.signal },
      (delta) => send({ type: 'delta', text: delta })
    );

    conversations.addMessage(userId, conv.id, { role: 'assistant', content: fullText });

    // Prefer the gateway's real token counts; fall back to an estimate if the
    // upstream stream didn't include usage.
    const inputTokens = realUsage?.inputTokens ?? estimateMessagesTokens(contextMessages);
    const outputTokens = realUsage?.outputTokens ?? estimateTokens(fullText);
    const costUsd = computeCost(model, inputTokens, outputTokens);
    usage.record(userId, { inputTokens, outputTokens, costUsd });

    send({
      type: 'done',
      conversationId: conv.id,
      usage: { inputTokens, outputTokens },
      costUsd,
      estimated: !realUsage,
    });
    res.write('data: [DONE]\n\n');
    cleanup();
    res.end();
  } catch (err) {
    cleanup();
    if (controller.signal.aborted) {
      // Client disconnected mid-stream; nothing more to send.
      return res.end();
    }
    const message = err instanceof GatewayError ? err.message : 'Failed to generate a reply.';
    if (!res.headersSent) {
      res.status(err.status || 502).json({ error: message });
    } else {
      send({ type: 'error', error: message });
      res.end();
    }
  }
}

function budgetGuard(req, res) {
  const full = users.findById(req.user.id);

  // 1) Per-user budget.
  const limits = users.effectiveBudget(full);
  const budget = usage.checkBudget(req.user.id, limits);
  if (!budget.allowed) {
    res.status(429).json({ error: budget.reason, usage: budget.usage, limits });
    return false;
  }

  // 2) Shared group budget (enforced in addition to the user's own).
  const group = full?.groupId ? groups.get(full.groupId) : null;
  if (group && (group.budget.dailyRequests != null || group.budget.dailyCostUsd != null)) {
    const memberIds = users.membersOf(group.id).map((u) => u.id);
    const groupUsage = usage.sumTodayUsage(memberIds);
    if (group.budget.dailyRequests != null && groupUsage.requests >= group.budget.dailyRequests) {
      res.status(429).json({
        error: `Group daily request limit reached (${group.budget.dailyRequests}/day for "${group.name}").`,
        usage: groupUsage,
        limits: group.budget,
      });
      return false;
    }
    if (group.budget.dailyCostUsd != null && groupUsage.costUsd >= group.budget.dailyCostUsd) {
      res.status(429).json({
        error: `Group daily cost budget reached ($${group.budget.dailyCostUsd}/day for "${group.name}").`,
        usage: groupUsage,
        limits: group.budget,
      });
      return false;
    }
  }

  return true;
}

/** Send a new message in a conversation and stream the assistant's reply. */
chatRouter.post('/conversations/:id/messages', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const { content } = req.body || {};

  if (!content || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'Message content is required.' });
  }

  const conv = conversations.get(userId, req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found.' });

  if (!budgetGuard(req, res)) return;

  conversations.addMessage(userId, conv.id, { role: 'user', content: content.trim() });
  const fresh = conversations.get(userId, conv.id);
  await streamReply(req, res, userId, fresh);
});

/**
 * Regenerate the last assistant reply. With an optional `content` field it
 * edits the last user message before regenerating (edit-and-resend).
 */
chatRouter.post('/conversations/:id/regenerate', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const { content } = req.body || {};

  const exists = conversations.get(userId, req.params.id);
  if (!exists) return res.status(404).json({ error: 'Conversation not found.' });

  if (!budgetGuard(req, res)) return;

  const conv = conversations.prepareRegenerate(userId, req.params.id, content);
  if (!conv) return res.status(400).json({ error: 'Nothing to regenerate.' });

  await streamReply(req, res, userId, conv);
});
