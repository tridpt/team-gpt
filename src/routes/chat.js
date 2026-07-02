import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as users from '../services/users.js';
import * as conversations from '../services/conversations.js';
import * as usage from '../services/usage.js';
import { chatStream, GatewayError } from '../services/gateway.js';
import { estimateMessagesTokens, estimateTokens, computeCost } from '../services/cost.js';

export const chatRouter = express.Router();

/**
 * Send a message in a conversation and stream the assistant's reply.
 *
 * Response is Server-Sent Events:
 *   data: {"type":"delta","text":"..."}        (repeated)
 *   data: {"type":"done","usage":{...},"costUsd":n,"conversationId":id}
 *   data: [DONE]
 */
chatRouter.post('/conversations/:id/messages', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const { content } = req.body || {};

  if (!content || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'Message content is required.' });
  }

  const conv = conversations.get(userId, req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found.' });

  // ── Budget check (per-user, per-day) ──
  const limits = users.effectiveBudget(users.findById(userId));
  const budget = usage.checkBudget(userId, limits);
  if (!budget.allowed) {
    return res.status(429).json({ error: budget.reason, usage: budget.usage, limits });
  }

  // Persist the user's message, then build the context to send upstream.
  conversations.addMessage(userId, conv.id, { role: 'user', content: content.trim() });
  const fresh = conversations.get(userId, conv.id);
  const contextMessages = conversations.contextMessages(fresh);
  const model = fresh.model;

  // ── Open the SSE stream to the browser ──
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

  req.on('close', () => {
    controller.abort();
    cleanup();
  });

  try {
    const { fullText } = await chatStream(
      { model, messages: contextMessages, signal: controller.signal },
      (delta) => send({ type: 'delta', text: delta })
    );

    // Persist the assistant reply.
    conversations.addMessage(userId, conv.id, { role: 'assistant', content: fullText });

    // Estimate usage (the upstream stream doesn't return token counts).
    const inputTokens = estimateMessagesTokens(contextMessages);
    const outputTokens = estimateTokens(fullText);
    const costUsd = computeCost(model, inputTokens, outputTokens);
    usage.record(userId, { inputTokens, outputTokens, costUsd });

    send({
      type: 'done',
      conversationId: conv.id,
      usage: { inputTokens, outputTokens },
      costUsd,
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
});
