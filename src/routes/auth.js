import express from 'express';
import { config } from '../config.js';
import * as users from '../services/users.js';
import { createSession, destroySession, destroyUserSessions } from '../services/sessions.js';
import { LoginLimiter } from '../services/loginLimiter.js';
import { SESSION_COOKIE, parseCookies, loadUser } from '../middleware/auth.js';

export const authRouter = express.Router();

const loginLimiter = new LoginLimiter(config.loginLimit);

// Key failed logins by client IP + email so one attacker can't lock out
// everyone, and one victim account isn't trivially locked from every IP.
function limiterKey(req, email) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  return `${ip}:${String(email || '').trim().toLowerCase()}`;
}

function setSessionCookie(res, sessionId) {
  const maxAge = Math.floor(config.sessionTtlMs / 1000);
  res.cookie?.(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
    maxAge: config.sessionTtlMs,
  });
  // Fallback in case cookie helper isn't available.
  if (!res.cookie) {
    const secure = config.cookieSecure ? '; Secure' : '';
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE}=${sessionId}; HttpOnly; SameSite=Lax${secure}; Path=/; Max-Age=${maxAge}`
    );
  }
}

authRouter.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const key = limiterKey(req, email);

  const gate = loginLimiter.check(key);
  if (!gate.allowed) {
    res.setHeader('Retry-After', String(gate.retryAfterSeconds));
    return res.status(429).json({
      error: `Too many failed login attempts. Try again in ${gate.retryAfterSeconds} seconds.`,
    });
  }

  const user = users.authenticate(email, password);
  if (!user) {
    loginLimiter.recordFailure(key);
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  loginLimiter.recordSuccess(key);
  const sessionId = createSession(user.id);
  setSessionCookie(res, sessionId);
  res.json({ user });
});

authRouter.post('/change-password', (req, res) => {
  const current = loadUser(req);
  if (!current) return res.status(401).json({ error: 'Not authenticated.' });

  const { currentPassword, newPassword } = req.body || {};
  if (!users.authenticate(current.email, currentPassword)) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }

  users.updateUser(current.id, { password: newPassword });
  // Invalidate every existing session (including other devices), then issue a
  // fresh one so the current browser stays signed in.
  destroyUserSessions(current.id);
  const sessionId = createSession(current.id);
  setSessionCookie(res, sessionId);
  res.json({ ok: true });
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
  const effectiveDefault =
    user.defaultModel && config.availableModels.includes(user.defaultModel)
      ? user.defaultModel
      : config.defaultModel;
  res.json({
    user,
    budget: users.effectiveBudget(users.findById(user.id)),
    config: { defaultModel: effectiveDefault, availableModels: config.availableModels },
  });
});
