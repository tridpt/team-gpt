import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

/**
 * Minimal .env loader (no external dependency). Only sets variables that are
 * not already present in process.env, so real env vars always win.
 */
function loadEnvFile() {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) return;

  for (const rawLine of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile();

const int = (v, fallback) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

const list = (v) =>
  (v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

// Optional numeric: undefined/empty -> null (meaning "unlimited"), else number.
const optNum = (v) => {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const bool = (v, fallback = false) =>
  v === undefined || v === '' ? fallback : /^(1|true|yes|on)$/i.test(String(v));

export const config = {
  rootDir,
  port: int(process.env.PORT, 4000),
  dataDir: path.resolve(rootDir, process.env.DATA_DIR || './data'),
  sessionTtlMs: int(process.env.SESSION_TTL_HOURS, 168) * 3600 * 1000,

  gateway: {
    url: (process.env.GATEWAY_URL || 'http://localhost:8080').replace(/\/+$/, ''),
    apiKey: process.env.GATEWAY_API_KEY || '',
  },

  // Send the session cookie only over HTTPS. Enable in production (behind TLS).
  cookieSecure: bool(process.env.COOKIE_SECURE, false),

  // Brute-force protection for the login endpoint.
  loginLimit: {
    maxAttempts: int(process.env.LOGIN_MAX_ATTEMPTS, 5),
    windowMs: int(process.env.LOGIN_WINDOW_MINUTES, 15) * 60 * 1000,
    lockoutMs: int(process.env.LOGIN_LOCKOUT_MINUTES, 15) * 60 * 1000,
  },

  defaultModel: process.env.DEFAULT_MODEL || 'gpt-4o-mini',
  availableModels: list(process.env.AVAILABLE_MODELS).length
    ? list(process.env.AVAILABLE_MODELS)
    : ['gpt-4o-mini', 'mock-gpt'],

  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@example.com',
    password: process.env.ADMIN_PASSWORD || 'change-me-now',
  },

  defaultBudget: {
    dailyRequests: optNum(process.env.DEFAULT_DAILY_REQUESTS),
    dailyCostUsd: optNum(process.env.DEFAULT_DAILY_COST_USD),
  },
};
