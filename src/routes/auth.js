import express from 'express';
import { config } from '../config.js';
import * as users from '../services/users.js';
import { createSession, destroySession } from '../services/sessions.js';
import { SESSION_COOKIE, parseCookies, loadUser } from '../middleware/auth.js';

export const authRouter = express.Router();

function setSessionCookie(res, sessionId) {
  const maxAge = Math.floor(config.sessionTtlMs / 1000);
  res.cookie?.(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: config.sessionTtlMs,
  });
  // Fallback in case cookie helper isn't available.
  if (!res.cookie) {
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`);
  }
}

authRouter.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = users.authenticate(email, password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  const sessionId = createSession(user.id);
  setSessionCookie(res, sessionId);
  res.json({ user });
});

authRouter.post('/logout', (req, res) => {
  const cookies = parseCookies(req);
  destroySession(cookies[SESSION_COOKIE]);
  res.clearCookie?.(SESSION_COOKIE, { path: '/' });
  if (!res.clearCookie) {
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0`);
  }
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  const user = loadUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated.' });
  res.json({
    user,
    budget: users.effectiveBudget(users.findById(user.id)),
    config: { defaultModel: config.defaultModel, availableModels: config.availableModels },
  });
});
