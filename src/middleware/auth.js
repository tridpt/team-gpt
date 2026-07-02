import { getSession } from '../services/sessions.js';
import { findById } from '../services/users.js';

export const SESSION_COOKIE = 'tg_session';

/** Parse the Cookie header into a plain object (no dependency). */
export function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) out[name] = decodeURIComponent(value);
  }
  return out;
}

/** Resolve the current user from the session cookie; attaches req.user. */
export function loadUser(req) {
  const cookies = parseCookies(req);
  const session = getSession(cookies[SESSION_COOKIE]);
  if (!session) return null;
  const user = findById(session.userId);
  if (!user || user.disabled) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

export function requireAuth(req, res, next) {
  const user = loadUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  const user = loadUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated.' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  req.user = user;
  next();
}
